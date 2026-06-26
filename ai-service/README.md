# URackIT AI Service

AI-powered IT support voice and chat agent service for URackIT.

**Last Updated:** January 6, 2026

---

## Overview

The AI Service is the core intelligence layer for URackIT, handling both voice calls (via Twilio) and text-based chat interactions. It uses OpenAI's Realtime API for voice conversations and a multi-agent system for specialized IT support tasks.

---

## Architecture Flowchart

```
                                    INCOMING REQUESTS
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │                                           │
              VOICE CALL                                   TEXT CHAT
            (Twilio PSTN)                               (REST API)
                    │                                           │
                    ▼                                           ▼
        ┌───────────────────┐                       ┌───────────────────┐
        │   /twilio         │                       │   /api/chat       │
        │   (POST webhook)  │                       │   (POST endpoint) │
        └─────────┬─────────┘                       └─────────┬─────────┘
                  │                                           │
                  │ Returns TwiML                             │
                  │ with WebSocket URL                        │
                  ▼                                           │
        ┌───────────────────┐                                 │
        │ /media-stream/    │                                 │
        │ {session_id}      │                                 │
        │ (WebSocket)       │                                 │
        └─────────┬─────────┘                                 │
                  │                                           │
                  ▼                                           ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                    SESSION MANAGER                            │
        │  - Creates/manages voice sessions                             │
        │  - Tracks conversation history                                │
        │  - Stores metadata (caller info, tool calls)                  │
        │  - Saves call logs to database                                │
        └───────────────────────────────┬───────────────────────────────┘
                                        │
                  ┌─────────────────────┴─────────────────────┐
                  │                                           │
                  ▼                                           ▼
        ┌───────────────────┐                       ┌───────────────────┐
        │  MEDIA STREAM     │                       │  AGENT PIPELINE   │
        │  HANDLER          │                       │  (Runner)         │
        │                   │                       │                   │
        │  - Twilio ←→ WS   │                       │  - Text-based     │
        │  - Audio routing  │                       │  - Uses Memory    │
        │  - Interruption   │                       │  - Tool execution │
        └─────────┬─────────┘                       └─────────┬─────────┘
                  │                                           │
                  ▼                                           │
        ┌───────────────────┐                                 │
        │ OPENAI REALTIME   │                                 │
        │ CONNECTION        │                                 │
        │                   │                                 │
        │ - WebSocket to    │                                 │
        │   OpenAI API      │                                 │
        │ - Audio ←→ Text   │                                 │
        │ - VAD detection   │                                 │
        │ - Echo filtering  │                                 │
        └─────────┬─────────┘                                 │
                  │                                           │
                  └─────────────────────┬─────────────────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │    AGENT ADAPTER      │
                            │                       │
                            │  - Converts agents    │
                            │    to OpenAI tools    │
                            │  - Executes tools     │
                            │  - Returns results    │
                            └───────────┬───────────┘
                                        │
                                        ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                      TRIAGE AGENT                             │
        │                    (Entry Point)                              │
        │                                                               │
        │  - Greets callers, collects UE code                          │
        │  - Verifies organization & contact                           │
        │  - Routes to specialist agents                               │
        └───────────────────────────────┬───────────────────────────────┘
                                        │
                                        │ HANDOFFS
                                        ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                    SPECIALIST AGENTS                          │
        │                                                               │
        │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
        │  │  Computer   │ │   Network   │ │   Printer   │             │
        │  │   Agent     │ │    Agent    │ │    Agent    │             │
        │  └─────────────┘ └─────────────┘ └─────────────┘             │
        │                                                               │
        │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
        │  │   Phone     │ │    Email    │ │  Security   │             │
        │  │   Agent     │ │    Agent    │ │    Agent    │             │
        │  └─────────────┘ └─────────────┘ └─────────────┘             │
        │                                                               │
        │  ┌─────────────┐ ┌─────────────┐                             │
        │  │   Device    │ │   Ticket    │                             │
        │  │   Agent     │ │    Agent    │                             │
        │  └─────────────┘ └─────────────┘                             │
        └───────────────────────────────┬───────────────────────────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │    DB QUERIES         │
                            │    (Supabase)         │
                            │                       │
                            │  - Organizations      │
                            │  - Contacts           │
                            │  - Devices            │
                            │  - Tickets            │
                            │  - Call logs          │
                            └───────────────────────┘
```

---

## Voice Call Flow (Detailed)

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌─────────────┐
│  Caller  │     │  Twilio  │     │  AI Service  │     │   OpenAI    │
└────┬─────┘     └────┬─────┘     └──────┬───────┘     └──────┬──────┘
     │                │                   │                    │
     │  Dials Number  │                   │                    │
     │───────────────>│                   │                    │
     │                │                   │                    │
     │                │  POST /twilio     │                    │
     │                │  (webhook)        │                    │
     │                │──────────────────>│                    │
     │                │                   │                    │
     │                │  TwiML Response   │                    │
     │                │  (Connect to WS)  │                    │
     │                │<──────────────────│                    │
     │                │                   │                    │
     │                │  WebSocket        │                    │
     │                │  /media-stream/   │                    │
     │                │──────────────────>│                    │
     │                │                   │                    │
     │                │                   │  Connect to        │
     │                │                   │  Realtime API      │
     │                │                   │───────────────────>│
     │                │                   │                    │
     │                │                   │  Session Created   │
     │                │                   │<───────────────────│
     │                │                   │                    │
     │                │                   │  Trigger Greeting  │
     │                │                   │───────────────────>│
     │                │                   │                    │
     │                │  AI Audio         │  Audio Response    │
     │  "Welcome..."  │<──────────────────│<───────────────────│
     │<───────────────│                   │                    │
     │                │                   │                    │
     │  "3450"        │                   │                    │
     │───────────────>│  User Audio       │                    │
     │                │──────────────────>│  Audio Input       │
     │                │                   │───────────────────>│
     │                │                   │                    │
     │                │                   │  Transcription     │
     │                │                   │  + Function Call   │
     │                │                   │<───────────────────│
     │                │                   │                    │
     │                │                   │  Execute Tool      │
     │                │                   │  (DB Query)        │
     │                │                   │────────┐           │
     │                │                   │        │           │
     │                │                   │<───────┘           │
     │                │                   │                    │
     │                │                   │  Tool Result       │
     │                │                   │───────────────────>│
     │                │                   │                    │
     │                │  AI Audio         │  Audio Response    │
     │  "Verified..." │<──────────────────│<───────────────────│
     │<───────────────│                   │                    │
     │                │                   │                    │
```

---

## Component Descriptions

### Core Files

| File | Description |
|------|-------------|
| `main.py` | FastAPI application entry point. Defines REST endpoints (`/api/chat`, `/twilio`, `/health`) and WebSocket routes (`/media-stream/{session_id}`). |
| `config.py` | Application configuration loader. Reads environment variables for API keys, URLs, etc. |
| `prompt_scripts.py` | Contains prompt templates like `UE_OPENING_GREETING_TEXT` used by agents. |
| `urackit_knowledge.txt` | Knowledge base text file with URackIT-specific information for AI context. |

### `/sip_integration/` - Voice Call Handling

| File | Description |
|------|-------------|
| `interfaces.py` | Abstract base classes defining contracts: `ICallHandler`, `IRealtimeConnection`, `ISessionManager`, `IAgentAdapter`, `ITelephonyProvider`. Also defines `CallState`, `AudioFormat`, `CallInfo`, `AudioChunk` data classes. |
| `config.py` | SIP-specific configuration (Twilio credentials, OpenAI Realtime settings, VAD thresholds). |
| `session_manager.py` | Manages `VoiceSession` objects. Tracks call state, conversation history, tool calls, AI usage, and persists call logs to database. |
| `media_stream.py` | `MediaStreamHandler` class - bridges Twilio WebSocket and OpenAI Realtime. Handles audio routing, user interruptions, echo detection, and tool execution. |
| `openai_realtime.py` | `OpenAIRealtimeConnection` class - WebSocket connection to OpenAI Realtime API. Handles audio streaming, transcription, function calls, VAD events, and **echo detection** (filters assistant speech from user transcripts). |
| `agent_adapter.py` | `AgentAdapter` class - converts URackIT agents/tools to OpenAI function calling format. Executes tools and returns results. |
| `event_notifier.py` | Sends real-time updates (transcripts, call status) to backend via HTTP for WebSocket broadcast to admin UI. |
| `twilio_provider.py` | `TwilioProvider` class - generates TwiML responses and validates Twilio webhook signatures. |
| `webhook_server.py` | Additional webhook handlers for conference calls, recordings, and status callbacks. |

### `/app_agents/` - Specialist AI Agents

| Agent | Purpose |
|-------|---------|
| `triage_agent.py` | **Entry point**. Greets callers, collects UE code, verifies organization/contact, routes to specialists. |
| `computer_agent.py` | Handles computer-related issues (slow PC, crashes, software problems). |
| `network_agent.py` | Handles network issues (connectivity, WiFi, VPN). |
| `printer_agent.py` | Handles printer issues (not printing, paper jams, driver problems). |
| `phone_agent.py` | Handles phone/VoIP issues (softphone, call quality). |
| `email_agent.py` | Handles email issues (Outlook, connectivity, calendar). |
| `security_agent.py` | Handles security concerns (suspicious emails, malware, password issues). |
| `device_agent.py` | Handles general device inquiries and lookups. |
| `ticket_agent.py` | Creates and manages support tickets. |
| `lookup_agent.py` | Performs database lookups for organizations, contacts, devices. |

### `/db/` - Database Layer

| File | Description |
|------|-------------|
| `connection.py` | Supabase client initialization and connection management. |
| `queries.py` | Database query functions: `find_organization_by_ue_code()`, `create_contact()`, `find_contact_by_phone()`, `hang_up_call()`, etc. |

### `/memory/` - Conversation Memory

| File | Description |
|------|-------------|
| `memory.py` | Session memory management for maintaining conversation context across turns. |
| `knowledge_base.py` | RAG-style knowledge retrieval from `urackit_knowledge.txt`. |

### `/agents/` - Agent Framework

| File | Description |
|------|-------------|
| `pipeline.py` | `Runner` class for executing agent pipelines with tool calls and handoffs. |

---

## API Endpoints

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check (returns status, version, timestamp) |
| `GET` | `/health` | Health check endpoint |
| `POST` | `/api/chat` | Text chat with AI agent |
| `POST` | `/twilio` | Twilio voice webhook (returns TwiML) |
| `POST` | `/call-status/{session_id}` | Twilio call status callback |
| `POST` | `/recording-status/{session_id}` | Recording completion callback |
| `POST` | `/conference-status/{session_id}` | Conference event callback |

### WebSocket Endpoints

| Path | Description |
|------|-------------|
| `/media-stream/{session_id}` | Twilio bidirectional audio stream |
| `/ws/{session_id}` | Browser WebRTC audio stream (alternative) |

---

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TWILIO_TWIML_APP_SID=AP...  # Optional: for conference AI participation

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...

# Service Config
WEBHOOK_BASE_URL=https://your-domain.com
HUMAN_AGENT_PHONE=+1...  # Phone to call for escalations

# OpenAI Realtime
OPENAI_REALTIME_MODEL=gpt-realtime-2025-08-28
VOICE=alloy
```

---

## Running the Service

### Development

```bash
# Navigate to ai-service directory
cd /home/ubuntu/apps/urackit_v2/ai-service

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run with uvicorn
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

### Production (PM2)

```bash
# Start with PM2
pm2 start ecosystem.config.js

# Or manually
pm2 start "uvicorn main:app --host 0.0.0.0 --port 8080" --name ai-service
```

### Docker

```bash
# Build and run with docker-compose (from project root)
docker-compose up -d ai-service
```

---

## Log Viewing Commands

### View Live Logs (PM2)

```bash
# View all PM2 logs
pm2 logs

# View only ai-service logs
pm2 logs ai-service

# View last 100 lines
pm2 logs ai-service --lines 100

# View logs with timestamps
pm2 logs ai-service --timestamp
```

### View Live Logs (Docker)

```bash
# View docker container logs
docker logs -f urackit-ai-service

# View last 100 lines
docker logs --tail 100 urackit-ai-service

# View logs with timestamps
docker logs -t urackit-ai-service
```

### View Live Logs (Direct uvicorn)

```bash
# If running uvicorn directly, logs go to stdout
# Use journalctl if running as systemd service
journalctl -u ai-service -f

# Or redirect to file when starting
uvicorn main:app --host 0.0.0.0 --port 8080 2>&1 | tee -a /var/log/ai-service.log
```

### Filter Logs by Component

```bash
# Filter for OpenAI Realtime events
pm2 logs ai-service | grep "openai_realtime"

# Filter for media stream events
pm2 logs ai-service | grep "media_stream"

# Filter for session manager events
pm2 logs ai-service | grep "session_manager"

# Filter for function calls
pm2 logs ai-service | grep "Function call"

# Filter for errors only
pm2 logs ai-service | grep -i "error"

# Filter for echo detection
pm2 logs ai-service | grep "Echo detected"
```

### View Historical Logs

```bash
# PM2 log files location
ls -la ~/.pm2/logs/

# View ai-service output log
cat ~/.pm2/logs/ai-service-out.log

# View ai-service error log
cat ~/.pm2/logs/ai-service-error.log

# Search logs for specific session
grep "voice-abc123" ~/.pm2/logs/ai-service-out.log

# View logs from specific date (if using logrotate)
zcat /var/log/ai-service.log.1.gz | grep "2026-01-06"
```

### Real-time Log Monitoring with Colors

```bash
# Using multitail for multiple log sources
multitail ~/.pm2/logs/ai-service-out.log ~/.pm2/logs/ai-service-error.log

# Using lnav (log navigator) for better visualization
lnav ~/.pm2/logs/ai-service-out.log

# Using ccze for colorized output
pm2 logs ai-service | ccze -A
```

### Log Analysis Commands

```bash
# Count errors in last hour
grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" ~/.pm2/logs/ai-service-error.log | wc -l

# Find all unique session IDs in logs
grep -oP 'voice-[a-f0-9]+' ~/.pm2/logs/ai-service-out.log | sort -u

# Count function calls by type
grep "Function call:" ~/.pm2/logs/ai-service-out.log | sed "s/.*Function call: \([^(]*\).*/\1/" | sort | uniq -c | sort -rn

# Find average call duration
grep "duration:" ~/.pm2/logs/ai-service-out.log | grep -oP 'duration: \K[0-9.]+' | awk '{sum+=$1; count++} END {print "Average:", sum/count, "seconds"}'

# List all calls today
grep "$(date '+%Y-%m-%d')" ~/.pm2/logs/ai-service-out.log | grep "Incoming call"
```

---

## Troubleshooting

### Common Issues

1. **Echo in transcripts** - The system has echo detection that filters assistant speech from user transcripts. Check logs for "Echo detected" warnings.

2. **404 errors for event notifications** - Backend may not be running or webhook URLs are misconfigured. Check `WEBHOOK_BASE_URL` in `.env`.

3. **OpenAI connection failures** - Verify `OPENAI_API_KEY` is valid and has Realtime API access.

4. **Twilio webhook errors** - Ensure `WEBHOOK_BASE_URL` is publicly accessible and HTTPS.

### Debug Mode

```bash
# Run with debug logging
LOG_LEVEL=DEBUG uvicorn main:app --host 0.0.0.0 --port 8080
```

---

## Recent Changes

- **2026-01-06**: Added echo detection to filter assistant speech from user transcripts in `openai_realtime.py`
