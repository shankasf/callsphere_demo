# Realtime AI Voice Agent Call Dashboard — Metrics (Full List)

## 1) Live traffic & queue health
- Active calls (in-progress)
- Calls started per minute / ended per minute
- Calls in queue
- Longest wait time
- Average wait time
- Queue position / estimated wait (ETA)
- Service level: % answered within X seconds
- ASA (Average Speed of Answer)
- Abandon rate
- Short-abandon rate (hang up quickly)
- Callback offered rate / accepted rate
- Blocked / busy / failure rate (capacity issues)

## 2) AI ↔ Human handoff & staffing
- Agents online / available / busy / away (by skill/queue)
- AI → Human handoff rate
- Handoff reasons: no-match, policy, user-request, sentiment, tool-failure, VIP
- Handoff latency (time to connect a human)
- Ring time / connect time
- Transfer rate (AI transfer, human transfer)
- Warm transfer success rate
- Post-handoff resolution rate

## 3) Call quality (network / carrier / RTP)
- Packet loss (inbound / outbound)
- Jitter
- RTT / latency
- MOS (Mean Opinion Score)
- Audio level health (mic/speaker levels)
- One-way audio indicators
- Dead air / silence time
- % calls below thresholds (quality alerts)
- Quality degradation source (client vs carrier vs edge)

## 4) Realtime responsiveness (latency)
- End-to-end turn latency (user stops speaking → agent starts speaking)
- ASR latency
- LLM latency (first token / full response)
- TTS latency
- Barge-in latency
- VAD / endpointing delay
- Interruption rate (user interrupts agent)
- Stream reconnects / drops

## 5) ASR (speech-to-text) accuracy & robustness
- Transcript confidence distribution
- Word Error Rate proxy (sampled QA)
- “No speech detected” rate
- Partial transcript churn rate
- Diarization / speaker-segmentation errors
- Language/locale detection accuracy
- Noise / echo sensitivity (noise score)
- Out-of-vocabulary rate
- Profanity masking rate (if enabled)

## 6) NLU / routing quality
- Intent match rate
- Fallback / no-match rate
- Entity extraction success rate
- Slot-fill completion rate
- Misroute rate (wrong queue/skill)
- Re-prompt rate (“I didn’t get that”)
- Top confusion pairs (intent A vs B)

## 7) Conversation flow health (dialog KPIs)
- Task completion rate (by journey)
- Drop-off by step (funnel)
- Turns per call
- Average time-to-resolution
- Repeated question rate
- Recovery rate after fallback
- Repair success rate (rephrase → success)
- Tool/webhook failure rate
- Timeout rate
- Retry rate

## 8) Customer experience
- CSAT (post-call)
- CES (Customer Effort Score)
- NPS (if collected)
- Sentiment score (avg/min)
- Negative-sentiment spike rate
- Complaint keyword rate
- “Agent helpful” thumbs up/down
- Escalation requested by user rate

## 9) Support effectiveness (classic contact center)
- AHT (Average Handle Time)
- Talk time
- Hold time
- After-call work (ACW)
- First Call Resolution (FCR)
- Repeat-call rate
- Transfer rate
- Reopen rate
- Callback resolution rate

## 10) Business outcomes & funnel
- Conversion rate (booking/order/payment)
- Abandon rate at key steps (verification/payment)
- Revenue per call / per session
- Cost per resolved case
- Deflection rate (AI resolved without human)
- Containment rate (fully automated)
- Assisted rate (human involved)
- Failure rate
- SLA compliance by issue type
- Backlog created vs resolved

## 11) Safety, compliance & risk
- Policy-trigger rate (PII / disallowed content)
- Redaction success rate
- Consent captured rate (recording/disclosures)
- Verification pass/fail rate (OTP/KBA)
- Fraud/risk flags rate
- Audit coverage: % calls with transcript/recording stored
- Retention / deletion status compliance

## 12) Platform reliability & cost (engineering)
- Uptime
- Error rate (4xx/5xx)
- Timeout rate
- Retry rate
- Circuit breaker trips
- Dependency/tool latency (by service)
- Queue depth (jobs/events)
- Token usage
- TTS characters / seconds
- ASR minutes
- Cost per call / cost per resolution
- Rate-limit hits
- Model fallback usage
- Region failover events

## 13) Security & access (optional but useful)
- Admin logins
- Permission changes
- API key usage anomalies
- Suspicious IP / geo anomalies
- Data export events

