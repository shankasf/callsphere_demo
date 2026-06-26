"""
Agents for the Reclaim AI receptionist.

Reclaim uses a single receptionist agent (the legacy IT-helpdesk specialist
agents are intentionally not loaded).
"""

from .triage_agent import triage_agent

__all__ = [
    "triage_agent",
]
