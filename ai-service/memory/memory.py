"""
Conversation memory module for URackIT AI Service.

Manages conversation history and context for sessions.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class ConversationTurn:
    """A single turn in the conversation."""
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)


class ConversationMemory:
    """Manages conversation history for a session."""
    
    def __init__(self, session_id: str, max_turns: int = 50):
        self.session_id = session_id
        self.max_turns = max_turns
        self.turns: List[ConversationTurn] = []
        self.context: Dict[str, Any] = {}
    
    def add_turn(self, role: str, content: str, metadata: Optional[Dict] = None) -> None:
        """Add a conversation turn."""
        turn = ConversationTurn(
            role=role,
            content=content,
            metadata=metadata or {},
        )
        self.turns.append(turn)
        
        # Trim if exceeding max turns
        if len(self.turns) > self.max_turns:
            self.turns = self.turns[-self.max_turns:]
    
    def set_context(self, key: str, value: Any) -> None:
        """Set a context value (e.g., caller info, organization_id)."""
        self.context[key] = value
    
    def get_context(self, key: str, default: Any = None) -> Any:
        """Get a context value."""
        return self.context.get(key, default)
    
    def get_all_context(self) -> Dict[str, Any]:
        """Get all context values."""
        return self.context.copy()
    
    def get_recent_turns(self, count: int = 10) -> List[ConversationTurn]:
        """Get the most recent conversation turns."""
        return self.turns[-count:]
    
    def get_messages_for_api(self, count: int = 10) -> List[Dict[str, str]]:
        """Get recent turns formatted for OpenAI API."""
        return [
            {"role": turn.role, "content": turn.content}
            for turn in self.get_recent_turns(count)
        ]
    
    def get_summary(self) -> str:
        """Get a summary of the conversation context."""
        summary_parts = []
        
        if self.context.get("caller_name"):
            summary_parts.append(f"Caller: {self.context['caller_name']}")
        if self.context.get("organization_name"):
            summary_parts.append(f"Organization: {self.context['organization_name']}")
        if self.context.get("organization_id"):
            summary_parts.append(f"Org ID: {self.context['organization_id']}")
        if self.context.get("contact_id"):
            summary_parts.append(f"Contact ID: {self.context['contact_id']}")
        if self.context.get("callback_number"):
            summary_parts.append(f"Callback: {self.context['callback_number']}")
        if self.context.get("device_type"):
            summary_parts.append(f"Device: {self.context['device_type']}")
        if self.context.get("ticket_number"):
            summary_parts.append(f"Ticket: {self.context['ticket_number']}")
        
        return " | ".join(summary_parts) if summary_parts else "No context captured yet."
    
    def clear(self) -> None:
        """Clear all conversation history."""
        self.turns.clear()
        self.context.clear()


# Session memory storage
_session_memories: Dict[str, ConversationMemory] = {}


def get_memory(session_id: str) -> ConversationMemory:
    """Get or create memory for a session."""
    if session_id not in _session_memories:
        _session_memories[session_id] = ConversationMemory(session_id)
    return _session_memories[session_id]


def clear_memory(session_id: str) -> None:
    """Clear and remove memory for a session."""
    if session_id in _session_memories:
        del _session_memories[session_id]


def get_active_session_count() -> int:
    """Get the number of active sessions."""
    return len(_session_memories)


def cleanup_old_sessions(max_age_hours: int = 24) -> int:
    """Remove sessions older than max_age_hours."""
    cutoff = datetime.utcnow()
    removed = 0
    
    for session_id in list(_session_memories.keys()):
        memory = _session_memories[session_id]
        if memory.turns:
            last_turn = memory.turns[-1]
            age = (cutoff - last_turn.timestamp).total_seconds() / 3600
            if age > max_age_hours:
                del _session_memories[session_id]
                removed += 1
    
    return removed
