"""
Configuration module for U Rack IT SIP integration.
"""

import os
from dataclasses import dataclass, field
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


@dataclass
class SIPConfig:
    """Configuration for SIP/Voice integration."""
    
    # OpenAI Settings
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    openai_project_id: str = field(default_factory=lambda: os.getenv("OPENAI_PROJECT_ID", ""))
    openai_realtime_model: str = field(default_factory=lambda: os.getenv("OPENAI_REALTIME_MODEL") or "gpt-realtime-2")
    # Session-level reasoning effort for the GA Realtime voice model (low|medium|...).
    openai_realtime_reasoning_effort: str = field(default_factory=lambda: os.getenv("OPENAI_REALTIME_REASONING_EFFORT") or "low")
    openai_realtime_url: str = "wss://api.openai.com/v1/realtime"
    
    # Twilio Settings
    twilio_account_sid: str = field(default_factory=lambda: os.getenv("TWILIO_ACCOUNT_SID", ""))
    twilio_auth_token: str = field(default_factory=lambda: os.getenv("TWILIO_AUTH_TOKEN", ""))
    twilio_phone_number: str = field(default_factory=lambda: os.getenv("TWILIO_PHONE_NUMBER", ""))
    twilio_twiml_app_sid: str = field(default_factory=lambda: os.getenv("TWILIO_TWIML_APP_SID", ""))
    twilio_api_key_sid: str = field(default_factory=lambda: os.getenv("TWILIO_API_KEY_SID", ""))
    twilio_api_key_secret: str = field(default_factory=lambda: os.getenv("TWILIO_API_KEY_SECRET", ""))
    
    # Server Settings
    webhook_host: str = field(default_factory=lambda: os.getenv("WEBHOOK_HOST", "0.0.0.0"))
    webhook_port: int = field(default_factory=lambda: int(os.getenv("WEBHOOK_PORT", "8080")))
    webhook_base_url: str = field(default_factory=lambda: os.getenv("WEBHOOK_BASE_URL", ""))
    
    # Voice Settings
    voice: str = field(default_factory=lambda: os.getenv("VOICE", "alloy"))  # OpenAI voice: alloy, echo, shimmer, ash, ballad, coral, sage, verse
    input_audio_format: str = "g711_ulaw"  # Twilio uses G.711 μ-law
    output_audio_format: str = "g711_ulaw"
    
    # Session Settings
    session_timeout_seconds: int = 600  # 10 minutes
    max_concurrent_sessions: int = 100
    
    # Human Agent Transfer Settings
    human_agent_phone: str = field(default_factory=lambda: os.getenv("HUMAN_AGENT_PHONE", "+917277534021"))
    
    @property
    def webhook_domain(self) -> str:
        """Get the domain from webhook_base_url."""
        if self.webhook_base_url:
            return self.webhook_base_url.replace("https://", "").replace("http://", "")
        return "helloreclaim.callsphere.site"
    
    # System prompt is now loaded from triage_agent.py to avoid duplication
    # See app_agents/triage_agent.py for the voice agent prompt

    def validate(self) -> list[str]:
        """Validate configuration and return list of errors."""
        errors = []
        if not self.openai_api_key:
            errors.append("OPENAI_API_KEY is required")
        if not self.twilio_account_sid:
            errors.append("TWILIO_ACCOUNT_SID is required")
        return errors


# Global config instance
_config: Optional[SIPConfig] = None


def get_config() -> SIPConfig:
    """Get or create the global configuration instance."""
    global _config
    if _config is None:
        _config = SIPConfig()
    return _config


def set_config(config: SIPConfig) -> None:
    """Set a custom configuration instance."""
    global _config
    _config = config
