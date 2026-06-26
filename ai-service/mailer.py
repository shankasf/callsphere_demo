"""
Lightweight AWS SES email sender (stdlib only).

Sends via the SES SMTP endpoint using credentials already present in the
environment (the same `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` injected
from the `demo-app-secrets` Secret). The SES SMTP password is derived from the
IAM secret with the documented HMAC chain, so no extra secret is needed.

Sender identity: `DEMO_MAIL_FROM` (default demo@mail.callsphere.site) — the
SES-verified mail.callsphere.site domain.
"""

import base64
import hashlib
import hmac
import logging
import os
import smtplib
import ssl
import threading
import time
from collections import deque
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

# Abuse guard for the unauthenticated demo: cap outbound mail globally and per
# recipient so the booking/lead tools can't be turned into a spam relay.
_GLOBAL_LIMIT = int(os.getenv("MAIL_RATE_GLOBAL_PER_MIN", "20"))
_PER_RECIPIENT_LIMIT = int(os.getenv("MAIL_RATE_PER_RECIPIENT_PER_MIN", "3"))
_mail_lock = threading.Lock()
_global_hits: deque = deque()
_recipient_hits: dict = {}


def _rate_ok(recipient: str) -> bool:
    """Sliding 60s window: allow the send only if under the global and
    per-recipient caps. Records the attempt when allowed."""
    now = time.monotonic()
    cutoff = now - 60
    with _mail_lock:
        while _global_hits and _global_hits[0] < cutoff:
            _global_hits.popleft()
        rhits = _recipient_hits.get(recipient)
        if rhits is not None:
            while rhits and rhits[0] < cutoff:
                rhits.popleft()
        if len(_global_hits) >= _GLOBAL_LIMIT:
            return False
        if rhits is not None and len(rhits) >= _PER_RECIPIENT_LIMIT:
            return False
        _global_hits.append(now)
        _recipient_hits.setdefault(recipient, deque()).append(now)
        return True


def _ses_smtp_password(secret_key: str, region: str) -> str:
    """Derive the SES SMTP password from an IAM secret access key."""
    sig = hmac.new(("AWS4" + secret_key).encode(), b"11111111", hashlib.sha256).digest()
    sig = hmac.new(sig, region.encode(), hashlib.sha256).digest()
    sig = hmac.new(sig, b"ses", hashlib.sha256).digest()
    sig = hmac.new(sig, b"aws4_request", hashlib.sha256).digest()
    sig = hmac.new(sig, b"SendRawEmail", hashlib.sha256).digest()
    return base64.b64encode(bytes([0x04]) + sig).decode()


def send_email(to: str, subject: str, html: str, text: str) -> bool:
    """Send an email via SES SMTP. Returns True on success, False otherwise.

    Never raises — callers (agent tools) degrade gracefully so a mail failure
    never breaks the conversation.
    """
    akid = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
    secret = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
    region = os.getenv("AWS_REGION", "us-east-1").strip() or "us-east-1"
    sender = os.getenv("DEMO_MAIL_FROM", "demo@mail.callsphere.site").strip()
    sender_name = os.getenv("DEMO_MAIL_FROM_NAME", "CallSphere").strip()

    if not akid or not secret:
        logger.warning("SES credentials not set — skipping email to %s", to)
        return False

    if not _rate_ok(to):
        logger.warning("mail rate limit hit — skipping email to %s", to)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{sender}>"
    msg["To"] = to
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    host = f"email-smtp.{region}.amazonaws.com"
    try:
        with smtplib.SMTP(host, 587, timeout=15) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(akid, _ses_smtp_password(secret, region))
            server.sendmail(sender, [to], msg.as_string())
        logger.info("SES email sent to %s (subject=%r)", to, subject)
        return True
    except Exception as e:  # pragma: no cover - network/runtime guard
        logger.error("SES send failed for %s: %s", to, e)
        return False
