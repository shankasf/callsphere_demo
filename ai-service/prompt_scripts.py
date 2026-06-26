"""Shared prompt/script text for the Reclaim AI receptionist.

Keep all caller-facing scripts centralized here so multiple entrypoints
(WebRTC, SIP/Realtime, chat) don't drift and accidentally use older text.
"""

UE_OPENING_GREETING_TEXT = (
    "Hi, thanks for calling Reclaim — this is Riley, your virtual assistant.\n"
    "We pick up your luggage and deliver it to the airport, so you can travel hands-free.\n\n"
    "How can I help you today?"
)
