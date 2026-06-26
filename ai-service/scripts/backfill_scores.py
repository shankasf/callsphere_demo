"""
Backfill AI lead scores for existing call_logs rows.

Scores every call_logs row that has a non-empty transcript but a NULL
lead_score, then writes lead_score / intent / lead_status / est_deal_value /
interest_profit / close_profit / score_reason back to the row. This gives the
demo dashboard data without waiting for new live calls.

Usage:
    cd /home/ubuntu/apps/demo/ai-service
    ./venv/bin/python -m scripts.backfill_scores [--limit N] [--dry-run]

The industry for each row is taken from call_logs.industry_slug (falling back
to the global business_economics row when the slug is missing/unknown), so
profit projections are economics-correct per industry.
"""

import argparse
import logging
import sys

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_scores")


def backfill(limit: int = 0, dry_run: bool = False) -> int:
    from db.connection import get_db
    from industry_context import get_industry
    from call_scoring import score_and_value

    db = get_db()

    query = """
        SELECT call_id, transcript, industry_slug
        FROM call_logs
        WHERE transcript IS NOT NULL
          AND length(trim(transcript)) > 0
          AND lead_score IS NULL
        ORDER BY started_at DESC NULLS LAST
    """
    params = ()
    if limit and limit > 0:
        query += " LIMIT %s"
        params = (limit,)

    rows = db.select(query, params)
    logger.info(f"Found {len(rows)} call_logs row(s) to score")

    updated = 0
    for row in rows:
        call_id = row["call_id"]
        transcript = row["transcript"]
        slug = row.get("industry_slug")

        industry = get_industry(slug)
        scored = score_and_value(
            transcript,
            industry_id=industry.get("id"),
            industry_slug=slug,
            industry_name=industry.get("name"),
        )
        if not scored:
            logger.warning(f"  {call_id}: scoring returned nothing; skipping")
            continue

        logger.info(
            f"  {call_id}: score={scored['lead_score']} "
            f"status={scored['lead_status']} intent={scored['intent']!r} "
            f"deal={scored['est_deal_value']} interest={scored['interest_profit']}"
        )

        if dry_run:
            continue

        try:
            db.execute(
                """
                UPDATE call_logs
                SET lead_score = %s,
                    intent = %s,
                    lead_status = %s,
                    est_deal_value = %s,
                    interest_profit = %s,
                    close_profit = %s,
                    score_reason = %s
                WHERE call_id = %s
                """,
                (
                    scored["lead_score"],
                    scored["intent"],
                    scored["lead_status"],
                    scored["est_deal_value"],
                    scored["interest_profit"],
                    scored["close_profit"],
                    scored["score_reason"],
                    call_id,
                ),
            )
            updated += 1
        except Exception as e:
            logger.error(f"  {call_id}: update failed: {e}")

    logger.info(f"Done. {'Would update' if dry_run else 'Updated'} {updated} row(s).")
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill AI lead scores on call_logs")
    parser.add_argument("--limit", type=int, default=0, help="Max rows to score (0 = all)")
    parser.add_argument("--dry-run", action="store_true", help="Score but do not write")
    args = parser.parse_args()
    backfill(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
