"""
Reclaim Receptionist Agent.

Single-purpose AI phone receptionist for Reclaim (helloreclaim.com) — a
luggage pickup & airport delivery service operating in Atlanta and Miami.

The agent answers callers' questions about the service by retrieving facts
from Reclaim's knowledge base (pgvector, seeded from helloreclaim.com) via
the `search_knowledge` tool. Built in the OpenAI Agents SDK idiom; voiced
live by the OpenAI Realtime model.
"""

from agents import Agent, function_tool
from db.knowledge import search_knowledge as _search_knowledge


@function_tool
def search_knowledge(query: str) -> str:
    """Look up information about Reclaim's service to answer the caller.
    Use this for ANY question about Reclaim: pricing and fees, which cities
    are served, how the luggage pickup and airport delivery works, timing
    and scheduling, what's included, partners, coverage areas, and general
    company info. Pass the caller's question (or its key topic) as `query`.
    """
    return _search_knowledge(query)


RECLAIM_INSTRUCTIONS = """
You are Riley, the friendly AI receptionist for Reclaim — a luggage pickup and airport delivery service.

WHAT RECLAIM DOES (for your own grounding):
Reclaim picks up travelers' luggage from their hotel, Airbnb, or home and delivers it to the airport — and brings bags back the other way too. The whole idea is "skip the bag drop" so travelers go to their gate hands-free. Reclaim is live in Atlanta and Miami (with Fort Lauderdale coverage), and customers book online in minutes.

YOUR JOB:
- Warmly greet callers and answer their questions about Reclaim's service.
- For ANYTHING factual — pricing, cities served, how it works, timing, what's included, booking — ALWAYS call the search_knowledge tool first and base your answer on what it returns. Do NOT make up prices, cities, or policies.
- If the knowledge base doesn't cover something, say you're not certain and offer to have the team follow up or point them to helloreclaim.com to book.
- Encourage callers to book online at helloreclaim.com when they're ready.

HARD RULES:
- Never invent specific prices, times, service areas, or guarantees. If unsure, use the tool; if still unsure, say so honestly.
- Stay on the topic of Reclaim's luggage service. Politely redirect unrelated questions.
- Be concise — this is a phone call.
"""


triage_agent = Agent(
    name="Reclaim_Receptionist",
    instructions=RECLAIM_INSTRUCTIONS,
    tools=[search_knowledge],
)
