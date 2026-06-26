"""
Seed realistic per-industry call history so every dashboard shows real numbers.

Idempotent: deletes rows tagged call_source='demo_seed' before inserting.
Populates call_logs with industry_slug, status, durations, sentiment, lead
scoring, intents, deal value, satisfaction, and short transcripts spread over
the last 30 days (including today) for all active industries.
"""

import os
import random
import uuid
from datetime import datetime, timedelta

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()
random.seed(42)

# slug -> (display name, deal value range, intent vocabulary, issue categories)
IND = {
    "healthcare": ("Healthcare", (80, 1200), ["book_appointment", "schedule_appointment", "reschedule", "insurance_question", "prescription_refill", "general_question"], ["scheduling", "insurance", "clinical"]),
    "dental": ("Dental", (120, 1800), ["book_appointment", "book_cleaning", "reschedule", "insurance_question", "emergency", "billing_question"], ["scheduling", "billing", "emergency"]),
    "behavioral_health": ("Behavioral Health", (150, 2200), ["book_session", "intake", "reschedule", "insurance_question", "crisis_routing", "general_question"], ["intake", "scheduling", "insurance"]),
    "real_estate": ("Real Estate", (4000, 45000), ["book_showing", "schedule_tour", "listing_inquiry", "buyer_lead", "seller_lead", "price_question"], ["lead", "showing", "listing"]),
    "insurance": ("Insurance", (300, 3500), ["get_quote", "file_claim", "policy_change", "billing_question", "coverage_question", "renewal"], ["quote", "claim", "policy"]),
    "finance": ("Finance", (1000, 22000), ["book_consult", "loan_application", "account_question", "advisor_request", "card_issue", "general_question"], ["lending", "advisory", "account"]),
    "legal": ("Legal", (1500, 14000), ["book_consult", "intake", "case_question", "billing_question", "document_request", "general_question"], ["intake", "consult", "billing"]),
    "home_services": ("Home Services", (180, 6500), ["request_quote", "schedule_service", "emergency_dispatch", "maintenance_booking", "billing_question", "general_question"], ["quote", "dispatch", "service"]),
    "automotive": ("Automotive", (400, 9000), ["service_appointment", "test_drive", "sales_inquiry", "parts_question", "recall_question", "general_question"], ["service", "sales", "parts"]),
    "hospitality": ("Hospitality", (200, 3200), ["room_reservation", "table_booking", "event_inquiry", "concierge_request", "modify_reservation", "general_question"], ["reservation", "events", "concierge"]),
    "logistics": ("Logistics", (300, 9500), ["freight_quote", "schedule_pickup", "tracking", "claim", "account_question", "general_question"], ["quote", "dispatch", "tracking"]),
    "saas": ("SaaS / Tech", (1000, 32000), ["book_demo", "start_trial", "onboarding", "support_request", "billing_question", "upgrade_inquiry"], ["demo", "support", "billing"]),
    "salon_spa": ("Body Care", (80, 1400), ["book_appointment", "membership", "reschedule", "consultation", "product_question", "gift_card"], ["booking", "membership", "consult"]),
}

FIRST = ["James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "David", "Elizabeth", "Priya", "Wei", "Carlos", "Aisha", "Sofia", "Liam", "Noah", "Emma", "Olivia", "Ava"]
LAST = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Patel", "Nguyen", "Kim", "Khan", "Lopez", "Singh", "Chen", "Ali", "Rossi", "Cohen"]
SENTIMENTS = ["positive"] * 11 + ["neutral"] * 6 + ["negative"] * 3


def rand_dt_last_30d():
    now = datetime.utcnow()
    days_ago = random.choices(range(0, 30), weights=[6] + [3] * 6 + [2] * 13 + [1] * 10)[0]
    base = now - timedelta(days=days_ago)
    return base.replace(hour=random.randint(8, 19), minute=random.randint(0, 59), second=random.randint(0, 59))


def main():
    url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(url)
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("DELETE FROM call_logs WHERE call_source = 'demo_seed'")
    print("cleared old demo_seed rows")

    cols = [
        "call_id", "session_id", "caller_phone", "from_number", "to_number", "caller_name",
        "started_at", "answered_at", "ended_at", "duration_seconds", "wait_time_seconds",
        "status", "direction", "was_abandoned", "abandon_reason", "ai_resolution", "was_resolved",
        "escalated", "was_escalated", "escalation_reason", "agent_type", "issue_category",
        "sentiment", "call_quality_score", "customer_satisfaction", "transcript", "call_summary",
        "created_at", "updated_at", "call_source", "industry_slug",
        "lead_score", "intent", "lead_status", "est_deal_value", "interest_profit", "close_profit", "score_reason",
    ]

    rows = []
    total = 0
    for slug, (name, (dv_lo, dv_hi), intents, issues) in IND.items():
        n = random.randint(55, 95)
        total += n
        for _ in range(n):
            started = rand_dt_last_30d()
            abandoned = random.random() < 0.06
            escalated = (not abandoned) and random.random() < 0.12
            failed = (not abandoned) and random.random() < 0.06
            in_progress = (not abandoned and not failed) and random.random() < 0.02
            status = "in_progress" if in_progress else ("failed" if failed else "completed")
            wait = random.randint(0, 25)
            if abandoned:
                dur = random.randint(3, 20)
            elif in_progress:
                dur = random.randint(20, 180)
            else:
                dur = random.randint(45, 560)
            answered = None if abandoned else started + timedelta(seconds=wait)
            ended = None if in_progress else started + timedelta(seconds=wait + dur)
            ai_res = (not escalated) and (not abandoned) and random.random() < 0.86
            intent = random.choice(intents)
            converting = any(k in intent for k in ("book", "quote", "appointment", "showing", "tour", "reservation", "booking", "demo", "trial", "consult", "intake", "session", "claim", "application", "pickup", "membership", "service", "lead"))
            base_score = random.randint(55, 95) if converting else random.randint(10, 55)
            lead_score = max(1, min(99, base_score + random.randint(-10, 10)))
            lead_status = "hot" if lead_score >= 70 else ("warm" if lead_score >= 45 else "cold")
            deal = random.randint(dv_lo, dv_hi)
            interest = round(deal * random.uniform(0.2, 0.4))
            close = round(deal * (lead_score / 100) * random.uniform(0.3, 0.6))
            name_full = f"{random.choice(FIRST)} {random.choice(LAST)}"
            sentiment = random.choice(SENTIMENTS) if not abandoned else random.choice(["neutral", "negative"])
            # customer_satisfaction is an integer CSAT (1-5); call_quality_score
            # is NUMERIC(3,2) shown as an X.XX score (~0-5).
            sat = None if abandoned else random.choice([3, 4, 4, 5, 5, 5])
            qual = None if abandoned else round(random.uniform(3.8, 5.0), 2)
            summary = f"{name} call — caller intent: {intent.replace('_', ' ')}. " + (
                "Escalated to a human specialist." if escalated else ("Resolved by AI." if ai_res else "Handled; follow-up noted.")
            )
            transcript = (
                f"[assistant]: Thanks for calling, how can I help?\n"
                f"[user]: I'd like to {intent.replace('_', ' ')}.\n"
                f"[assistant]: Happy to help with that. Let me get a few details...\n"
                f"[user]: Sure.\n"
                f"[assistant]: All set — is there anything else I can do?"
            )
            phone = f"+1{random.randint(2,9)}{random.randint(100,999)}{random.randint(1000000,9999999)}"
            rows.append((
                str(uuid.uuid4()), f"voice-seed-{uuid.uuid4().hex[:10]}", phone, phone, "+16508552762", name_full,
                started, answered, ended, dur, wait,
                status, random.choices(["inbound", "outbound"], weights=[78, 22])[0], abandoned,
                ("caller_hung_up" if abandoned else None), ai_res, (ai_res or (not escalated and not abandoned and status == "completed")),
                escalated, escalated, ("complex_request" if escalated else None), f"{name} Agent", random.choice(issues),
                sentiment, qual, sat, transcript, summary,
                started, ended or started, "demo_seed", slug,
                lead_score, intent, lead_status, deal, interest, close,
                f"Intent '{intent}' with {sentiment} sentiment; {'high' if lead_score>=70 else 'moderate' if lead_score>=45 else 'low'} buying signal.",
            ))

    execute_values(cur, f"INSERT INTO call_logs ({', '.join(cols)}) VALUES %s", rows, page_size=200)
    print(f"inserted {len(rows)} call_logs across {len(IND)} industries")

    cur.execute("SELECT industry_slug, count(*), round(avg(lead_score)) FROM call_logs WHERE call_source='demo_seed' GROUP BY industry_slug ORDER BY 2 DESC")
    for r in cur.fetchall():
        print("  ", r)
    conn.close()


if __name__ == "__main__":
    main()
