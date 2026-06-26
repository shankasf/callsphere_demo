"""
Main entry point for running the U Rack IT SIP voice server.

Usage:
    python -m sip_integration.server
    or
    uvicorn sip_integration.server:app --host 0.0.0.0 --port 8080 --reload
"""

import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import uvicorn
from dotenv import load_dotenv

from .config import get_config
from .webhook_server import create_app

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


def main():
    """Run the SIP voice server."""
    # Load environment variables
    load_dotenv()
    
    # Get configuration
    config = get_config()
    
    # Validate configuration
    errors = config.validate()
    if errors:
        for error in errors:
            logger.error(f"Configuration error: {error}")
        logger.info("Please set the required environment variables in .env file")
        sys.exit(1)
    
    logger.info("=" * 60)
    logger.info("U Rack IT Voice Agent - SIP Integration Server")
    logger.info("=" * 60)
    logger.info(f"Host: {config.webhook_host}")
    logger.info(f"Port: {config.webhook_port}")
    logger.info(f"OpenAI Model: {config.openai_realtime_model}")
    logger.info(f"Voice: {config.voice}")
    logger.info(f"Max Sessions: {config.max_concurrent_sessions}")
    logger.info("=" * 60)
    
    if config.webhook_base_url:
        logger.info(f"Webhook URL: {config.webhook_base_url}/twilio")
    else:
        logger.warning("WEBHOOK_BASE_URL not set - using request URL for WebSocket")
    
    logger.info("")
    logger.info("Configure your Twilio phone number webhook to:")
    logger.info(f"  POST https://your-domain/twilio")
    logger.info("")
    
    # Create and run app
    app = create_app()
    
    uvicorn.run(
        app,
        host=config.webhook_host,
        port=config.webhook_port,
        log_level="info"
    )


# App instance for uvicorn command-line usage
app = create_app()


if __name__ == "__main__":
    main()
