"""
Appointment booking tool for the demo chat agent.

Exposes a single `book_appointment` function tool (the in-house `agents`
framework idiom) that:
  1. validates the customer's email,
  2. writes a real row to `demo_appointments` (per-industry),
  3. sends a confirmation email via SES (mail.callsphere.site), and
  4. returns a short confirmation string for the agent to relay.

The active industry is carried on a context var set by the chat handler per
request, so the model never has to know or pass the slug.
"""

import contextvars
import logging
import re
from html import escape as _html_escape

from agents import function_tool
from db.connection import get_db
from industry_context import get_industry
from mailer import send_email

logger = logging.getLogger(__name__)

# Set by the chat handler before each Runner.run so the tool knows which
# industry (and which chat session) it is booking for.
current_industry_slug: contextvars.ContextVar = contextvars.ContextVar(
    "current_industry_slug", default=None
)
current_session_id: contextvars.ContextVar = contextvars.ContextVar(
    "current_session_id", default=None
)

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _confirmation_email(
    name: str,
    industry_name: str,
    service: str,
    preferred_time: str,
    appt_id: int,
) -> tuple[str, str, str]:
    """Return (subject, html, text) for the booking confirmation.

    All customer/LLM-supplied values (name, service, preferred_time,
    industry_name) are HTML-escaped before interpolation so they cannot inject
    markup, scripts, or links into the rendered email.
    """
    subject = f"Your {industry_name} appointment is confirmed"
    safe_name = name or "there"
    # HTML-escape every interpolated, non-constant value for the HTML body.
    e_name = _html_escape(safe_name)
    e_service = _html_escape(service)
    e_time = _html_escape(preferred_time)
    e_industry = _html_escape(industry_name)
    html = f"""<!doctype html>
<html><body style="margin:0;background:#0b0f17;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e5e9f0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f17;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121826;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:28px 32px 6px 32px;">
        <p style="margin:0;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#7c8aa5;">CallSphere · {e_industry}</p>
        <h1 style="margin:8px 0 0 0;font-size:22px;color:#fff;">You're booked, {e_name}!</h1>
      </td></tr>
      <tr><td style="padding:10px 32px 0 32px;font-size:15px;line-height:1.6;color:#cbd5e1;">
        <p style="margin:0 0 16px 0;">Here are your appointment details:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:15px;color:#e5e9f0;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#7c8aa5;width:130px;">Service</td><td style="padding:6px 0;">{e_service}</td></tr>
          <tr><td style="padding:6px 0;color:#7c8aa5;">Requested time</td><td style="padding:6px 0;">{e_time}</td></tr>
          <tr><td style="padding:6px 0;color:#7c8aa5;">Confirmation #</td><td style="padding:6px 0;">DEMO-{appt_id}</td></tr>
        </table>
        <p style="margin:18px 0 0 0;color:#9aa7bd;font-size:14px;">Our team will reach out if anything needs adjusting. Reply to this email with any questions.</p>
      </td></tr>
      <tr><td style="padding:20px 32px 28px 32px;font-size:13px;line-height:1.6;color:#7c8aa5;border-top:1px solid #1f2937;">
        <p style="margin:14px 0 0 0;">— The {e_industry} Team, powered by CallSphere · <a href="https://callsphere.ai" style="color:#818cf8;text-decoration:none;">callsphere.ai</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>"""
    text = (
        f"You're booked, {safe_name}!\n\n"
        f"Service: {service}\n"
        f"Requested time: {preferred_time}\n"
        f"Confirmation #: DEMO-{appt_id}\n\n"
        f"Our team will reach out if anything needs adjusting. "
        f"Reply to this email with any questions.\n"
        f"— The {industry_name} Team, powered by CallSphere · callsphere.ai"
    )
    return subject, html, text


def _clean(s: str, limit: int) -> str:
    """Strip control chars (incl. CR/LF for header-injection safety) and bound
    length so a single field can't bloat or abuse the email."""
    s = re.sub(r"[\x00-\x1f\x7f]", " ", (s or "")).strip()
    return s[:limit]


def create_booking(
    slug,
    session_id,
    name: str,
    email: str,
    service: str,
    preferred_time: str,
    notes: str = "",
) -> str:
    """Core booking logic shared by the chat tool and the voice agent.

    Validates input, writes a real `demo_appointments` row, sends the SES
    confirmation email, and returns a short string for the agent to relay.
    Never raises.
    """
    industry = get_industry(slug)
    industry_name = industry.get("name") or "our business"

    email = _clean(email, 254)
    name = _clean(name, 80)
    service = _clean(service, 120) or "an appointment"
    preferred_time = _clean(preferred_time, 120) or "a time to be confirmed"
    notes = _clean(notes, 500)

    if not _EMAIL_RE.match(email):
        return (
            "That email doesn't look valid — please ask the customer to confirm "
            "their email address before booking."
        )
    if not name:
        return "Please ask the customer for their name before booking."

    # 1) Persist the appointment (real DB change).
    try:
        db = get_db()
        row = db.insert(
            "demo_appointments",
            {
                "industry_slug": slug,
                "industry_name": industry_name,
                "customer_name": name,
                "customer_email": email,
                "service": service,
                "preferred_time": preferred_time,
                "notes": notes or None,
                "status": "booked",
                "session_id": session_id,
            },
        )
        appt_id = (row or {}).get("id")
    except Exception as e:  # pragma: no cover - DB guard
        logger.error("create_booking DB insert failed: %s", e)
        return (
            "I couldn't save the booking just now. Please apologize and offer to "
            "have the team follow up."
        )

    # 2) Send the confirmation email (best-effort).
    subject, html, text = _confirmation_email(
        name, industry_name, service, preferred_time, appt_id
    )
    emailed = send_email(email, subject, html, text)
    if emailed:
        try:
            get_db().execute(
                "UPDATE demo_appointments SET confirmation_sent = TRUE WHERE id = %s",
                (appt_id,),
            )
        except Exception:
            pass

    # 3) Return a concise result for the agent to relay (one short sentence).
    if emailed:
        return (
            f"BOOKED. Confirmation #DEMO-{appt_id} for {service} at {preferred_time}. "
            f"A confirmation email was sent to {email}. "
            f"Tell the customer it's booked and the confirmation email is on its way — in one short sentence."
        )
    return (
        f"BOOKED. Confirmation #DEMO-{appt_id} for {service} at {preferred_time}. "
        f"(Email could not be sent.) Tell the customer it's booked in one short sentence."
    )


@function_tool
def book_appointment(
    name: str,
    email: str,
    service: str,
    preferred_time: str,
    notes: str = "",
) -> str:
    """Book the customer's appointment and email them a confirmation.

    Call this ONLY once you have collected the customer's full name, a valid
    email address, the service they want, and a preferred day/time. Pass those
    exactly as given. Returns a short confirmation you can relay to the customer.
    """
    return create_booking(
        current_industry_slug.get(),
        current_session_id.get(),
        name,
        email,
        service,
        preferred_time,
        notes,
    )
