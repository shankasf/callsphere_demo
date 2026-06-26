"""
SIP Integration Module for U Rack IT Voice Agent

This module provides voice call handling via Twilio SIP and OpenAI Realtime API.

Usage:
    # Run the server
    python -m sip_integration.server
    
    # Or with uvicorn
    uvicorn sip_integration.server:app --host 0.0.0.0 --port 8080
"""

from .config import SIPConfig, get_config, set_config
from .webhook_server import create_app
from .interfaces import (
    ICallHandler,
    IAudioProcessor,
    IRealtimeConnection,
    ISessionManager,
    IAgentAdapter,
    ITelephonyProvider,
    CallInfo,
    CallState,
    AudioChunk,
    AudioFormat,
)

__all__ = [
    # Configuration
    "SIPConfig",
    "get_config",
    "set_config",
    # Server
    "create_app",
    # Interfaces
    "ICallHandler",
    "IAudioProcessor",
    "IRealtimeConnection",
    "ISessionManager",
    "IAgentAdapter",
    "ITelephonyProvider",
    # Data classes
    "CallInfo",
    "CallState",
    "AudioChunk",
    "AudioFormat",
]
