"""Backfill call_logs.caller_phone from the Twilio API for existing calls.

For every call_log row missing caller_phone whose call_sid is a real Twilio
Call SID (CA + 32 hex), fetch the call from the Twilio REST API and store the
caller's number. Run with --apply to write; default is a dry run.

Usage (inside the ai-service pod):
    ./venv/bin/python backfill_caller_numbers.py          # dry run
    ./venv/bin/python backfill_caller_numbers.py --apply  # write changes
"""
import os
import re
import sys

from twilio.rest import Client

from db.connection import PostgresDB, get_db

CALL_SID_RE = re.compile(r"^CA[0-9a-fA-F]{32}$")
APPLY = "--apply" in sys.argv


def main() -> None:
    PostgresDB.initialize(os.environ["DATABASE_URL"])
    db = get_db()

    account_sid = os.environ["TWILIO_ACCOUNT_SID"]
    auth_token = os.environ["TWILIO_AUTH_TOKEN"]
    client = Client(account_sid, auth_token)

    rows = db.select(
        "SELECT call_id, call_sid, caller_phone, from_number "
        "FROM call_logs WHERE caller_phone IS NULL AND call_sid LIKE 'CA%'"
    )
    print(f"Candidates (caller_phone NULL, CA* sid): {len(rows)}")

    updated = skipped = failed = 0
    for r in rows:
        sid = r["call_sid"]
        if not CALL_SID_RE.match(sid):
            print(f"  SKIP  {sid}  (not a real Twilio SID — test data)")
            skipped += 1
            continue
        try:
            call = client.calls(sid).fetch()
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL  {sid}  Twilio: {e}")
            failed += 1
            continue

        number = getattr(call, "from_", None) or getattr(call, "from_formatted", None)
        # For inbound, the caller is `from`; for outbound, it's `to`.
        if (call.direction or "").startswith("outbound"):
            number = getattr(call, "to", None) or getattr(call, "to_formatted", None) or number
        if not number or number.startswith("client:"):
            print(f"  SKIP  {sid}  (no PSTN number: from={call.from_!r} dir={call.direction!r})")
            skipped += 1
            continue

        print(f"  {'SET ' if APPLY else 'WOULD'} {sid} -> {number}  (dir={call.direction})")
        if APPLY:
            db.execute(
                "UPDATE call_logs SET caller_phone = %s, "
                "from_number = COALESCE(NULLIF(from_number, ''), %s) "
                "WHERE call_id = %s",
                (number, number, r["call_id"]),
            )
        updated += 1

    print(
        f"\n{'APPLIED' if APPLY else 'DRY RUN'}: "
        f"{updated} {'updated' if APPLY else 'to update'}, {skipped} skipped, {failed} failed"
    )


if __name__ == "__main__":
    main()
