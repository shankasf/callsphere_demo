"""
Voice session manager for handling concurrent call sessions.
"""

import asyncio
import logging
import time
import uuid
import os
import json
import requests
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple
from datetime import datetime

from .interfaces import ISessionManager, CallInfo, CallState
from .config import get_config

logger = logging.getLogger(__name__)


@dataclass
class VoiceSession:
    """Represents an active voice session."""
    
    session_id: str
    call_info: CallInfo
    state: CallState = CallState.RINGING
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    
    # Associated connections/resources
    realtime_connection: Optional[Any] = None
    agent_adapter: Optional[Any] = None
    
    # Conversation context
    conversation_history: list = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Caller information collected during call
    caller_name: Optional[str] = None
    company_name: Optional[str] = None
    callback_number: Optional[str] = None
    device_type: Optional[str] = None
    
    # Call source: 'twilio' (PSTN via Twilio) or 'webrtc' (browser-based)
    call_source: str = "twilio"  # Default to twilio for backwards compatibility

    # Industry this session is impersonating (demo multi-industry support).
    # Resolved from the `industries` table by slug at session/chat start;
    # written to call_logs.industry_slug and used for per-call lead scoring.
    industry_slug: Optional[str] = None
    
    # Tool usage tracking
    tool_calls: list = field(default_factory=list)
    ticket_created: bool = False
    escalated: bool = False
    ai_resolution: bool = True  # Assume AI resolved unless escalated
    
    # AI usage tracking
    total_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    ai_cost_usd: float = 0.0
    agent_type: str = "AI Agent"
    
    # Agent handoff tracking
    agent_handoffs: list = field(default_factory=list)  # Track agent-to-agent handoffs
    
    # Conference call tracking
    conference_name: Optional[str] = None
    in_conference: bool = False
    human_agent_call_sid: Optional[str] = None
    ai_participant_sid: Optional[str] = None
    conference_recording_url: Optional[str] = None
    conference_recording_sid: Optional[str] = None
    conference_transcript: list = field(default_factory=list)
    
    def is_expired(self, timeout_seconds: int) -> bool:
        """Check if session has expired due to inactivity."""
        return (time.time() - self.last_activity) > timeout_seconds
    
    def touch(self) -> None:
        """Update last activity timestamp."""
        self.last_activity = time.time()
    
    def add_message(self, role: str, content: str) -> None:
        """Add a message to conversation history and track token usage."""
        self.conversation_history.append({
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Estimate token count (roughly 4 chars per token for English)
        estimated_tokens = max(1, len(content) // 4)
        
        if role == "user":
            self.input_tokens += estimated_tokens
        else:
            self.output_tokens += estimated_tokens
        
        self.total_tokens = self.input_tokens + self.output_tokens
        
        # ═══════════════════════════════════════════════════════════════════════
        # OPENAI REALTIME API PRICING (gpt-4o-realtime-preview-2024-12-17)
        # Model: gpt-realtime-2025-08-28
        # ═══════════════════════════════════════════════════════════════════════
        # Text Tokens (per 1M):
        #   - Input:  $4.00   | Cached: $0.50  | Output: $16.00
        # Audio Tokens (per 1M):
        #   - Input: $32.00   | Cached: $0.50  | Output: $64.00
        # 
        # For voice calls, the majority of tokens are AUDIO tokens.
        # We estimate ~80% audio, ~20% text for realistic voice conversations.
        # ═══════════════════════════════════════════════════════════════════════
        
        # Pricing per token (USD)
        TEXT_INPUT_PER_TOKEN = 4.00 / 1_000_000      # $4.00 per 1M text input tokens
        TEXT_OUTPUT_PER_TOKEN = 16.00 / 1_000_000   # $16.00 per 1M text output tokens
        AUDIO_INPUT_PER_TOKEN = 32.00 / 1_000_000   # $32.00 per 1M audio input tokens
        AUDIO_OUTPUT_PER_TOKEN = 64.00 / 1_000_000  # $64.00 per 1M audio output tokens
        
        # For voice calls: 80% audio, 20% text
        AUDIO_RATIO = 0.80
        TEXT_RATIO = 0.20
        
        # Calculate weighted costs
        input_text_tokens = self.input_tokens * TEXT_RATIO
        input_audio_tokens = self.input_tokens * AUDIO_RATIO
        output_text_tokens = self.output_tokens * TEXT_RATIO
        output_audio_tokens = self.output_tokens * AUDIO_RATIO
        
        input_cost = (input_text_tokens * TEXT_INPUT_PER_TOKEN) + (input_audio_tokens * AUDIO_INPUT_PER_TOKEN)
        output_cost = (output_text_tokens * TEXT_OUTPUT_PER_TOKEN) + (output_audio_tokens * AUDIO_OUTPUT_PER_TOKEN)
        
        self.ai_cost_usd = input_cost + output_cost
        
        self.touch()
    
    def add_conference_transcript(self, speaker: str, content: str) -> None:
        """Add a transcript entry from the conference call."""
        self.conference_transcript.append({
            "speaker": speaker,  # "caller", "human_agent", or "ai"
            "content": content,
            "timestamp": datetime.utcnow().isoformat()
        })
        self.touch()
    
    def add_tool_call(self, name: str, arguments: Dict[str, Any], result: Any, success: bool) -> None:
        """Record a tool/function call made during the session."""
        self.tool_calls.append({
            "name": name,
            "arguments": arguments,
            "result": result,
            "success": success,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Track ticket creation and escalation
        if name == "create_ticket" and success:
            self.ticket_created = True
        if name in ("escalate_ticket", "transfer_to_human", "escalate_to_human") and success:
            self.escalated = True
            self.ai_resolution = False
        
        self.touch()
    
    def add_agent_handoff(self, from_agent: str, to_agent: str, reason: Optional[str] = None) -> None:
        """Record an agent-to-agent handoff."""
        self.agent_handoffs.append({
            "from_agent": from_agent,
            "to_agent": to_agent,
            "reason": reason,
            "timestamp": datetime.utcnow().isoformat()
        })
        # Update current agent type
        self.agent_type = to_agent
        self.touch()


class VoiceSessionManager(ISessionManager):
    """Manages voice call sessions with thread-safe operations."""
    
    def __init__(self, max_sessions: Optional[int] = None, timeout_seconds: Optional[int] = None):
        config = get_config()
        self.max_sessions = max_sessions or config.max_concurrent_sessions
        self.timeout_seconds = timeout_seconds or config.session_timeout_seconds
        
        self._sessions: Dict[str, VoiceSession] = {}
        self._lock = asyncio.Lock()
        
        # Cleanup task
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False
    
    async def start(self) -> None:
        """Start the session manager and background cleanup task."""
        if self._running:
            return
        
        self._running = True
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("VoiceSessionManager started")
    
    async def stop(self) -> None:
        """Stop the session manager and cleanup all sessions."""
        self._running = False
        
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None
        
        # End all active sessions
        async with self._lock:
            session_ids = list(self._sessions.keys())
        
        for session_id in session_ids:
            await self.end_session(session_id)
        
        logger.info("VoiceSessionManager stopped")
    
    async def create_session(
        self,
        call_info: CallInfo,
        call_source: str = "twilio",
        industry_slug: Optional[str] = None,
    ) -> str:
        """Create a new voice session.

        Args:
            call_info: Call information
            call_source: 'twilio' for PSTN calls via Twilio, 'webrtc' for browser-based calls
            industry_slug: industry persona this session impersonates (demo mode)
        """
        async with self._lock:
            # Check session limit
            if len(self._sessions) >= self.max_sessions:
                # Try to cleanup expired sessions first
                await self._cleanup_expired_locked()
                
                if len(self._sessions) >= self.max_sessions:
                    raise RuntimeError("Maximum concurrent sessions reached")
            
            # Generate unique session ID
            session_id = f"voice-{uuid.uuid4().hex[:12]}"
            
            # Create session with call source
            session = VoiceSession(
                session_id=session_id,
                call_info=call_info,
                callback_number=call_info.from_number,
                call_source=call_source,
                industry_slug=industry_slug,
            )

            # Label the agent by its industry (not the legacy "reclaim" default)
            # so the live monitor / call logs show e.g. "Body Care Agent".
            try:
                from industry_context import get_industry

                ind_name = get_industry(industry_slug).get("name") or "AI"
                session.agent_type = f"{ind_name} Agent"
            except Exception:
                session.agent_type = "AI Agent"

            self._sessions[session_id] = session

            logger.info(
                f"Created session {session_id} for call {call_info.call_sid} "
                f"(source: {call_source}, industry: {industry_slug or 'none'}, "
                f"agent: {session.agent_type})"
            )
            
            # Notify backend of new call
            await self._notify_call_update()
            
            return session_id
    
    async def get_session(self, session_id: str) -> Optional[VoiceSession]:
        """Get session by ID."""
        async with self._lock:
            return self._sessions.get(session_id)
    
    async def update_session_state(self, session_id: str, state: CallState) -> None:
        """Update the state of a session."""
        async with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.state = state
                session.touch()
                logger.info(f"Session {session_id} state updated to {state.value}")
    
    async def end_session(self, session_id: str) -> None:
        """End and cleanup a session."""
        async with self._lock:
            session = self._sessions.pop(session_id, None)
        
        if session:
            # Notify backend of call end
            await self._notify_call_end(session.call_info.call_sid)
            
            # Save call log to database
            await self._save_call_log(session)
            
            # Cleanup resources (only if not already disconnected)
            if session.realtime_connection and session.realtime_connection._ws:
                try:
                    await session.realtime_connection.disconnect()
                except Exception as e:
                    logger.error(f"Error disconnecting realtime: {e}")
            
            logger.info(f"Ended session {session_id}, duration: {time.time() - session.created_at:.1f}s")
            
            # Push updated live calls list (with this call removed)
            await self._notify_call_update()
    
    async def _save_call_log(self, session: VoiceSession) -> None:
        """Save call log and transcript to database."""
        try:
            from db.connection import get_db
            db = get_db()
            
            duration = int(time.time() - session.created_at)
            
            # Build transcript from conversation history
            transcript_parts = []
            for msg in session.conversation_history:
                role = msg.get('role', 'unknown')
                content = msg.get('content', '')
                transcript_parts.append(f"[{role}]: {content}")
            transcript = "\n".join(transcript_parts)
            
            # Build call summary
            summary_parts = []
            if session.caller_name:
                summary_parts.append(f"Caller: {session.caller_name}")
            if session.company_name:
                summary_parts.append(f"Company: {session.company_name}")
            if session.device_type:
                summary_parts.append(f"Device: {session.device_type}")
            if session.ticket_created:
                summary_parts.append("Ticket created")
            if session.escalated:
                summary_parts.append("Escalated")
            summary_parts.append(f"Duration: {duration}s")
            summary_parts.append(f"Messages: {len(session.conversation_history)}")
            call_summary = " | ".join(summary_parts) if summary_parts else None
            
            # Determine AI resolution (resolved if not escalated and had conversation)
            ai_resolution = not session.escalated and len(session.conversation_history) > 0

            # Generate a unique call_id (required primary key)
            call_id = str(uuid.uuid4())

            # ── AI per-call lead scoring (demo) ──────────────────────────────
            # Score the transcript and derive profit projections from the
            # industry's business_economics. Wrapped so any scoring failure
            # never blocks the call-log save.
            scoring: Dict[str, Any] = {}
            try:
                if transcript and transcript.strip():
                    from industry_context import get_industry
                    from call_scoring import score_and_value

                    industry = get_industry(session.industry_slug)
                    scored = score_and_value(
                        transcript,
                        industry_id=industry.get("id"),
                        industry_slug=session.industry_slug,
                        industry_name=industry.get("name"),
                    )
                    if scored:
                        scoring = scored
                        logger.info(
                            f"Scored session {session.session_id}: "
                            f"score={scored.get('lead_score')} "
                            f"status={scored.get('lead_status')} "
                            f"intent={scored.get('intent')!r}"
                        )
            except Exception as e:
                logger.error(f"Lead scoring failed for {session.session_id}: {e}")
            
            # Insert call log with all fields
            call_log_data = {
                "call_id": call_id,
                "session_id": session.session_id,
                "call_sid": session.call_info.call_sid,
                "from_number": session.call_info.from_number,
                # The dashboard reads caller_phone; persist the real PSTN caller
                # number (Twilio `From`) there too. Browser/WebRTC has no number.
                "caller_phone": (
                    session.call_info.from_number
                    if session.call_source == "twilio"
                    and session.call_info.from_number
                    and not session.call_info.from_number.startswith(("client:", "webrtc:"))
                    else None
                ),
                "to_number": session.call_info.to_number,
                "direction": session.call_info.direction or "inbound",
                "call_source": session.call_source,  # 'twilio' or 'webrtc'
                "status": "completed",
                "duration_seconds": duration,
                "transcript": transcript if transcript else None,
                "call_summary": call_summary,
                "caller_name": session.caller_name,
                "company_name": session.company_name,
                "ai_resolution": ai_resolution,
                "was_resolved": ai_resolution,
                "escalated": session.escalated,
                "was_escalated": session.escalated,
                "escalated_to": "human_agent" if session.escalated else None,
                "ticket_created": session.ticket_created,
                "agent_type": session.agent_type,
                "started_at": datetime.utcfromtimestamp(session.created_at).isoformat(),
                "ended_at": datetime.utcnow().isoformat(),
                # Demo multi-industry + lead scoring columns.
                "industry_slug": session.industry_slug,
                "lead_score": scoring.get("lead_score"),
                "intent": scoring.get("intent"),
                "lead_status": scoring.get("lead_status"),
                "est_deal_value": scoring.get("est_deal_value"),
                "interest_profit": scoring.get("interest_profit"),
                "close_profit": scoring.get("close_profit"),
                "score_reason": scoring.get("score_reason"),
            }

            result = db.insert("call_logs", call_log_data)
            logger.info(f"Saved call log for session {session.session_id}: call_id={call_id}")
            
            # Save AI usage log if tokens were used
            if session.total_tokens > 0:
                try:
                    from .config import get_config
                    config = get_config()
                    # Use realtime model for voice sessions
                    model = getattr(config, "openai_realtime_model", "gpt-realtime-2025-08-28")
                    ai_log_data = {
                        "call_id": call_id,
                        "call_sid": session.call_info.call_sid,
                        "session_id": session.session_id,
                        "model": model,
                        "input_tokens": session.input_tokens,
                        "output_tokens": session.output_tokens,
                        "total_tokens": session.total_tokens,
                        "cost_usd": session.ai_cost_usd,
                        "response_time_ms": 0,
                        "agent_type": session.agent_type
                    }
                    db.insert("ai_usage_logs", ai_log_data)
                    logger.info(f"Saved AI usage log: {session.total_tokens} tokens for model {model}")
                except Exception as e:
                    logger.error(f"Failed to save AI usage log: {e}")
            
            # Save agent_interactions with tool calls data
            try:
                import json as json_module
                
                # Count successful and failed tool calls
                successful_tools = [tc for tc in session.tool_calls if tc.get("success", False)]
                failed_tools = [tc for tc in session.tool_calls if not tc.get("success", False)]
                
                # Check if any tool call was a handoff
                was_handoff = session.escalated or any(
                    tc.get("name") in ("transfer_to_human", "escalate_ticket", "escalate_to_human")
                    for tc in session.tool_calls
                )
                
                # Get handoff destination if applicable
                handoff_to = None
                if was_handoff:
                    for tc in session.tool_calls:
                        if tc.get("name") in ("transfer_to_human", "escalate_ticket", "escalate_to_human"):
                            handoff_to = tc.get("arguments", {}).get("reason", "human_agent")
                            break
                
                interaction_data = {
                    "call_id": call_id,
                    "session_id": session.session_id,
                    "agent_type": session.agent_type,
                    "agent_name": session.agent_type,
                    "started_at": datetime.utcfromtimestamp(session.created_at).isoformat(),
                    "ended_at": datetime.utcnow().isoformat(),
                    "duration_ms": duration * 1000,
                    "turn_count": len(session.conversation_history),
                    "tools_called": json_module.dumps(session.tool_calls) if session.tool_calls else "[]",
                    "tool_call_count": len(session.tool_calls),
                    "failed_tool_calls": len(failed_tools),
                    "was_handoff": was_handoff,
                    "handoff_to": handoff_to
                }
                db.insert("agent_interactions", interaction_data)
                logger.info(f"Saved agent interaction: {len(session.tool_calls)} tool calls, handoff={was_handoff}")
            except Exception as e:
                logger.error(f"Failed to save agent interaction: {e}")
            
        except Exception as e:
            logger.error(f"Failed to save call log for session {session.session_id}: {e}")
    
    async def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions and return count."""
        async with self._lock:
            return await self._cleanup_expired_locked()
    
    async def _cleanup_expired_locked(self) -> int:
        """Internal cleanup (assumes lock is held)."""
        expired = [
            sid for sid, session in self._sessions.items()
            if session.is_expired(self.timeout_seconds)
        ]
        
        for session_id in expired:
            session = self._sessions.pop(session_id, None)
            if session and session.realtime_connection:
                try:
                    await session.realtime_connection.disconnect()
                except Exception:
                    pass
        
        if expired:
            logger.info(f"Cleaned up {len(expired)} expired sessions")
        
        return len(expired)
    
    async def _notify_call_update(self) -> None:
        """Notify backend of live calls update for WebSocket broadcast."""
        try:
            from .event_notifier import get_event_notifier
            notifier = get_event_notifier()
            
            calls, metrics = self._build_live_calls_data()
            await notifier.push_live_calls_update(calls, metrics)
        except Exception as e:
            logger.debug(f"Could not notify call update: {e}")
    
    async def _notify_call_end(self, call_sid: str) -> None:
        """Notify backend when a call ends."""
        try:
            from .event_notifier import get_event_notifier
            notifier = get_event_notifier()
            await notifier.notify_call_end(call_sid)
        except Exception as e:
            logger.debug(f"Could not notify call end: {e}")
    
    async def notify_transcript_update(self, session_id: str, role: str, content: str) -> None:
        """Notify backend of new transcript entry and push full update."""
        try:
            from .event_notifier import get_event_notifier
            notifier = get_event_notifier()
            await notifier.notify_transcript(session_id, role, content)
            
            # Also push full live calls update for the dashboard
            calls, metrics = self._build_live_calls_data()
            await notifier.push_live_calls_update(calls, metrics)
        except Exception as e:
            logger.debug(f"Could not notify transcript update: {e}")
    
    def _build_live_calls_data(self) -> tuple:
        """Build the live calls data for WebSocket broadcast."""
        from datetime import datetime
        
        calls = []
        agents_set = set()
        total_duration = 0
        inbound_count = 0
        outbound_count = 0
        
        for session in self._sessions.values():
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
            current_agent = session.agent_type or "reclaim_receptionist"
            agent_history.append({
                "agentName": current_agent,
                "action": "Started conversation",
                "timestamp": datetime.utcfromtimestamp(session.created_at).isoformat()
            })
            
            calls.append({
                "callSid": session.call_info.call_sid,
                "sessionId": session.session_id,
                "from": session.call_info.from_number,
                "to": session.call_info.to_number,
                "direction": direction,
                "status": "in-progress",
                "startTime": datetime.utcfromtimestamp(session.created_at).isoformat(),
                "startedAt": datetime.utcfromtimestamp(session.created_at).isoformat(),
                "duration": duration,
                "callerName": session.caller_name,
                "companyName": session.company_name,
                "currentAgent": current_agent,
                "agentType": current_agent,
                "industry": session.industry_slug,
                "transcript": transcript,
                "agentHistory": agent_history,
                "sentiment": "neutral",
                "ticketCreated": session.ticket_created,
                "escalated": session.escalated
            })
        
        avg_duration = total_duration // len(self._sessions) if self._sessions else 0
        
        metrics = {
            "activeCalls": len(self._sessions),
            "inbound": inbound_count,
            "outbound": outbound_count,
            "avgDuration": avg_duration,
            "activeAgents": list(agents_set)
        }
        
        return calls, metrics
    
    async def _cleanup_loop(self) -> None:
        """Background task to periodically cleanup expired sessions."""
        while self._running:
            try:
                await asyncio.sleep(60)  # Check every minute
                await self.cleanup_expired_sessions()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Cleanup loop error: {e}")
    
    @property
    def active_session_count(self) -> int:
        """Get the number of active sessions."""
        return len(self._sessions)
    
    def get_all_sessions(self) -> list:
        """Get all active sessions (for live monitoring)."""
        return list(self._sessions.values())


# Global session manager instance
_session_manager: Optional[VoiceSessionManager] = None


async def init_session_manager() -> VoiceSessionManager:
    """Initialize and start the global session manager."""
    global _session_manager
    if _session_manager is None:
        _session_manager = VoiceSessionManager()
        await _session_manager.start()
    return _session_manager


def get_session_manager() -> VoiceSessionManager:
    """Get the global session manager instance."""
    global _session_manager
    if _session_manager is None:
        _session_manager = VoiceSessionManager()
    return _session_manager
