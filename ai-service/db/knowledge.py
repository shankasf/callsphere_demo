"""
Knowledge base retrieval for the Reclaim voice agent.

Backed by a pgvector table (`knowledge_chunks`) seeded from a crawl of
helloreclaim.com. The voice agent calls `search_knowledge` to ground its
answers about Reclaim's luggage pickup / airport delivery service.

All embeddings use OpenAI (text-embedding-3-small, 1536 dims) — same
OpenAI infrastructure as the Realtime voice model.
"""

import logging
import os
from typing import List

import psycopg2

logger = logging.getLogger(__name__)

EMBED_MODEL = "text-embedding-3-small"
EMBED_URL = "https://api.openai.com/v1/embeddings"


def _embed(text: str) -> List[float]:
    """Embed a single query string via the OpenAI embeddings API."""
    import requests

    key = os.getenv("OPENAI_API_KEY", "")
    resp = requests.post(
        EMBED_URL,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": EMBED_MODEL, "input": text},
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"


def search_knowledge(query: str, k: int = 5) -> str:
    """Search Reclaim's business knowledge base for information to answer a
    caller's question. Use this for ANY question about Reclaim's service:
    pricing, cities served, how pickup/delivery works, timing, what's included,
    partners, coverage areas, and general company info. Pass the caller's
    question (or the key topic) as `query`. Returns the most relevant facts.
    """
    try:
        qvec = _vec_literal(_embed(query))
    except Exception as e:  # pragma: no cover - network/runtime guard
        logger.error(f"knowledge embed failed: {e}")
        return "I'm having trouble looking that up right now."

    db = os.getenv("DATABASE_URL", "")
    try:
        conn = psycopg2.connect(db)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT content, 1 - (embedding <=> %s) AS sim
                    FROM knowledge_chunks
                    ORDER BY embedding <=> %s
                    LIMIT %s
                    """,
                    (qvec, qvec, k),
                )
                rows = cur.fetchall()
        finally:
            conn.close()
    except Exception as e:  # pragma: no cover
        logger.error(f"knowledge search failed: {e}")
        return "I'm having trouble looking that up right now."

    if not rows:
        return "I don't have specific information on that. Let me connect you with our team."

    # Keep it tight for a voice context — the model summarizes from these facts.
    snippets = []
    for content, sim in rows:
        if sim is not None and sim < 0.15:
            continue
        snippets.append(content.strip())
    if not snippets:
        return "I don't have specific information on that. Let me connect you with our team."
    return "\n\n---\n\n".join(snippets[:k])
