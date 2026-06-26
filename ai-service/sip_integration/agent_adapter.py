"""
Agent adapter for integrating URackIT V2 agents with voice.
Updated to work with the v2 AI service structure.
"""

import asyncio
import inspect
import json
import logging
from typing import Any, Callable, Dict, List, Optional

from .interfaces import IAgentAdapter

logger = logging.getLogger(__name__)


class URackITAgentAdapter(IAgentAdapter):
    """
    Adapts the URackIT V2 agent system for voice interactions.
    
    This adapter bridges the OpenAI Realtime API with the existing
    triage agent and specialist agents.
    """
    
    def __init__(self):
        self._triage_agent = None
        self._tools_cache: Optional[list[dict]] = None
        self._tool_functions: Dict[str, Callable] = {}
        # Industry this adapter is voicing (demo). When set, search_knowledge
        # is routed to the per-industry knowledge_base instead of the legacy
        # global table.
        self._industry_id: Optional[int] = None
        self._industry_slug: Optional[str] = None
        self._session_id: Optional[str] = None

    def set_industry(
        self,
        industry_id: Optional[int],
        industry_slug: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> None:
        """Scope this adapter's knowledge look-ups to a given industry."""
        self._industry_id = industry_id
        self._industry_slug = industry_slug
        if session_id is not None:
            self._session_id = session_id
    
    def _ensure_agents_loaded(self) -> None:
        """Lazy load the agent system."""
        if self._triage_agent is None:
            from app_agents.triage_agent import triage_agent
            self._triage_agent = triage_agent
            self._build_tools_registry()
    
    def _build_tools_registry(self) -> None:
        """Build registry of tools exposed to the Reclaim voice agent.

        Reclaim's receptionist needs exactly one capability: retrieve facts
        about the service from the pgvector knowledge base. We register the
        triage agent's tools (search_knowledge) so the Realtime session can
        call it and we can execute it.
        """
        for tool in (self._triage_agent.tools if self._triage_agent else []):
            name = getattr(tool, 'name', None) or getattr(tool, '__name__', None)
            if name:
                self._tool_functions[name] = tool

        logger.info(f"Registered {len(self._tool_functions)} tools for voice agent")
    
    def get_system_prompt(self) -> str:
        """Get the system prompt for voice interactions."""
        self._ensure_agents_loaded()
        base_prompt = self._triage_agent.instructions if self._triage_agent else ""
        
        voice_additions = """

VOICE-SPECIFIC RULES (SOUND HUMAN WITH FEELING):
- Keep responses to 1-2 sentences — this is a live phone call.
- Speak naturally with warmth and genuine care; use contractions (you'll, I'll, we're, it's).
- Use brief pauses (...) for natural rhythm.
- Vary your acknowledgments: "Sure", "Absolutely", "Great question", "Happy to help", "Of course".
- When you need a moment to look something up, say so briefly ("Let me check that for you...").
- Be patient and friendly even if the caller repeats themselves.

GROUNDING (CRITICAL):
- For any factual question about Reclaim — pricing, cities served, how pickup/delivery works, timing, what's included, booking — call the search_knowledge tool and answer ONLY from what it returns.
- Never invent prices, service areas, times, or guarantees. If the knowledge base doesn't cover it, say you're not certain and offer to have the team follow up or suggest booking at helloreclaim.com.

REMEMBER: You are Riley, Reclaim's friendly AI receptionist on a real phone call. Sound human and helpful, never robotic.
"""
        return base_prompt + voice_additions
    
    async def process_input(self, session_id: str, text: str) -> str:
        """Process text input through the agent system and return response.
        
        This method routes user input through the triage agent which will
        delegate to specialist agents as needed.
        """
        self._ensure_agents_loaded()
        
        try:
            # Use the triage agent to process the input
            # The agent will determine if it needs to delegate to a specialist
            from agents.pipeline import Runner
            
            runner = Runner()
            result = await runner.run(
                self._triage_agent,
                text
            )
            
            # Extract the response text from the result
            if hasattr(result, 'final_output'):
                return str(result.final_output)
            elif hasattr(result, 'output'):
                return str(result.output)
            else:
                return str(result)
                
        except Exception as e:
            logger.error(f"Error processing input for session {session_id}: {e}")
            return "I'm sorry, I encountered an error processing your request. Let me try again."
    
    def get_tools_schema(self) -> list[dict]:
        """Get OpenAI function calling schema for all available tools."""
        self._ensure_agents_loaded()
        
        if self._tools_cache is not None:
            return self._tools_cache
        
        tools = []
        for name, func in self._tool_functions.items():
            schema = self._function_to_schema(name, func)
            if schema:
                tools.append(schema)

        # Single-line demo concierge: let the agent switch which industry it is
        # voicing mid-call. Handled explicitly in execute_tool (no registered
        # function — it mutates adapter state and returns role instructions).
        tools.append({
            "type": "function",
            "name": "select_industry",
            "description": (
                "Switch this AI agent to act as a specific industry's receptionist "
                "for the rest of the call. Call this as soon as the caller names or "
                "implies the type of business they want to experience (e.g. dental, "
                "insurance, salon and spa, logistics, real estate). After it returns, "
                "adopt the returned role and answer questions via search_knowledge."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "industry": {
                        "type": "string",
                        "description": (
                            "The industry the caller wants, as a name or keyword — "
                            "e.g. 'dental', 'insurance', 'salon and spa', 'logistics', "
                            "'real estate', 'healthcare', 'behavioral health'."
                        ),
                    }
                },
                "required": ["industry"],
            },
        })

        self._tools_cache = tools
        logger.info(f"Generated schema for {len(tools)} tools")
        return tools
    
    def _function_to_schema(self, name: str, func: Callable) -> Optional[dict]:
        """Convert a function to OpenAI tool schema."""
        try:
            sig = inspect.signature(func)
            doc = inspect.getdoc(func) or f"Execute {name}"
            parameters = {"type": "object", "properties": {}, "required": []}
            
            for param_name, param in sig.parameters.items():
                if param_name in ("self", "cls"):
                    continue
                
                param_type = "string"
                if param.annotation != inspect.Parameter.empty:
                    if param.annotation == int:
                        param_type = "integer"
                    elif param.annotation == float:
                        param_type = "number"
                    elif param.annotation == bool:
                        param_type = "boolean"
                
                parameters["properties"][param_name] = {
                    "type": param_type,
                    "description": f"Parameter: {param_name}"
                }
                
                if param.default == inspect.Parameter.empty:
                    parameters["required"].append(param_name)
            
            return {
                "type": "function",
                "name": name,
                "description": doc[:500],
                "parameters": parameters
            }
        except Exception as e:
            logger.warning(f"Failed to generate schema for {name}: {e}")
            return None
    
    async def execute_tool(self, name: str, arguments: Dict[str, Any]) -> Any:
        """Execute a tool and return its result."""
        self._ensure_agents_loaded()

        # Single-line demo concierge: switch which industry this agent voices.
        # Resolves the caller's free-text choice to a known industry, scopes
        # subsequent knowledge look-ups to that industry's KB, and returns the
        # role + greeting so the model becomes that business's receptionist.
        if name == "select_industry":
            choice = (
                arguments.get("industry")
                or arguments.get("slug")
                or arguments.get("name")
                or ""
            )
            try:
                from industry_context import resolve_industry, list_active_industries

                industry = resolve_industry(choice)
                if not industry or not industry.get("id"):
                    options = ", ".join(
                        i["name"] for i in list_active_industries()
                    )
                    return (
                        f"I couldn't match '{choice}' to a demo industry. Please ask "
                        f"the caller to choose one of: {options}."
                    )

                self.set_industry(industry.get("id"), industry.get("slug"))
                logger.info(
                    f"select_industry -> {industry.get('slug')} "
                    f"(id={industry.get('id')})"
                )
                persona = industry.get("persona") or ""
                greeting = industry.get("greeting") or ""
                return (
                    f"You are now acting as the AI receptionist for a "
                    f"{industry.get('name')} business. ROLE: {persona} "
                    f"Greet the caller in character (for example: \"{greeting}\") and "
                    f"from now on answer every factual question by calling "
                    f"search_knowledge and using ONLY what it returns. Do not mention "
                    f"that you switched industries."
                )
            except Exception as e:
                logger.error(f"select_industry failed for {choice!r}: {e}")
                return "I had trouble switching context. Could you tell me the type of business again?"

        # Route knowledge look-ups to the per-industry KB when this adapter is
        # scoped to an industry (demo). Prefer the dedicated demo_<slug>.kb.qa
        # database (search_qa); fall back to the legacy global knowledge_base
        # table (scoped by industry_id) only when that returns nothing. The
        # agent's own search_knowledge tool targets the legacy global table.
        if name == "search_knowledge" and (
            self._industry_slug is not None or self._industry_id is not None
        ):
            query = arguments.get("query") or arguments.get("q") or ""
            try:
                from industry_context import search_knowledge_base, search_qa

                pairs = search_qa(query, self._industry_slug, k=4)
                if pairs:
                    return "\n\n".join(
                        f"Q: {p['question']}\nA: {p['answer']}" for p in pairs
                    )

                # Fallback to the legacy global table.
                snippets = search_knowledge_base(query, self._industry_id, k=5)
                if snippets:
                    return "\n\n---\n\n".join(snippets)

                return (
                    "I don't have specific information on that. Let me take a "
                    "message and have the team follow up."
                )
            except Exception as e:
                logger.error(f"Per-industry knowledge search failed: {e}")
                return "I'm having trouble looking that up right now."

        if name not in self._tool_functions:
            return f"Unknown tool: {name}"

        func = self._tool_functions[name]
        
        try:
            if asyncio.iscoroutinefunction(func):
                result = await func(**arguments)
            else:
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(None, lambda: func(**arguments))
            return result
        except Exception as e:
            logger.error(f"Tool {name} failed: {e}")
            return f"Error executing {name}: {str(e)}"


def create_agent_adapter(use_full_agents: bool = True) -> URackITAgentAdapter:
    """Factory function to create an agent adapter."""
    return URackITAgentAdapter()
