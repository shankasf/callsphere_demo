"""Normalize call_logs phone numbers to E.164 (+1XXXXXXXXXX).

Backfilled numbers came back in Twilio's pretty format e.g. "(845) 388-4267",
while live-captured ones are already E.164. This rewrites caller_phone and
from_number to E.164 so both sources match. Non-PSTN values (client:, webrtc:,
unknown, blank) are left untouched.

Usage (inside the ai-service pod):
    ./venv/bin/python normalize_phone_numbers.py          # dry run
    ./venv/bin/python normalize_phone_numbers.py --apply  # write changes
"""
import os
import re
import sys

from db.connection import PostgresDB, get_db

APPLY = "--apply" in sys.argv
SKIP_PREFIXES = ("client:", "webrtc:", "sip:")


def to_e164(value):
    """Return an E.164 string for a US/NANP number, or None if not normalizable."""
    if not value:
        return None
    v = value.strip()
    if v.lower() == "unknown" or v.startswith(SKIP_PREFIXES):
        return None
    if re.fullmatch(r"\+\d{8,15}", v):
        return v  # already E.164
    digits = re.sub(r"\D", "", v)
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    if v.startswith("+") and digits:
        return "+" + digits
    return None


def main() -> None:
    PostgresDB.initialize(os.environ["DATABASE_URL"])
    db = get_db()

    rows = db.select(
        "SELECT call_id, caller_phone, from_number FROM call_logs "
        "WHERE caller_phone IS NOT NULL OR from_number IS NOT NULL"
    )
    print(f"Rows with a phone value: {len(rows)}")

    changed = 0
    for r in rows:
        new_caller = to_e164(r["caller_phone"])
        new_from = to_e164(r["from_number"])
        set_caller = new_caller and new_caller != r["caller_phone"]
        set_from = new_from and new_from != r["from_number"]
        if not (set_caller or set_from):
            continue
        print(
            f"  {r['call_id'][:8]}  caller_phone {r['caller_phone']!r} -> "
            f"{new_caller if set_caller else '(unchanged)'} | "
            f"from_number {r['from_number']!r} -> {new_from if set_from else '(unchanged)'}"
        )
        if APPLY:
            db.execute(
                "UPDATE call_logs SET "
                "caller_phone = %s, from_number = %s WHERE call_id = %s",
                (
                    new_caller if set_caller else r["caller_phone"],
                    new_from if set_from else r["from_number"],
                    r["call_id"],
                ),
            )
        changed += 1

    print(f"\n{'APPLIED' if APPLY else 'DRY RUN'}: {changed} row(s) {'updated' if APPLY else 'to update'}")


if __name__ == "__main__":
    main()
