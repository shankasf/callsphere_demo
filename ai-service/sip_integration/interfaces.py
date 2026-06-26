"""
Abstract base classes and interfaces for SIP integration.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Optional, Dict
import asyncio


class CallState(Enum):
    """Possible states of a voice call."""
    RINGING = "ringing"
    CONNECTED = "connected"
    ON_HOLD = "on_hold"
    TRANSFERRING = "transferring"
    ENDED = "ended"
    FAILED = "failed"


class AudioFormat(Enum):
    """Supported audio formats."""
    G711_ULAW = "g711_ulaw"  # Twilio default
    G711_ALAW = "g711_alaw"
    PCM16 = "pcm16"


@dataclass
class CallInfo:
    """Information about an incoming call."""
    call_sid: str
    from_number: str
    to_number: str
    direction: str
    account_sid: Optional[str] = None
    status: Optional[str] = None
    caller_name: Optional[str] = None
    caller_city: Optional[str] = None
    caller_state: Optional[str] = None
    caller_zip: Optional[str] = None
    caller_country: Optional[str] = None


@dataclass
class AudioChunk:
    """A chunk of audio data."""
    data: bytes
    format: AudioFormat
    timestamp: float
    is_final: bool = False


class ICallHandler(ABC):
    """Interface for handling incoming calls."""
    
    @abstractmethod
    async def on_call_received(self, call_info: CallInfo) -> str:
        """Handle incoming call and return TwiML response."""
        pass
    
    @abstractmethod
    async def on_call_connected(self, call_sid: str) -> None:
        """Handle call connection established."""
        pass
    
    @abstractmethod
    async def on_call_ended(self, call_sid: str, reason: str) -> None:
        """Handle call termination."""
        pass


class IAudioProcessor(ABC):
    """Interface for processing audio streams."""
    
    @abstractmethod
    async def process_audio_input(self, audio: AudioChunk) -> None:
        """Process incoming audio from caller."""
        pass
    
    @abstractmethod
    async def get_audio_output(self) -> Optional[AudioChunk]:
        """Get outgoing audio to send to caller."""
        pass


class IRealtimeConnection(ABC):
    """Interface for real-time AI connection."""
    
    @abstractmethod
    async def connect(self, session_id: str) -> bool:
        """Establish connection to AI service."""
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """Close connection to AI service."""
        pass
    
    @abstractmethod
    async def send_audio(self, audio: AudioChunk) -> None:
        """Send audio to AI service."""
        pass
    
    @abstractmethod
    async def send_text(self, text: str) -> None:
        """Send text input to AI service."""
        pass
    
    @abstractmethod
    def set_audio_callback(self, callback: Callable[[AudioChunk], None]) -> None:
        """Set callback for receiving audio from AI."""
        pass
    
    @abstractmethod
    def set_text_callback(self, callback: Callable[[str], None]) -> None:
        """Set callback for receiving text transcription."""
        pass
    
    @abstractmethod
    def set_function_callback(self, callback: Callable[[str, Dict[str, Any]], Any]) -> None:
        """Set callback for function/tool calls from AI."""
        pass


class ISessionManager(ABC):
    """Interface for managing voice sessions."""
    
    @abstractmethod
    async def create_session(self, call_info: CallInfo) -> str:
        """Create a new voice session and return session ID."""
        pass
    
    @abstractmethod
    async def get_session(self, session_id: str) -> Optional[Any]:
        """Get session by ID."""
        pass
    
    @abstractmethod
    async def end_session(self, session_id: str) -> None:
        """End and cleanup a session."""
        pass
    
    @abstractmethod
    async def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions and return count."""
        pass


class IAgentAdapter(ABC):
    """Interface for adapting existing agents for voice."""
    
    @abstractmethod
    async def process_input(self, session_id: str, text: str) -> str:
        """Process text input through agent and return response."""
        pass
    
    @abstractmethod
    def get_tools_schema(self) -> list[dict]:
        """Get JSON schema for available tools."""
        pass
    
    @abstractmethod
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Execute a tool and return result."""
        pass


class ITelephonyProvider(ABC):
    """Interface for telephony providers like Twilio."""
    
    @abstractmethod
    def generate_connect_response(self, stream_url: str, call_info: CallInfo) -> str:
        """Generate response to connect call to media stream."""
        pass
    
    @abstractmethod
    def generate_say_response(self, text: str, voice: str = "Polly.Joanna") -> str:
        """Generate TwiML to speak text."""
        pass
    
    @abstractmethod
    def generate_hangup_response(self) -> str:
        """Generate TwiML to hang up call."""
        pass
    
    @abstractmethod
    async def validate_request(self, url: str, params: dict, signature: str) -> bool:
        """Validate incoming webhook request signature."""
        pass
