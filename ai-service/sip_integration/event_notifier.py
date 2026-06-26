"""
Event notifier for pushing real-time updates to the Go gateway backend.
"""

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)


class EventNotifier:
    """
    Notifies the Go gateway backend of call events for WebSocket broadcast.
    Uses /v2/api/ prefix for internal endpoints with API key auth.
    """

    def __init__(self):
        self.backend_url = os.getenv(
            "BACKEND_URL", "http://gateway.urackit.local:8080"
        )
        self.internal_key = os.getenv("INTERNAL_API_KEY", "internal-secret")
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "Content-Type": "application/json",
                    "x-internal-key": self.internal_key,
                },
                timeout=aiohttp.ClientTimeout(total=5),
            )
        return self._session

    async def close(self):
        """Close the HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()

    async def push_live_calls_update(self, calls: List[Dict], metrics: Dict):
        """Push full live calls update to backend."""
        try:
            session = await self._get_session()
            async with session.post(
                f"{self.backend_url}/api/calls/live/update",
                json={"calls": calls, "metrics": metrics},
            ) as response:
                if response.status != 200 and response.status != 201:
                    logger.warning(f"Failed to push live calls update: {response.status}")
        except Exception as e:
            logger.debug(f"Could not push live calls update: {e}")

    async def notify_call_start(self, call_data: Dict):
        """Notify backend when a new call starts."""
        try:
            session = await self._get_session()
            async with session.post(
                f"{self.backend_url}/api/calls/live/event",
                json={"type": "start", "data": call_data},
            ) as response:
                if response.status != 200 and response.status != 201:
                    logger.warning(f"Failed to notify call start: {response.status}")
        except Exception as e:
            logger.debug(f"Could not notify call start: {e}")

    async def notify_call_update(self, call_data: Dict):
        """Notify backend when a call is updated."""
        try:
            session = await self._get_session()
            async with session.post(
                f"{self.backend_url}/api/calls/live/event",
                json={"type": "update", "data": call_data},
            ) as response:
                if response.status != 200 and response.status != 201:
                    logger.warning(f"Failed to notify call update: {response.status}")
        except Exception as e:
            logger.debug(f"Could not notify call update: {e}")

    async def notify_call_end(self, call_sid: str):
        """Notify backend when a call ends."""
        try:
            session = await self._get_session()
            async with session.post(
                f"{self.backend_url}/api/calls/live/event",
                json={"type": "end", "data": {"callSid": call_sid}},
            ) as response:
                if response.status != 200 and response.status != 201:
                    logger.warning(f"Failed to notify call end: {response.status}")
        except Exception as e:
            logger.debug(f"Could not notify call end: {e}")

    async def notify_transcript(self, session_id: str, role: str, content: str):
        """Notify backend of new transcript entry."""
        try:
            session = await self._get_session()
            async with session.post(
                f"{self.backend_url}/api/calls/live/event",
                json={
                    "type": "transcript",
                    "data": {
                        "sessionId": session_id,
                        "role": role,
                        "content": content,
                    },
                },
            ) as response:
                if response.status != 200 and response.status != 201:
                    logger.warning(f"Failed to notify transcript: {response.status}")
        except Exception as e:
            logger.debug(f"Could not notify transcript: {e}")


# Global instance
_notifier: Optional[EventNotifier] = None


def get_event_notifier() -> EventNotifier:
    """Get the global event notifier instance."""
    global _notifier
    if _notifier is None:
        _notifier = EventNotifier()
    return _notifier


async def close_event_notifier():
    """Close the global event notifier."""
    global _notifier
    if _notifier:
        await _notifier.close()
        _notifier = None
