"""
AI per-call lead scoring for the CallSphere Demo.

Given a call transcript, an LLM (the chat model) produces a structured lead
assessment: lead_score (0-100), intent label, lead_status (hot/warm/cold),
estimated deal value, and a short reason. Profit projections are then derived
from the industry's `business_economics` row (falling back to the global row
where industry_id IS NULL).

All public functions are defensive — scoring failures return None rather than
raising, so call-log persistence is never blocked by a scoring problem.
"""

import json
import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _chat_model() -> str:
    """Resolve the text model from config/env (Responses API). Falls back to
    gpt-5.5 only when nothing is configured."""
    try:
        from config import get_config

        return get_config().openai_model or "gpt-5.5"
    except Exception:
        return os.getenv("OPENAI_MODEL") or "gpt-5.5"


def _reasoning_effort() -> str:
    """Resolve the Responses API reasoning effort from config/env."""
    try:
        from config import get_config

        return get_config().openai_reasoning_effort or "low"
    except Exception:
        return os.getenv("OPENAI_REASONING_EFFORT") or "low"


# Resolved lazily at call time so env/config changes are picked up; exposed as a
# module-level name for backwards compatibility / introspection.
CHAT_MODEL = _chat_model()

_VALID_STATUS = {"hot", "warm", "cold"}

_SCORING_PROMPT = """You are a sales-intelligence analyst. Read the transcript of a phone/chat
conversation between an AI receptionist and a prospective customer for a business in the
"{industry}" industry. Score the PROSPECT's buying intent.

Return STRICT JSON with exactly these keys:
{{
  "lead_score": <integer 0-100, how likely this prospect is to buy/book>,
  "intent": "<2-4 word label of what they wanted, e.g. 'book appointment', 'price inquiry', 'support', 'not interested'>",
  "lead_status": "hot" | "warm" | "cold",
  "est_deal_value": <number, estimated USD value of this prospect's deal; use {avg_deal_value} as a typical baseline and adjust up/down based on what they asked for>,
  "score_reason": "<one concise sentence explaining the score>"
}}

Guidance:
- hot (70-100): clear intent to buy/book now, gave details, asked to schedule/pay.
- warm (35-69): interested, comparing, needs follow-up, asked about price/options.
- cold (0-34): wrong number, just browsing, not interested, unrelated, or no real engagement.
- If the transcript is empty or has no real customer engagement, score it cold.

Transcript:
---
{transcript}
---
Respond with ONLY the JSON object, no prose."""


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _responses_output_text(response: Any) -> str:
    """Extract assistant text from a Responses API result.

    Prefers the `output_text` convenience accessor; defensively falls back to
    concatenating text parts from the structured `output` if it is empty.
    """
    text = getattr(response, "output_text", None)
    if text:
        return text
    parts = []
    for item in getattr(response, "output", None) or []:
        for content in getattr(item, "content", None) or []:
            chunk = getattr(content, "text", None)
            if chunk:
                parts.append(chunk)
    return "".join(parts)


def score_transcript(
    transcript: str,
    industry_slug: Optional[str] = None,
    industry_name: Optional[str] = None,
    avg_deal_value: float = 1000.0,
) -> Optional[Dict[str, Any]]:
    """Score a transcript with the chat model. Returns a normalized dict or None.

    Keys returned: lead_score (int 0-100), intent (str), lead_status
    (hot/warm/cold), est_deal_value (float), score_reason (str).
    """
    if not transcript or not transcript.strip():
        return None

    try:
        import openai

        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            logger.warning("score_transcript: OPENAI_API_KEY not set; skipping")
            return None

        client = openai.OpenAI(api_key=api_key)
        prompt = _SCORING_PROMPT.format(
            industry=industry_name or industry_slug or "general business",
            avg_deal_value=avg_deal_value,
            transcript=transcript[:12000],  # bound prompt size
        )

        # Modern Responses API (gpt-5.5). Structured JSON is requested via the
        # response_format json_object knob; the prompt already pins the schema.
        response = client.responses.create(
            model=_chat_model(),
            input=[{"role": "user", "content": prompt}],
            reasoning={"effort": _reasoning_effort()},
            text={"format": {"type": "json_object"}},
        )
        raw = json.loads(_responses_output_text(response))
    except Exception as e:  # pragma: no cover - network/runtime guard
        logger.error(f"score_transcript failed: {e}")
        return None

    # Normalize / clamp.
    try:
        lead_score = int(round(_to_float(raw.get("lead_score"), 0.0)))
    except (TypeError, ValueError):
        lead_score = 0
    lead_score = max(0, min(100, lead_score))

    status = str(raw.get("lead_status", "")).strip().lower()
    if status not in _VALID_STATUS:
        # Derive from score if the model returned an unexpected value.
        status = "hot" if lead_score >= 70 else "warm" if lead_score >= 35 else "cold"

    est_deal_value = _to_float(raw.get("est_deal_value"), avg_deal_value)
    if est_deal_value < 0:
        est_deal_value = 0.0

    intent = str(raw.get("intent", "") or "unknown").strip()[:255]
    score_reason = str(raw.get("score_reason", "") or "").strip()

    return {
        "lead_score": lead_score,
        "intent": intent,
        "lead_status": status,
        "est_deal_value": round(est_deal_value, 2),
        "score_reason": score_reason,
    }


def get_business_economics(industry_id: Optional[int]) -> Dict[str, Any]:
    """Fetch the business_economics row for an industry, falling back to the
    global default (industry_id IS NULL). Returns sane defaults on failure.
    """
    defaults = {
        "avg_deal_value": 1000.0,
        "close_rate": 0.2,
        "margin_pct": 0.5,
        "currency": "USD",
    }
    try:
        from db.connection import get_db

        db = get_db()
        row = None
        if industry_id is not None:
            row = db.select_one(
                """
                SELECT avg_deal_value, close_rate, margin_pct, currency
                FROM business_economics WHERE industry_id = %s
                """,
                (industry_id,),
            )
        if not row:
            row = db.select_one(
                """
                SELECT avg_deal_value, close_rate, margin_pct, currency
                FROM business_economics WHERE industry_id IS NULL
                """
            )
        if not row:
            return defaults
        return {
            "avg_deal_value": _to_float(row.get("avg_deal_value"), defaults["avg_deal_value"]),
            "close_rate": _to_float(row.get("close_rate"), defaults["close_rate"]),
            "margin_pct": _to_float(row.get("margin_pct"), defaults["margin_pct"]),
            "currency": row.get("currency") or "USD",
        }
    except Exception as e:  # pragma: no cover
        logger.error(f"get_business_economics failed: {e}")
        return defaults


def compute_profit(
    lead_score: int, est_deal_value: float, margin_pct: float
) -> Dict[str, float]:
    """Derive interest_profit and close_profit from the economics.

    interest_profit = (lead_score/100) * est_deal_value * margin_pct
    close_profit     = est_deal_value * margin_pct
    """
    close_profit = est_deal_value * margin_pct
    interest_profit = (lead_score / 100.0) * close_profit
    return {
        "interest_profit": round(interest_profit, 2),
        "close_profit": round(close_profit, 2),
    }


def score_and_value(
    transcript: str,
    industry_id: Optional[int],
    industry_slug: Optional[str] = None,
    industry_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """End-to-end: score a transcript and attach profit projections.

    Returns a dict ready to persist onto call_logs (lead_score, intent,
    lead_status, est_deal_value, interest_profit, close_profit, score_reason)
    or None if scoring could not be performed.
    """
    econ = get_business_economics(industry_id)
    scored = score_transcript(
        transcript,
        industry_slug=industry_slug,
        industry_name=industry_name,
        avg_deal_value=econ["avg_deal_value"],
    )
    if not scored:
        return None

    profit = compute_profit(
        scored["lead_score"], scored["est_deal_value"], econ["margin_pct"]
    )
    scored.update(profit)
    return scored
