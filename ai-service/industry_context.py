"""
Industry context loader for the CallSphere Demo AI service.

The demo is a single codebase that impersonates a different AI voice/chat
receptionist per *industry*. Each industry row in the `industries` table
carries the agent `persona` (system prompt) and opening `greeting`. This
module resolves an industry by slug and builds the per-industry system
prompt (persona + per-industry pgvector RAG snippets) used at chat /
realtime session start.

Everything is read-only against the demo DB and falls back to a generic
helpful-assistant persona when a slug is missing or unknown, so no entry
point can break just because a caller didn't supply an industry.
"""

import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Generic fallback (used when slug is missing / unknown / DB unavailable)
# ---------------------------------------------------------------------------

DEFAULT_SLUG = "generic"

DEFAULT_PERSONA = (
    "You are a friendly, professional AI receptionist. Greet the caller warmly "
    "and ask how you can help. Keep replies short — 1 to 2 sentences. For any "
    "factual question, rely ONLY on the knowledge provided to you; if you don't "
    "have it, say so honestly and offer to take a message or have the team "
    "follow up. Never invent prices, policies, or guarantees."
)

DEFAULT_GREETING = "Hi, thanks for calling! How can I help you today?"

# Concierge persona — ONLY for the shared single-line phone demo (resolved via
# the special "concierge" slug). Never used as a generic fallback, so it can't
# leak into an industry-scoped web/voice session.
CONCIERGE_SLUG = "concierge"

CONCIERGE_PERSONA = (
    "You are the CallSphere demo concierge — one AI agent that can demonstrate "
    "any industry's receptionist on this single line. First, find out which "
    "kind of business the caller wants to experience (ask what type of business "
    "they'd like to try; offer a few examples like dental, insurance, or body "
    "care if they're unsure — don't read a long list). As SOON as they name or "
    "imply an industry, call the `select_industry` tool with their choice. After "
    "it returns, fully become that business's own receptionist and answer every "
    "factual question via the `search_knowledge` tool, using ONLY what it "
    "returns. Never invent prices, policies, or guarantees. Keep it warm, "
    "concise, and human."
)

CONCIERGE_GREETING = (
    "Hi, and thanks for calling the CallSphere demo line! Which type of business "
    "would you like to experience?"
)

DEFAULT_CONTEXT: Dict[str, Any] = {
    "id": None,
    "slug": DEFAULT_SLUG,
    "name": "CallSphere Demo",
    "tagline": None,
    "persona": DEFAULT_PERSONA,
    "greeting": DEFAULT_GREETING,
    "accent_color": None,
    "icon": None,
}


# ---------------------------------------------------------------------------
# Industry lookup
# ---------------------------------------------------------------------------

def get_industry(slug: Optional[str]) -> Dict[str, Any]:
    """Resolve an industry by slug from the demo DB.

    Returns a dict with at least: id, slug, name, persona, greeting.
    Falls back to a generic helpful-assistant context when slug is missing,
    unknown, inactive, or the DB lookup fails. Never raises.
    """
    if not slug:
        return dict(DEFAULT_CONTEXT)

    slug = slug.strip().lower()
    if slug == DEFAULT_SLUG:
        return dict(DEFAULT_CONTEXT)
    if slug == CONCIERGE_SLUG:
        # Shared single-line phone concierge (multi-industry). Kept separate
        # from the generic fallback so it never leaks into a scoped session.
        ctx = dict(DEFAULT_CONTEXT)
        ctx.update(
            {
                "slug": CONCIERGE_SLUG,
                "name": "CallSphere Demo",
                "persona": CONCIERGE_PERSONA,
                "greeting": CONCIERGE_GREETING,
            }
        )
        return ctx

    try:
        from db.connection import get_db

        db = get_db()
        row = db.select_one(
            """
            SELECT id, slug, name, tagline, persona, greeting,
                   accent_color, icon
            FROM industries
            WHERE slug = %s AND is_active = TRUE
            """,
            (slug,),
        )
    except Exception as e:  # pragma: no cover - DB/runtime guard
        logger.error(f"industry lookup failed for slug={slug!r}: {e}")
        return dict(DEFAULT_CONTEXT)

    if not row:
        logger.warning(f"Unknown industry slug {slug!r}; using generic persona")
        return dict(DEFAULT_CONTEXT)

    ctx = dict(row)
    # Guard against empty persona/greeting in the row.
    if not ctx.get("persona"):
        ctx["persona"] = DEFAULT_PERSONA
    if not ctx.get("greeting"):
        ctx["greeting"] = DEFAULT_GREETING
    return ctx


def get_persona(slug: Optional[str]) -> str:
    """Return just the persona (system prompt) for an industry slug."""
    return get_industry(slug).get("persona") or DEFAULT_PERSONA


def get_greeting(slug: Optional[str]) -> str:
    """Return just the opening greeting for an industry slug."""
    return get_industry(slug).get("greeting") or DEFAULT_GREETING


def list_active_industries() -> List[Dict[str, Any]]:
    """Return all active industries (id, slug, name, tagline) by sort order.

    Returns [] (never raises) on any DB failure so callers degrade gracefully.
    """
    try:
        from db.connection import get_db

        db = get_db()
        rows = db.select(
            """
            SELECT id, slug, name, tagline
            FROM industries
            WHERE is_active = TRUE
            ORDER BY sort_order, name
            """
        )
        return [dict(r) for r in (rows or [])]
    except Exception as e:  # pragma: no cover - DB/runtime guard
        logger.error(f"list_active_industries failed: {e}")
        return []


# Free-text keyword aliases mapped onto industry slugs. Used to resolve a
# caller's spoken industry ("I run a dentist office", "freight", "mental
# health") onto a known slug for the single-line demo concierge.
_INDUSTRY_ALIASES: Dict[str, str] = {
    "healthcare": "healthcare", "health care": "healthcare", "clinic": "healthcare",
    "medical": "healthcare", "doctor": "healthcare", "physician": "healthcare",
    "dental": "dental", "dentist": "dental", "teeth": "dental", "orthodont": "dental",
    "behavioral": "behavioral_health", "mental health": "behavioral_health",
    "therapy": "behavioral_health", "therapist": "behavioral_health",
    "counsel": "behavioral_health", "psych": "behavioral_health",
    "real estate": "real_estate", "realtor": "real_estate", "realty": "real_estate",
    "property": "real_estate", "housing": "real_estate",
    "insurance": "insurance", "policy": "insurance", "claim": "insurance",
    "finance": "finance", "financial": "finance", "bank": "finance",
    "loan": "finance", "advisory": "finance", "wealth": "finance",
    "legal": "legal", "law": "legal", "lawyer": "legal", "attorney": "legal",
    "home service": "home_services", "home services": "home_services",
    "hvac": "home_services", "plumb": "home_services", "electric": "home_services",
    "heating": "home_services", "cooling": "home_services", "handyman": "home_services",
    "automotive": "automotive", "auto": "automotive", "car": "automotive",
    "vehicle": "automotive", "dealership": "automotive", "mechanic": "automotive",
    "hospitality": "hospitality", "hotel": "hospitality", "restaurant": "hospitality",
    "resort": "hospitality", "motel": "hospitality", "dining": "hospitality",
    "logistics": "logistics", "shipping": "logistics", "freight": "logistics",
    "trucking": "logistics", "warehouse": "logistics", "delivery": "logistics",
    "saas": "saas", "software": "saas", "it support": "saas", "tech support": "saas",
    "technology": "saas", "app": "saas",
    "salon": "salon_spa", "spa": "salon_spa", "beauty": "salon_spa",
    "massage": "salon_spa", "hair": "salon_spa", "nails": "salon_spa",
    "barber": "salon_spa", "body care": "salon_spa", "wax": "salon_spa",
    # aesthetic / laser clinic framing (multi-word aliases beat "clinic" -> healthcare)
    "laser clinic": "salon_spa", "laser hair removal": "salon_spa",
    "laser hair": "salon_spa", "aesthetic clinic": "salon_spa",
    "aesthetics clinic": "salon_spa", "med spa": "salon_spa",
    "medspa": "salon_spa", "medical spa": "salon_spa", "beauty clinic": "salon_spa",
    "skin clinic": "salon_spa", "skin care": "salon_spa", "skincare": "salon_spa",
    "laser": "salon_spa", "aesthetic": "salon_spa", "aesthetics": "salon_spa",
    "facial": "salon_spa", "injectable": "salon_spa", "botox": "salon_spa",
    "filler": "salon_spa", "hair removal": "salon_spa", "body contouring": "salon_spa",
    "electrolysis": "salon_spa", "waxing": "salon_spa",
}


def resolve_industry(text: Optional[str]) -> Optional[Dict[str, Any]]:
    """Resolve free-text or a slug to a full active-industry context dict.

    Tries, in order: exact active slug match, exact active name match, then
    keyword/alias substring match. Returns the get_industry() dict for the
    matched slug, or None when nothing matches. Never raises.
    """
    if not text:
        return None
    q = text.strip().lower()
    active = {i["slug"]: i for i in list_active_industries()}

    # 1) exact slug
    if q in active:
        return get_industry(q)
    # normalize a slug-like input ("real estate" -> "real_estate")
    q_slug = q.replace(" ", "_").replace("-", "_")
    if q_slug in active:
        return get_industry(q_slug)
    # 2) exact / contained name match
    for slug, ind in active.items():
        name = (ind.get("name") or "").lower()
        if name and (q == name or name in q or q in name):
            return get_industry(slug)
    # 3) alias keyword match (longest alias first for specificity)
    for alias in sorted(_INDUSTRY_ALIASES, key=len, reverse=True):
        if alias in q:
            slug = _INDUSTRY_ALIASES[alias]
            if slug in active:
                return get_industry(slug)
    return None


# ---------------------------------------------------------------------------
# Per-industry RAG (pgvector similarity search over knowledge_base)
# ---------------------------------------------------------------------------

EMBED_MODEL = "text-embedding-3-small"
EMBED_URL = "https://api.openai.com/v1/embeddings"


def embed_query(text: str) -> List[float]:
    """Embed a single query string via the OpenAI embeddings API (1536 dims)."""
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


def search_knowledge_base(
    query: str,
    industry_id: Optional[int],
    k: int = 5,
    min_similarity: float = 0.15,
) -> List[str]:
    """pgvector similarity search over `knowledge_base` scoped to an industry.

    Embeds `query` with text-embedding-3-small and returns up to `k` content
    snippets ordered by cosine distance. Returns [] (never raises) on any
    failure so callers can degrade gracefully. When industry_id is None the
    search is skipped (generic persona has no industry-scoped KB).
    """
    if not query or industry_id is None:
        return []

    try:
        qvec = _vec_literal(embed_query(query))
    except Exception as e:  # pragma: no cover - network/runtime guard
        logger.error(f"KB embed failed: {e}")
        return []

    try:
        from db.connection import get_db

        db = get_db()
        rows = db.select(
            """
            SELECT content, 1 - (embedding <=> %s::vector) AS sim
            FROM knowledge_base
            WHERE industry_id = %s AND embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (qvec, industry_id, qvec, k),
        )
    except Exception as e:  # pragma: no cover - DB/runtime guard
        logger.error(f"KB search failed for industry_id={industry_id}: {e}")
        return []

    snippets: List[str] = []
    for row in rows:
        sim = row.get("sim")
        if sim is not None and sim < min_similarity:
            continue
        content = (row.get("content") or "").strip()
        if content:
            snippets.append(content)
    return snippets[:k]


# ---------------------------------------------------------------------------
# Per-industry RAG over a DEDICATED database (demo_<slug>.kb.qa)
# ---------------------------------------------------------------------------
#
# Each industry now keeps its knowledge base in its OWN Postgres database named
# `demo_<slug>` (db `demo` holds only the shared app tables). The KB lives in
# schema `kb`, table `kb.qa (id, question, answer, embedding vector(1536))`, with
# the embedding being the embedding of the *question* text (text-embedding-3-small).
#
# We build a per-industry connection URL by swapping the db name on the base
# DATABASE_URL, and keep one psycopg2 connection per slug in a small cache so we
# don't reconnect on every retrieval. All failures degrade to [] (never raise).

import threading

import psycopg2
from psycopg2.extras import RealDictCursor

# Slugs that have a dedicated demo_<slug> KB database.
_KB_SLUGS = {
    "healthcare",
    "real_estate",
    "hospitality",
    "finance",
    "home_services",
    "automotive",
    "legal",
    "saas",
    "dental",
    "insurance",
    "logistics",
    "behavioral_health",
    "salon_spa",
}

_qa_conn_cache: Dict[str, Any] = {}
_qa_conn_lock = threading.Lock()


def _industry_db_url(slug: str) -> Optional[str]:
    """Derive the demo_<slug> connection URL by swapping the db name on the
    base DATABASE_URL. Returns None when DATABASE_URL is unset or malformed."""
    base = os.getenv("DATABASE_URL", "")
    if not base:
        return None
    # Swap only the path (db name) component; preserve user/host/port/query.
    head, sep, _tail = base.rpartition("/")
    if not sep:
        return None
    # Drop any ?query string that may ride on the db name.
    db_and_query = _tail.split("?", 1)
    query = f"?{db_and_query[1]}" if len(db_and_query) > 1 else ""
    return f"{head}/demo_{slug}{query}"


def _get_qa_connection(slug: str):
    """Return a cached, live psycopg2 connection to demo_<slug>.

    Reconnects transparently if a cached connection has gone bad. Returns None
    if a connection cannot be established (caller degrades to [])."""
    with _qa_conn_lock:
        conn = _qa_conn_cache.get(slug)
        if conn is not None:
            # Validate the cached connection is still usable.
            if getattr(conn, "closed", 1) == 0:
                return conn
            _qa_conn_cache.pop(slug, None)

        url = _industry_db_url(slug)
        if not url:
            return None
        try:
            conn = psycopg2.connect(url, connect_timeout=5)
            conn.autocommit = True
            _qa_conn_cache[slug] = conn
            return conn
        except Exception as e:  # pragma: no cover - DB/runtime guard
            logger.error(f"qa connect failed for demo_{slug}: {e}")
            return None


def search_qa(query: str, industry_slug: Optional[str], k: int = 4) -> List[Dict[str, Any]]:
    """pgvector similarity search over the per-industry `kb.qa` table.

    Connects to the dedicated `demo_<slug>` database, embeds `query` with
    text-embedding-3-small, and returns up to `k` Q&A pairs ranked by cosine
    similarity to the stored *question* embeddings.

    Returns a list of {question, answer, score} dicts. On ANY error (unknown
    slug, missing DB, missing table, no rows, embed failure) returns [] and
    logs — never raises — so callers degrade gracefully.
    """
    if not query or not industry_slug:
        return []

    slug = industry_slug.strip().lower()
    if slug not in _KB_SLUGS:
        # Unknown/generic slug has no dedicated KB DB.
        return []

    try:
        qvec = _vec_literal(embed_query(query))
    except Exception as e:  # pragma: no cover - network/runtime guard
        logger.error(f"qa embed failed for slug={slug!r}: {e}")
        return []

    conn = _get_qa_connection(slug)
    if conn is None:
        return []

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT question, answer,
                       1 - (embedding <=> %s::vector) AS score
                FROM kb.qa
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (qvec, qvec, k),
            )
            rows = cur.fetchall()
    except Exception as e:  # pragma: no cover - DB/runtime guard
        logger.error(f"qa search failed for demo_{slug}: {e}")
        # Drop a possibly-broken connection so the next call reconnects.
        with _qa_conn_lock:
            _qa_conn_cache.pop(slug, None)
        try:
            conn.close()
        except Exception:
            pass
        return []

    results: List[Dict[str, Any]] = []
    for row in rows:
        question = (row.get("question") or "").strip()
        answer = (row.get("answer") or "").strip()
        if not answer:
            continue
        results.append(
            {
                "question": question,
                "answer": answer,
                "score": float(row["score"]) if row.get("score") is not None else None,
            }
        )
    return results


def build_system_prompt(
    industry: Dict[str, Any],
    user_query: Optional[str] = None,
    k: int = 5,
) -> str:
    """Build the full system prompt for an industry context.

    Combines the industry persona with retrieved per-industry KB snippets
    (when a user_query is provided). Used by both chat and realtime entry
    points so grounding stays consistent.

    Retrieval prefers the dedicated per-industry KB database (demo_<slug>.kb.qa
    via search_qa). It falls back to the legacy `knowledge_base` table
    (search_knowledge_base, scoped by industry_id) only when the per-industry
    DB returns nothing, so existing callers never lose grounding.
    """
    persona = industry.get("persona") or DEFAULT_PERSONA
    parts = [persona]

    if user_query:
        slug = industry.get("slug")
        name = industry.get("name") or "business"
        pairs = search_qa(user_query, slug, k=k)

        if pairs:
            blocks = [f"Q: {p['question']}\nA: {p['answer']}" for p in pairs]
            joined = "\n\n".join(blocks)
            parts.append(
                f"Relevant knowledge for this {name} business "
                "(answer using this knowledge when relevant; if it doesn't "
                "cover the question, say you're not certain and offer to "
                f"follow up — never invent facts):\n\n{joined}"
            )
        else:
            # Fallback: legacy global knowledge_base table scoped by industry_id.
            snippets = search_knowledge_base(user_query, industry.get("id"), k=k)
            if snippets:
                joined = "\n\n---\n\n".join(snippets)
                parts.append(
                    "RELEVANT KNOWLEDGE (answer ONLY from these facts; if they "
                    "don't cover the question, say you're not certain and offer "
                    f"to follow up):\n\n{joined}"
                )

    return "\n\n".join(parts)
