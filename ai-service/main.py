"""
URackIT AI Service - FastAPI Application

Main entry point for the AI service API.
Provides REST endpoints for chat, voice, and agent interactions.
"""

import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Body, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import get_config
from agents import Runner, Agent
from app_agents import triage_agent
from memory import get_memory, clear_memory
from prompt_scripts import UE_OPENING_GREETING_TEXT
from industry_context import get_industry, build_system_prompt
from booking import (
    book_appointment,
    current_industry_slug as _booking_industry,
    current_session_id as _booking_session,
)

from db.connection import get_db

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("ai-service")
access_logger = logging.getLogger("ai-service.access")

# Create FastAPI app
app = FastAPI(
    title="URackIT AI Service",
    description="AI-powered IT support agent service for URackIT",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
config = get_config()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",  # NestJS backend
        "http://localhost:5173",  # React frontend
        "http://localhost:8081",  # Local dev
        "https://callsphere.tech",  # CallSphere website
        "https://www.callsphere.tech",  # CallSphere website (www)
        "https://webhook.callsphere.tech",  # Webhook domain
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request, call_next):
    """Structured access logging: method, path, status, and duration. Health
    and noisy poll endpoints are logged at DEBUG to keep the stream readable."""
    import time as _time

    start = _time.monotonic()
    rid = uuid.uuid4().hex[:8]
    path = request.url.path
    quiet = path in ("/health", "/api/live-sessions") or path.startswith("/metrics")
    try:
        response = await call_next(request)
    except Exception:
        dur = (_time.monotonic() - start) * 1000
        access_logger.exception(
            f"rid={rid} {request.method} {path} -> 500 ERROR ({dur:.0f}ms)"
        )
        raise
    dur = (_time.monotonic() - start) * 1000
    line = f"rid={rid} {request.method} {path} -> {response.status_code} ({dur:.0f}ms)"
    access_logger.debug(line) if quiet else access_logger.info(line)
    response.headers["X-Request-ID"] = rid
    return response


def _responses_output_text(response: Any) -> str:
    """Extract assistant text from an OpenAI Responses API result.

    Prefers the `output_text` convenience accessor; defensively falls back to
    concatenating text parts from the structured `output` if it is empty.
    """
    text = getattr(response, "output_text", None)
    if text:
        return text
    parts = []
    for item in getattr(response, "output", None) or []:
        for content in getattr(item, "content", None) or []:
            chunk = getattr(content, "text", None)
            if chunk:
                parts.append(chunk)
    return "".join(parts)


# ============================================
# Request/Response Models
# ============================================

class ChatRequest(BaseModel):
    """Request model for chat endpoint."""
    message: str = Field(..., description="User message")
    session_id: Optional[str] = Field(None, description="Session ID for conversation continuity")
    industry: Optional[str] = Field(None, description="Industry slug selecting the agent persona (demo)")
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context (organization_id, contact_id, etc.)")


class ChatStartRequest(BaseModel):
    """Request model for starting a chat session."""
    industry: Optional[str] = Field(None, description="Industry slug selecting the agent persona (demo)")


class ChatResponse(BaseModel):
    """Response model for chat endpoint."""
    response: str = Field(..., description="AI response")
    session_id: str = Field(..., description="Session ID")
    agent_name: str = Field(..., description="Name of the agent that responded")
    tool_calls: List[Dict] = Field(default_factory=list, description="Tool calls made during processing")
    context: Dict[str, Any] = Field(default_factory=dict, description="Updated context")


class SessionRequest(BaseModel):
    """Request model for session operations."""
    session_id: str


class SessionContext(BaseModel):
    """Context to set for a session."""
    organization_id: Optional[int] = None
    organization_name: Optional[str] = None
    contact_id: Optional[int] = None
    contact_name: Optional[str] = None
    phone_number: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
    timestamp: str


# ============================================
# API Endpoints
# ============================================

@app.get("/", response_model=HealthResponse)
async def root():
    """Root endpoint - health check."""
    return HealthResponse(
        status="healthy",
        version="2.0.0",
        timestamp=datetime.utcnow().isoformat(),
    )


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        version="2.0.0",
        timestamp=datetime.utcnow().isoformat(),
    )


# Universal CHAT-only behavior layered on top of each industry persona. Kept
# here (not in the shared build_system_prompt) so the separate realtime VOICE
# agent is unaffected.
CHAT_CONVERSATION_RULES = """

CHAT CONVERSATION RULES (follow strictly):
- Keep every reply SHORT — 1-2 sentences. Be direct. Never repeat what you already said or re-list things you've already listed.
- You remember the whole conversation — do NOT re-ask for anything the customer already gave.
- At the very start of a new conversation, greet warmly and ask for the customer's NAME and EMAIL in one short sentence (needed to confirm any booking). Don't move on until you have both.
- If the customer asks what you offer, reply with a SHORT numbered list of the main services (one brief line each), then ask which one they'd like to book.
- To book: collect the service and a preferred day/time. Then read the details back in ONE short sentence (service + day/time) and ask the customer to confirm — e.g. "Shall I confirm this booking?".
- ONLY after the customer explicitly confirms (e.g. "yes", "confirm", "go ahead") may you call the book_appointment tool. NEVER call it before they confirm — the confirmation email is sent the moment you call it, so do not call it early.
- After book_appointment returns, confirm in ONE short sentence that they're booked and the confirmation email is on its way. Do not read all the details back.
- Never invent prices, availability, or policies — rely only on the knowledge provided.
"""


# Voice-only booking rules + tools for the browser WebRTC realtime session.
VOICE_BOOKING_RULES = (
    "BOOKING ON THIS CALL: Keep replies short and natural. Early on, ask for the "
    "caller's name and email so you can confirm a booking. To book, collect the "
    "service and a preferred day/time, read them back in one short sentence, and "
    "ask the caller to confirm. ONLY after they say yes, call the book_appointment "
    "tool — the confirmation email is sent the moment you call it, so never call "
    "it before they confirm. For factual questions, call search_knowledge and use "
    "only what it returns."
)

VOICE_TOOLS = [
    {
        "type": "function",
        "name": "search_knowledge",
        "description": (
            "Look up facts about this business (services, pricing, hours, policies, "
            "booking) to answer the caller. Pass the caller's question as `query`."
        ),
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "book_appointment",
        "description": (
            "Book the caller's appointment and email a confirmation. Call ONLY after "
            "you have their name, a valid email, the service, a preferred day/time, "
            "AND the caller has confirmed. The email sends the moment this is called."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"},
                "service": {"type": "string"},
                "preferred_time": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["name", "email", "service", "preferred_time"],
        },
    },
]


class VoiceToolRequest(BaseModel):
    """Browser-side realtime tool execution (function calls arrive over the
    WebRTC data channel; the browser relays them here to run server-side)."""
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)
    industry: Optional[str] = None
    session_id: Optional[str] = None


@app.post("/webrtc/tool")
async def webrtc_execute_tool(request: VoiceToolRequest):
    """Execute a realtime voice tool (book_appointment / search_knowledge) for
    the browser WebRTC agent and return the string output to relay back."""
    name = request.name
    args = request.arguments or {}
    industry_slug = request.industry
    logger.info(f"[voice-tool] {name} industry={industry_slug} args={list(args.keys())}")
    try:
        if name == "book_appointment":
            from booking import create_booking

            output = create_booking(
                industry_slug,
                request.session_id,
                args.get("name", ""),
                args.get("email", ""),
                args.get("service", ""),
                args.get("preferred_time", ""),
                args.get("notes", ""),
            )
        elif name == "search_knowledge":
            from industry_context import search_qa

            pairs = search_qa(args.get("query", ""), industry_slug, k=4)
            output = (
                "\n\n".join(f"Q: {p['question']}\nA: {p['answer']}" for p in pairs)
                if pairs
                else "No specific information found; offer to take a message."
            )
        else:
            output = f"Unknown tool: {name}"
    except Exception as e:
        logger.error(f"[voice-tool] {name} failed: {e}")
        output = "The tool failed; offer to have the team follow up."
    return {"output": output}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Process a chat message through the AI agent pipeline.

    This is the main endpoint for text-based interactions with the AI.
    """
    # Generate or use provided session ID
    session_id = request.session_id or f"chat-{uuid.uuid4().hex}"
    
    # Get or create session memory
    memory = get_memory(session_id)
    
    # Merge provided context with existing
    context = memory.get_all_context()
    if request.context:
        context.update(request.context)
        for key, value in request.context.items():
            memory.set_context(key, value)

    # Resolve industry persona for this session. The slug is sticky across the
    # conversation: take it from the request when provided, else from memory
    # (set at /api/chat/start), else fall back to the generic persona.
    industry_slug = request.industry or context.get("industry_slug")
    if industry_slug:
        memory.set_context("industry_slug", industry_slug)

    # Add user message to memory
    memory.add_turn("user", request.message)

    try:
        # Build a per-industry agent: industry persona + per-industry pgvector
        # RAG over knowledge_base, keeping the existing tool set. Falls back to
        # a generic helpful-assistant persona if the slug is missing/unknown.
        industry = get_industry(industry_slug)
        system_prompt = build_system_prompt(industry, user_query=request.message)
        system_prompt += CHAT_CONVERSATION_RULES
        # Chat agent = industry persona + knowledge tool + real booking tool.
        industry_agent = Agent(
            name=f"{industry.get('slug', 'generic')}_agent",
            instructions=system_prompt,
            tools=list(triage_agent.tools) + [book_appointment],
        )

        # Scope the booking tool to this industry + session (read from the tool).
        _booking_industry.set(industry.get("slug"))
        _booking_session.set(session_id)

        # Built-in conversation memory: chain from the prior response id so the
        # model retains full history server-side (no manual replay).
        previous_response_id = context.get("last_response_id")

        result = await Runner.run(
            industry_agent,
            request.message,
            context=context,
            previous_response_id=previous_response_id,
        )

        # Persist the new response id for the next turn's memory chain.
        if getattr(result, "response_id", None):
            memory.set_context("last_response_id", result.response_id)

        # Add assistant response to memory
        memory.add_turn("assistant", result.final_output)

        # Persist the turn for the chatbot-metrics dashboard (best-effort).
        try:
            tool_names = [
                (tc.get("function") or {}).get("name")
                for tc in (result.tool_calls or [])
            ]
            tool_names = [t for t in tool_names if t]
            get_db().insert(
                "demo_chat_messages",
                {
                    "session_id": session_id,
                    "industry_slug": industry.get("slug"),
                    "industry_name": industry.get("name"),
                    "user_message": request.message[:2000],
                    "assistant_message": (result.final_output or "")[:2000],
                    "tool_calls": tool_names or None,
                    "response_id": getattr(result, "response_id", None),
                    "channel": "chat",
                },
            )
        except Exception as e:
            logger.warning(f"chat message persist failed: {e}")

        return ChatResponse(
            response=result.final_output,
            session_id=session_id,
            agent_name=result.agent_name,
            tool_calls=result.tool_calls,
            context=memory.get_all_context(),
        )
    
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/start")
async def start_session(request: ChatStartRequest = Body(default=ChatStartRequest())):
    """
    Start a new chat session.
    Returns a new session ID and the industry-specific opening greeting.

    Accepts an optional `industry` slug which selects the agent persona +
    greeting from the `industries` table. The slug is stored on the session
    memory so subsequent /api/chat turns reuse it.
    """
    session_id = f"chat-{uuid.uuid4().hex}"
    memory = get_memory(session_id)

    industry = get_industry(request.industry)
    greeting = industry.get("greeting") or UE_OPENING_GREETING_TEXT

    if request.industry:
        memory.set_context("industry_slug", request.industry)

    memory.add_turn("assistant", greeting)

    return {
        "session_id": session_id,
        "industry": industry.get("slug"),
        "greeting": greeting,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/session/context")
async def set_session_context(session_id: str, context: SessionContext):
    """
    Set context for an existing session.
    Used to pre-populate organization/contact info.
    """
    memory = get_memory(session_id)
    
    if context.organization_id:
        memory.set_context("organization_id", context.organization_id)
    if context.organization_name:
        memory.set_context("organization_name", context.organization_name)
    if context.contact_id:
        memory.set_context("contact_id", context.contact_id)
    if context.contact_name:
        memory.set_context("contact_name", context.contact_name)
    if context.phone_number:
        memory.set_context("phone_number", context.phone_number)
    
    return {
        "session_id": session_id,
        "context": memory.get_all_context(),
    }


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """Get session information and history."""
    memory = get_memory(session_id)
    
    return {
        "session_id": session_id,
        "context": memory.get_all_context(),
        "summary": memory.get_summary(),
        "turn_count": len(memory.turns),
        "messages": memory.get_messages_for_api(20),
    }


@app.delete("/api/session/{session_id}")
async def end_session(session_id: str):
    """End and clear a session."""
    clear_memory(session_id)
    return {"status": "cleared", "session_id": session_id}


# ============================================
# WebSocket for Real-time Chat
# ============================================

@app.websocket("/ws/chat/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time chat.
    Supports streaming responses.
    """
    await websocket.accept()
    memory = get_memory(session_id)
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_json()
            message = data.get("message", "")
            context = data.get("context", {})
            
            if not message:
                await websocket.send_json({"error": "Message required"})
                continue
            
            # Update context
            for key, value in context.items():
                memory.set_context(key, value)
            
            # Add user message
            memory.add_turn("user", message)
            
            try:
                # Run agent
                result = await Runner.run(
                    triage_agent,
                    message,
                    context=memory.get_all_context(),
                )
                
                # Add response
                memory.add_turn("assistant", result.final_output)
                
                # Send response
                await websocket.send_json({
                    "type": "response",
                    "response": result.final_output,
                    "agent_name": result.agent_name,
                    "tool_calls": result.tool_calls,
                    "context": memory.get_all_context(),
                })
            
            except Exception as e:
                logger.error(f"WebSocket agent error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "error": str(e),
                })
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")


# ============================================
# Agent Management Endpoints
# ============================================

@app.get("/api/agents")
async def list_agents():
    """List available agents."""
    from app_agents import triage_agent

    agents = [triage_agent]

    return {
        "agents": [
            {
                "name": agent.name,
                "tool_count": len(agent.tools),
                "handoff_count": len(agent.handoffs),
            }
            for agent in agents
        ]
    }


@app.get("/api/agents/{agent_name}/tools")
async def get_agent_tools(agent_name: str):
    """Get tools available to a specific agent."""
    from app_agents import triage_agent

    agent_map = {
        "Reclaim_Receptionist": triage_agent,
    }
    
    agent = agent_map.get(agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_name}")
    
    return {
        "agent_name": agent.name,
        "tools": [
            {
                "name": tool.name if hasattr(tool, "name") else tool.__name__,
                "description": tool.description if hasattr(tool, "description") else (tool.__doc__ or ""),
            }
            for tool in agent.tools
        ]
    }


# ============================================
# Knowledge Base Endpoints
# ============================================

@app.get("/api/knowledge/stats")
async def knowledge_stats():
    """Get knowledge base statistics."""
    from memory.knowledge_base import get_knowledge_base_stats
    return get_knowledge_base_stats()


@app.post("/api/knowledge/reload")
async def reload_knowledge():
    """Reload the knowledge base from file."""
    from memory.knowledge_base import reload_knowledge_base
    result = reload_knowledge_base()
    return {"status": result}


@app.post("/api/knowledge/search")
async def search_knowledge(query: str, top_k: int = 4):
    """Search the knowledge base."""
    from memory.knowledge_base import lookup_support_info
    result = lookup_support_info(query, top_k)
    return {"query": query, "results": result}


# ============================================
# AI Task Endpoints (Called by NestJS Backend)
# ============================================

class SummarizeRequest(BaseModel):
    """Request to summarize a call transcript."""
    call_sid: str
    transcript: List[Dict[str, str]]
    metadata: Optional[Dict[str, Any]] = None


class SummarizeResponse(BaseModel):
    """Summary response."""
    summary: str
    key_points: List[str]
    action_items: List[str]
    sentiment: str
    resolution: str


@app.post("/api/summarize", response_model=SummarizeResponse)
async def summarize_call(request: SummarizeRequest):
    """
    Summarize a call transcript.
    Called by NestJS backend after call ends.
    """
    import openai
    
    config = get_config()
    client = openai.OpenAI(api_key=config.openai_api_key)
    
    # Format transcript
    transcript_text = "\n".join([
        f"{msg.get('role', 'unknown')}: {msg.get('content', '')}"
        for msg in request.transcript
    ])
    
    prompt = f"""Analyze this IT support call transcript and provide:
1. A brief summary (2-3 sentences)
2. Key points discussed (bullet list)
3. Action items if any
4. Overall sentiment (positive/neutral/negative)
5. Resolution status (resolved/escalated/pending)

Transcript:
{transcript_text}

Respond in JSON format:
{{
  "summary": "...",
  "key_points": ["...", "..."],
  "action_items": ["...", "..."],
  "sentiment": "positive|neutral|negative",
  "resolution": "resolved|escalated|pending"
}}"""

    try:
        response = client.responses.create(
            model=config.openai_model,
            input=[{"role": "user", "content": prompt}],
            reasoning={"effort": config.openai_reasoning_effort},
            text={"format": {"type": "json_object"}},
        )

        import json
        result = json.loads(_responses_output_text(response))

        return SummarizeResponse(
            summary=result.get("summary", ""),
            key_points=result.get("key_points", []),
            action_items=result.get("action_items", []),
            sentiment=result.get("sentiment", "neutral"),
            resolution=result.get("resolution", "pending"),
        )
    except Exception as e:
        logger.error(f"Summarization failed: {e}")
        raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")


class ClassifyRequest(BaseModel):
    """Request to classify an issue."""
    text: str
    context: Optional[Dict[str, Any]] = None


class ClassifyResponse(BaseModel):
    """Classification response."""
    category: str
    priority: str
    suggested_queue: str
    confidence: float


@app.post("/api/classify", response_model=ClassifyResponse)
async def classify_issue(request: ClassifyRequest):
    """
    Classify an issue for ticket routing.
    Returns category, priority, and suggested queue.
    """
    import openai
    
    config = get_config()
    client = openai.OpenAI(api_key=config.openai_api_key)
    
    prompt = f"""Classify this IT support issue:

Issue: {request.text}

Categories: email, computer, network, printer, phone, security, billing, other
Priorities: low, medium, high, critical
Queues: email_support, desktop_support, network_ops, device_support, security_team, billing, general

Respond in JSON:
{{
  "category": "...",
  "priority": "low|medium|high|critical",
  "suggested_queue": "...",
  "confidence": 0.0-1.0
}}"""

    try:
        response = client.responses.create(
            model=config.openai_model,
            input=[{"role": "user", "content": prompt}],
            reasoning={"effort": config.openai_reasoning_effort},
            text={"format": {"type": "json_object"}},
        )

        import json
        result = json.loads(_responses_output_text(response))

        return ClassifyResponse(
            category=result.get("category", "other"),
            priority=result.get("priority", "medium"),
            suggested_queue=result.get("suggested_queue", "general"),
            confidence=float(result.get("confidence", 0.8)),
        )
    except Exception as e:
        logger.error(f"Classification failed: {e}")
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")


# ============================================
# SIP/Voice Integration Routes
# ============================================

# Import and include SIP integration routes
try:
    from sip_integration.webhook_server import (
        create_app as create_sip_app,
    )
    from sip_integration.session_manager import init_session_manager, get_session_manager
    from sip_integration.config import get_config as get_sip_config
    from sip_integration.twilio_provider import create_twilio_provider
    from sip_integration.media_stream import MediaStreamHandler
    from sip_integration.interfaces import CallInfo, CallState
    import os
    from fastapi import Form, Request
    from fastapi.responses import Response, FileResponse
    from fastapi.staticfiles import StaticFiles
    from twilio.twiml.voice_response import VoiceResponse, Connect
    
    # Serve static files (dialer page)
    static_dir = os.path.join(os.path.dirname(__file__), 'static')
    if os.path.exists(static_dir):
        app.mount("/static", StaticFiles(directory=static_dir), name="static")
        logger.info(f"Static files mounted from {static_dir}")
    
    # Initialize SIP session manager on startup
    @app.on_event("startup")
    async def startup_sip():
        await init_session_manager()
        logger.info("SIP session manager initialized")
    
    @app.on_event("shutdown")
    async def shutdown_sip():
        session_manager = get_session_manager()
        await session_manager.stop()
        logger.info("SIP session manager stopped")
    
    @app.post("/twilio")
    async def twilio_webhook(
        request: Request,
        CallSid: str = Form(...),
        From: str = Form(...),
        To: str = Form(...),
        CallStatus: str = Form(None),
        Direction: str = Form(None),
    ):
        """Handle incoming Twilio voice webhooks."""
        logger.info(f"Incoming call: {CallSid} from {From} to {To}")
        
        session_manager = get_session_manager()
        sip_config = get_sip_config()
        
        call_info = CallInfo(
            call_sid=CallSid,
            from_number=From,
            to_number=To,
            direction=Direction or "inbound",
            status=CallStatus or "ringing",
        )

        # Best-effort industry selection: a number can be pointed at
        # /twilio?industry=<slug>. Defaults to the generic persona if absent.
        industry_slug = request.query_params.get("industry")

        # Standard Twilio PSTN call
        session_id = await session_manager.create_session(
            call_info, call_source="twilio", industry_slug=industry_slug
        )
        
        # Build WebSocket URL for media stream
        host = request.headers.get("host", "")
        scheme = "wss" if request.url.scheme == "https" else "ws"
        ws_url = f"{scheme}://{host}/media-stream/{session_id}"
        
        # If webhook base URL is configured, use it
        if sip_config.webhook_base_url:
            ws_url = f"{sip_config.webhook_base_url.replace('https', 'wss').replace('http', 'ws')}/media-stream/{session_id}"
        
        # Generate TwiML response
        response = VoiceResponse()
        connect = Connect()
        connect.stream(url=ws_url)
        response.append(connect)
        
        return Response(content=str(response), media_type="application/xml")
    
    @app.post("/twiml-app/voice")
    async def twiml_app_voice_webhook(request: Request):
        """
        TwiML Application webhook - handles browser calls from web dialer.
        
        When a browser client calls using device.connect():
        - Twilio sends: CallSid, From (client:identity), To (app:APxxx or phone number)
        - We connect the browser to the AI agent via WebSocket stream
        """
        sip_config = get_sip_config()
        session_manager = get_session_manager()
        
        # Get form data (Twilio sends call info here)
        try:
            form_data = await request.form()
            call_sid = form_data.get("CallSid", "")
            from_number = form_data.get("From", "")
            to_number = form_data.get("To", "")
            direction = form_data.get("Direction", "")
            caller_name = form_data.get("CallerName", "")
            account_sid = form_data.get("AccountSid", sip_config.twilio_account_sid)
        except:
            call_sid = ""
            from_number = ""
            to_number = ""
            direction = ""
            caller_name = ""
            account_sid = sip_config.twilio_account_sid
        
        logger.info(f"TwiML App webhook called:")
        logger.info(f"  CallSid: {call_sid}")
        logger.info(f"  From: {from_number}")
        logger.info(f"  To: {to_number}")
        logger.info(f"  Direction: {direction}")
        
        # Browser call (from client:xxx)
        if from_number.startswith("client:"):
            logger.info("📞 BROWSER CALL DETECTED - Connecting to AI agent (WebRTC source)")
            
            call_info = CallInfo(
                call_sid=call_sid,
                from_number=from_number,
                to_number=to_number or sip_config.twilio_phone_number,
                direction="inbound",
                status="ringing",
            )
            # Browser calls via Twilio Client SDK = still goes through Twilio,
            # but we track it as 'webrtc' since user is on browser
            # For truly direct WebRTC (no Twilio), use the /webrtc endpoint
            browser_session_id = await session_manager.create_session(call_info, call_source="webrtc")
            logger.info(f"Created browser WebRTC session: {browser_session_id}")
            
            # Build WebSocket URL
            ws_url = f"{sip_config.webhook_base_url.replace('https', 'wss').replace('http', 'ws')}/media-stream/{browser_session_id}"
            
            response = VoiceResponse()
            connect = Connect()
            connect.stream(url=ws_url)
            response.append(connect)
            
            logger.info(f"Browser client connecting to stream: {ws_url}")
            return Response(content=str(response), media_type="application/xml")
        
        # Outbound call to a phone number
        if to_number and not to_number.startswith("app:"):
            logger.info(f"📱 OUTBOUND CALL to {to_number}")
            
            response = VoiceResponse()
            response.dial(to_number, caller_id=sip_config.twilio_phone_number)
            
            return Response(content=str(response), media_type="application/xml")
        
        # Fallback - connect to AI agent
        logger.warning("TwiML App called with unknown parameters - connecting to AI")
        import uuid
        fallback_session_id = f"fallback-{uuid.uuid4().hex}"
        
        call_info = CallInfo(
            call_sid=call_sid or fallback_session_id,
            from_number=from_number or "unknown",
            to_number=to_number or sip_config.twilio_phone_number,
            direction="inbound",
            status="ringing",
        )
        # Twilio fallback call
        session_id = await session_manager.create_session(call_info, call_source="twilio")
        
        ws_url = f"{sip_config.webhook_base_url.replace('https', 'wss').replace('http', 'ws')}/media-stream/{session_id}"
        
        response = VoiceResponse()
        connect = Connect()
        connect.stream(url=ws_url)
        response.append(connect)
        
        return Response(content=str(response), media_type="application/xml")

    @app.websocket("/media-stream/{session_id}")
    async def media_stream_websocket(websocket: WebSocket, session_id: str):
        """Handle Twilio media stream WebSocket."""
        session_manager = get_session_manager()
        session = await session_manager.get_session(session_id)
        
        if not session:
            await websocket.close(code=4000)
            return
        
        handler = MediaStreamHandler(websocket, session)
        await handler.handle()
    
    @app.get("/voice-token")
    async def get_voice_token(identity: str = "web-user", x_internal_key: str = Header(None)):
        """Generate Twilio Voice token for browser calling.

        SECURITY: this mints a Twilio AccessToken with an outgoing VoiceGrant
        (outbound PSTN billed to the account = toll-fraud target). The public
        dashboard does not use this endpoint, so it is gated behind the internal
        API key shared between backend and ai-service.
        """
        import os
        from twilio.jwt.access_token import AccessToken
        from twilio.jwt.access_token.grants import VoiceGrant

        internal_key = os.getenv("INTERNAL_API_KEY")
        if not internal_key or x_internal_key != internal_key:
            raise HTTPException(status_code=401, detail="unauthorized")

        sip_config = get_sip_config()

        if not sip_config.twilio_api_key_sid or not sip_config.twilio_api_key_secret:
            raise HTTPException(status_code=500, detail="Twilio API keys not configured")
        
        token = AccessToken(
            sip_config.twilio_account_sid,
            sip_config.twilio_api_key_sid,
            sip_config.twilio_api_key_secret,
            identity=identity,
            ttl=3600,
        )
        
        voice_grant = VoiceGrant(
            outgoing_application_sid=sip_config.twilio_twiml_app_sid,
            incoming_allow=True,
        )
        token.add_grant(voice_grant)
        
        return {"token": token.to_jwt(), "identity": identity}
    
    @app.get("/dialer")
    async def get_dialer():
        """Serve the web dialer page."""
        dialer_path = os.path.join(static_dir, 'dialer.html')
        if os.path.exists(dialer_path):
            return FileResponse(dialer_path)
        raise HTTPException(status_code=404, detail="Dialer page not found")
    
    @app.get("/dashboard")
    async def get_dashboard():
        """Serve the analytics dashboard."""
        dashboard_path = os.path.join(static_dir, 'dashboard.html')
        if os.path.exists(dashboard_path):
            return FileResponse(dashboard_path)
        raise HTTPException(status_code=404, detail="Dashboard page not found")
    
    @app.get("/api/live-sessions")
    async def get_live_sessions():
        """Get all active live call sessions with their details."""
        import time
        from datetime import datetime
        
        session_manager = get_session_manager()
        sessions = session_manager.get_all_sessions()
        
        calls = []
        agents_set = set()
        total_duration = 0
        inbound_count = 0
        outbound_count = 0
        
        for session in sessions:
            duration = int(time.time() - session.created_at)
            total_duration += duration
            
            direction = session.call_info.direction or "inbound"
            if direction == "inbound":
                inbound_count += 1
            else:
                outbound_count += 1
            
            if session.agent_type:
                agents_set.add(session.agent_type)
            
            # Build transcript entries
            transcript = []
            for msg in session.conversation_history:
                transcript.append({
                    "role": msg.get("role", "assistant"),
                    "content": msg.get("content", ""),
                    "timestamp": msg.get("timestamp", datetime.utcnow().isoformat())
                })
            
            # Build agent history
            agent_history = []
            current_agent = session.agent_type or "triage_agent"
            agent_history.append({
                "agentName": current_agent,
                "action": "Started conversation",
                "timestamp": datetime.utcfromtimestamp(session.created_at).isoformat()
            })
            
            calls.append({
                "callSid": session.call_info.call_sid,
                "from": session.call_info.from_number,
                "to": session.call_info.to_number,
                "direction": direction,
                "status": "in-progress",
                "startTime": datetime.utcfromtimestamp(session.created_at).isoformat(),
                "duration": duration,
                "callerName": session.caller_name,
                "companyName": session.company_name,
                "currentAgent": current_agent,
                "industry": session.industry_slug,
                "transcript": transcript,
                "agentHistory": agent_history,
                "sentiment": "neutral",
                "ticketCreated": session.ticket_created,
                "escalated": session.escalated
            })

        # Calculate metrics
        avg_duration = total_duration // len(sessions) if sessions else 0
        
        return {
            "calls": calls,
            "metrics": {
                "activeCalls": len(sessions),
                "inbound": inbound_count,
                "outbound": outbound_count,
                "avgDuration": avg_duration,
                "activeAgents": list(agents_set)
            }
        }
    
    logger.info("SIP/Voice integration routes loaded")
    
except ImportError as e:
    logger.warning(f"SIP integration not available: {e}")


# ============================================
# WebRTC Direct Connection (Browser-to-AI)
# No Twilio involved - OpenAI costs only!
# ============================================

class WebRTCConnectRequest(BaseModel):
    """Request model for WebRTC connection - Unified Interface (backend proxies SDP)."""
    sdp: str = Field(..., description="WebRTC SDP offer from browser")
    role: str = Field(default="requester", description="User role: admin, agent, requester")
    industry: Optional[str] = Field(None, description="Industry slug selecting the agent persona (demo)")
    maxDuration: Optional[int] = Field(default=15, description="Max call duration in minutes")
    userId: Optional[int] = Field(None, description="User ID from auth")
    userEmail: Optional[str] = Field(None, description="User email")


class WebRTCConnectResponse(BaseModel):
    """Response model for WebRTC connection - returns SDP answer from OpenAI."""
    sdp: str = Field(..., description="WebRTC SDP answer from OpenAI")
    sessionId: str = Field(..., description="Session ID for tracking the call")


@app.post("/webrtc/connect", response_model=WebRTCConnectResponse)
async def webrtc_connect(request: WebRTCConnectRequest):
    """
    Unified Interface: Backend proxies SDP to OpenAI Realtime API with system prompt.

    Flow:
    1. Browser sends SDP offer to our backend
    2. Backend creates ephemeral session with OpenAI (includes our instructions)
    3. Backend sends SDP to OpenAI /v1/realtime endpoint
    4. Backend returns SDP answer to browser

    Role-based access:
    - admin: Full access, 60 min max, all agents
    - agent: Standard access, 30 min max, assigned agents
    - requester: Limited access, 15 min max, triage only
    """
    import aiohttp
    import os
    import uuid

    try:
        from sip_integration.session_manager import get_session_manager
        from sip_integration.interfaces import CallInfo
        from sip_integration.agent_adapter import create_agent_adapter

        session_manager = get_session_manager()

        # SECURITY: this endpoint is unauthenticated (public dashboard), so never
        # trust the client-supplied role/duration for privilege or cost. Clamp the
        # role to a known set and the duration to a hard server cap to bound the
        # per-session OpenAI Realtime spend.
        allowed_roles = {"admin", "agent", "requester"}
        if request.role not in allowed_roles:
            request.role = "requester"
        max_duration_cap = int(os.getenv("WEBRTC_MAX_DURATION_MIN", "15"))
        try:
            requested_duration = int(request.maxDuration or max_duration_cap)
        except (TypeError, ValueError):
            requested_duration = max_duration_cap
        request.maxDuration = max(1, min(requested_duration, max_duration_cap))

        # Create a WebRTC session for tracking
        webrtc_id = f"webrtc-{uuid.uuid4().hex}"

        call_info = CallInfo(
            call_sid=webrtc_id,
            from_number=f"webrtc:{request.userEmail or 'anonymous'}",
            to_number="ai-agent",
            direction="inbound",
            status="ringing",
        )

        # Create session with webrtc source + industry persona
        session_id = await session_manager.create_session(
            call_info, call_source="webrtc", industry_slug=request.industry
        )

        # Get the session and set metadata
        session = await session_manager.get_session(session_id)
        if session:
            session.metadata['role'] = request.role
            session.metadata['maxDuration'] = request.maxDuration
            session.metadata['userId'] = request.userId
            session.metadata['userEmail'] = request.userEmail
            session.metadata['webrtc'] = True
            session.metadata['industry'] = request.industry

        # Get OpenAI API key
        openai_api_key = os.getenv("OPENAI_API_KEY")
        realtime_model = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-2")
        # Low-latency streaming STT model used for live-call transcript deltas.
        transcription_model = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-realtime-whisper")

        if not openai_api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")

        # Build the system prompt from the selected industry persona (demo).
        # We seed per-industry RAG with a broad overview query so the agent has
        # the most important facts ready at call start; further look-ups happen
        # via the search_knowledge tool during the call. Falls back to a generic
        # persona + greeting when no/unknown industry slug is supplied.
        industry = get_industry(request.industry)
        rag_seed = (
            f"{industry.get('name', '')} services pricing hours availability "
            f"booking how it works what is included"
        )
        system_prompt = build_system_prompt(industry, user_query=rag_seed)
        greeting_text = industry.get("greeting") or UE_OPENING_GREETING_TEXT

        full_instructions = (
            f"{system_prompt}\n\n"
            f"{VOICE_BOOKING_RULES}\n\n"
            f"CRITICAL: When the call starts, say this EXACT greeting verbatim (word for word):\n\n{greeting_text}\n\n"
            f"Then wait for their response and help them."
        )

        # GA Realtime API flow (the legacy POST /v1/realtime/sessions endpoint was
        # removed -> 404, which is why the dashboard voice bot was failing). We now:
        #   1. Mint an ephemeral client secret via /v1/realtime/client_secrets with the
        #      full GA session config (instructions + gpt-realtime-whisper transcription).
        #   2. Exchange the browser's SDP offer against /v1/realtime/calls using it.
        realtime_reasoning_effort = os.getenv("OPENAI_REALTIME_REASONING_EFFORT") or "low"
        ga_session_config = {
            "type": "realtime",
            "model": realtime_model,
            "instructions": full_instructions,
            "output_modalities": ["audio"],
            "reasoning": {"effort": realtime_reasoning_effort},
            "tools": VOICE_TOOLS,
            "tool_choice": "auto",
            "audio": {
                "input": {
                    "transcription": {"model": transcription_model},
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.85,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 800,
                    },
                },
                "output": {"voice": os.getenv("VOICE", "alloy")},
            },
        }

        async with aiohttp.ClientSession() as http_session:
            # Step 1: mint ephemeral client secret with our session config.
            secret_response = await http_session.post(
                "https://api.openai.com/v1/realtime/client_secrets",
                headers={
                    "Authorization": f"Bearer {openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={"session": ga_session_config},
            )

            sdp_auth = openai_api_key  # fallback to API key if minting fails
            if secret_response.status in (200, 201):
                secret_data = await secret_response.json()
                ephemeral_token = secret_data.get("value")
                if ephemeral_token:
                    sdp_auth = ephemeral_token
                else:
                    logger.warning("client_secrets returned no value; using API key for SDP exchange")
            else:
                err = await secret_response.text()
                logger.error(f"OpenAI client_secrets error ({secret_response.status}): {err}")
                logger.warning("Falling back to API-key SDP exchange without custom session config")

            # Step 2: SDP offer/answer exchange against the GA calls endpoint.
            sdp_response = await http_session.post(
                f"https://api.openai.com/v1/realtime/calls?model={realtime_model}",
                headers={
                    "Authorization": f"Bearer {sdp_auth}",
                    "Content-Type": "application/sdp",
                },
                data=request.sdp,
            )

            if sdp_response.status not in (200, 201):
                error_text = await sdp_response.text()
                logger.error(f"OpenAI SDP error ({sdp_response.status}): {error_text}")
                raise HTTPException(status_code=502, detail=f"OpenAI error: {error_text}")

            sdp_answer = await sdp_response.text()

        logger.info(f"WebRTC session created: {session_id}, role={request.role}, with custom instructions")

        return WebRTCConnectResponse(
            sdp=sdp_answer,
            sessionId=session_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"WebRTC connect error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_system_prompt_for_role(role: str) -> str:
    """Get appropriate system prompt based on user role."""
    if role == "admin":
        return """You are an AI assistant for U Rack IT, a full-service IT support company. 
        The user is an administrator with full access. Help them with any IT-related questions, 
        system management, or support tasks. Be professional and thorough."""
    elif role == "agent":
        return """You are an AI assistant for U Rack IT, a full-service IT support company.
        The user is a support agent. Help them handle customer inquiries, troubleshoot issues,
        and manage support tickets efficiently."""
    else:
        return """You are a friendly AI support assistant for U Rack IT.
        Help the user with their IT support needs. Be helpful, patient, and clear.
        If you cannot resolve their issue, offer to create a support ticket or escalate to a human agent."""


@app.post("/webrtc/disconnect")
async def webrtc_disconnect(payload: dict = Body(...)):
    """Disconnect a WebRTC session."""
    try:
        from sip_integration.session_manager import get_session_manager
        
        session_id = payload.get("sessionId") or payload.get("session_id")
        if not session_id:
            raise HTTPException(status_code=422, detail="Missing sessionId")

        session_manager = get_session_manager()
        await session_manager.end_session(session_id)
        
        logger.info(f"WebRTC session disconnected: {session_id}")
        return {"success": True, "sessionId": session_id}
        
    except Exception as e:
        logger.error(f"WebRTC disconnect error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Browser WebSocket Voice (Direct OpenAI Realtime)
# ============================================

# Store active browser voice sessions
browser_voice_sessions: Dict[str, Any] = {}

@app.websocket("/ws/voice")
async def browser_voice_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for browser-based voice chat with OpenAI Realtime.
    Browser sends audio as base64 PCM, receives audio back.
    This is a direct browser-to-AI connection without Twilio.
    """
    import base64
    import asyncio

    await websocket.accept()

    session_id = None
    openai_connection = None

    try:
        session_id = f"browser-{uuid.uuid4().hex}"
        logger.info(f"Browser voice session started: {session_id}")

        # Get agent configuration
        from sip_integration.agent_adapter import create_agent_adapter
        from sip_integration.openai_realtime import OpenAIRealtimeConnection
        from sip_integration.interfaces import AudioChunk, AudioFormat

        agent_adapter = create_agent_adapter()
        system_prompt = agent_adapter.get_system_prompt()
        tools = agent_adapter.get_tools_schema()

        # Add greeting instruction
        full_instructions = (
            f"{system_prompt}\n\n"
            f"CRITICAL: When the call starts, say this EXACT greeting verbatim (word for word):\n\n{UE_OPENING_GREETING_TEXT}\n\n"
            f"Then wait for their response and follow the CALL START FLOW."
        )

        # Create OpenAI Realtime connection with PCM16 format for browser
        openai_connection = OpenAIRealtimeConnection(
            system_prompt=full_instructions,
            tools=tools,
            input_audio_format="pcm16",
            output_audio_format="pcm16",
        )

        # Store session
        browser_voice_sessions[session_id] = {
            "connection": openai_connection,
            "started_at": datetime.utcnow().isoformat()
        }

        # Set up audio callback - send audio to browser
        def send_audio_to_browser(chunk: AudioChunk):
            try:
                # OpenAI returns PCM16 audio (configured above)
                # Send directly to browser as base64
                audio_b64 = base64.b64encode(chunk.data).decode('utf-8')
                asyncio.create_task(websocket.send_json({
                    "type": "audio",
                    "audio": audio_b64
                }))
            except Exception as e:
                logger.error(f"Error sending audio to browser: {e}")

        openai_connection.set_audio_callback(send_audio_to_browser)

        # Set up transcript callback
        def send_transcript(role: str, text: str):
            try:
                asyncio.create_task(websocket.send_json({
                    "type": "transcript",
                    "role": role,
                    "text": text
                }))
            except Exception as e:
                logger.error(f"Error sending transcript: {e}")

        openai_connection.set_text_callback(send_transcript)

        # Set up function call handler
        async def handle_function(name: str, arguments: Dict[str, Any]) -> str:
            logger.info(f"Function call: {name} with args: {arguments}")
            # For now, return a simple response
            # In production, route to appropriate agent tools
            return f"Function {name} executed with args: {arguments}"

        openai_connection.set_function_callback(handle_function)

        # Connect to OpenAI
        connected = await openai_connection.connect(session_id)
        if not connected:
            await websocket.send_json({"type": "error", "message": "Failed to connect to AI"})
            await websocket.close()
            return

        # Notify browser we're ready
        await websocket.send_json({"type": "ready", "sessionId": session_id})

        # Start greeting
        await openai_connection.start_greeting()

        # Handle incoming messages from browser
        while True:
            try:
                data = await websocket.receive_json()
                msg_type = data.get("type")

                if msg_type == "audio":
                    # Browser sends audio as base64 PCM
                    audio_b64 = data.get("audio", "")
                    if audio_b64:
                        audio_bytes = base64.b64decode(audio_b64)
                        chunk = AudioChunk(
                            data=audio_bytes,
                            format=AudioFormat.PCM16,
                            timestamp=0
                        )
                        await openai_connection.send_audio(chunk)

                elif msg_type == "text":
                    # Text input
                    text = data.get("text", "")
                    if text:
                        await openai_connection.send_text(text)

                elif msg_type == "end":
                    # Client wants to end
                    break

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Error handling browser message: {e}")
                break

    except Exception as e:
        logger.error(f"Browser voice session error: {e}")
    finally:
        if openai_connection:
            await openai_connection.disconnect()
        if session_id and session_id in browser_voice_sessions:
            del browser_voice_sessions[session_id]
        logger.info(f"Browser voice session ended: {session_id}")


# ============================================
# Main Entry Point
# ============================================

def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    return app


if __name__ == "__main__":
    import uvicorn
    from port_utils import find_available_port
    
    config = get_config()
    errors = config.validate()
    
    if errors:
        for error in errors:
            logger.error(f"Configuration error: {error}")
        logger.info("Please set the required environment variables in .env file")
        exit(1)
    
    preferred_port = config.port
    
    try:
        port = find_available_port(preferred_port)
        
        if port != preferred_port:
            print(f"⚠️  Preferred port {preferred_port} was in use, using port {port} instead")
        
        logger.info("=" * 60)
        logger.info("URackIT AI Service v2.0.0")
        logger.info("=" * 60)
        logger.info(f"Host: {config.host}")
        logger.info(f"Port: {port}")
        logger.info(f"OpenAI Model: {config.openai_model}")
        logger.info("=" * 60)
        
        uvicorn.run(
            "main:app",
            host=config.host,
            port=port,
            reload=config.debug,
        )
    except RuntimeError as e:
        logger.error(f"Failed to start server: {e}")
        exit(1)
