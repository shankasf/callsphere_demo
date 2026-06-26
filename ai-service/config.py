"""
Configuration module for URackIT AI Service.

Loads and validates environment variables.
"""

import os
from dataclasses import dataclass, field
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    """Application configuration."""

    # OpenAI
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    # Text model is read from env (OPENAI_MODEL) and served via the Responses API.
    # Falls back to the current default model only when the env var is empty.
    openai_model: str = field(default_factory=lambda: os.getenv("OPENAI_MODEL") or "gpt-5.5")
    # Reasoning effort for the Responses API text model (low|medium|high|...).
    openai_reasoning_effort: str = field(default_factory=lambda: os.getenv("OPENAI_REASONING_EFFORT") or "low")
    openai_realtime_model: str = field(default_factory=lambda: os.getenv("OPENAI_REALTIME_MODEL") or "gpt-realtime-2")
    # Session-level reasoning effort for the GA Realtime voice model.
    openai_realtime_reasoning_effort: str = field(default_factory=lambda: os.getenv("OPENAI_REALTIME_REASONING_EFFORT") or "low")
    voice: str = field(default_factory=lambda: os.getenv("VOICE", "alloy"))

    # Database (Aurora PostgreSQL)
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""))

    # Backend gateway
    backend_url: str = field(default_factory=lambda: os.getenv("BACKEND_URL", "http://gateway.urackit.local:8080"))

    # Server
    host: str = field(default_factory=lambda: os.getenv("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.getenv("PORT", "8081")))
    debug: bool = field(default_factory=lambda: os.getenv("DEBUG", "false").lower() == "true")

    # Twilio
    twilio_account_sid: str = field(default_factory=lambda: os.getenv("TWILIO_ACCOUNT_SID", ""))
    twilio_auth_token: str = field(default_factory=lambda: os.getenv("TWILIO_AUTH_TOKEN", ""))
    twilio_phone_number: str = field(default_factory=lambda: os.getenv("TWILIO_PHONE_NUMBER", ""))

    # Webhook
    webhook_base_url: str = field(default_factory=lambda: os.getenv("WEBHOOK_BASE_URL", ""))

    # Session
    max_concurrent_sessions: int = field(default_factory=lambda: int(os.getenv("MAX_SESSIONS", "100")))

    def validate(self) -> List[str]:
        """Validate configuration and return list of errors."""
        errors = []

        if not self.openai_api_key:
            errors.append("OPENAI_API_KEY is required")

        if not self.database_url:
            errors.append("DATABASE_URL is required")

        return errors


# Global config instance
_config: Optional[Config] = None


def get_config() -> Config:
    """Get the global configuration instance."""
    global _config
    if _config is None:
        _config = Config()
    return _config
