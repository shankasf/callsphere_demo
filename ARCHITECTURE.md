# U Rack IT v2 - Architecture Plan

## Overview

URackIT v2 is a 3-tier architecture for IT support voice agent system:

1. **Frontend**: React + TypeScript + Vite (Port 5173)
2. **Backend**: NestJS + TypeScript + Prisma (Port 3001)
3. **AI Service**: Python + FastAPI + OpenAI (Port 8080)

## Database Schema Understanding

### Voice Agent Flow
```
Caller → Twilio → Python AI Service → OpenAI Realtime Voice
                         ↓
              Identifies caller by:
              1. U-E Code (org identifier)
              2. Phone number → contacts table
                         ↓
              Routes to specialized agent:
              - triage_agent (entry point)
              - email_agent, computer_agent, network_agent
              - printer_agent, phone_agent, security_agent
              - device_agent, lookup_agent, ticket_agent
              - servicedesk_agent
```

### Core Domain Tables

#### 1. Organizations & Contacts (WHO is calling)
- `organizations` - Companies/clients (identified by u_e_code)
- `contacts` - People at orgs (phone, email)
- `account_managers` - Internal staff managing org relationships
- `locations` - Physical sites of organizations

#### 2. Devices (WHAT they're calling about)
- `devices` - Endpoints being managed (computers, servers)
- `device_manufacturers`, `device_models` - Hardware info
- `operating_systems`, `domains` - Software info
- `device_types` - Workstation, Server, Laptop
- `contact_devices` - Which contact uses which device

#### 3. Support Tickets (TRACKING issues)
- `support_tickets` - Issues reported via voice
- `ticket_assignments` - Agent assignments (Bot or Human)
- `ticket_messages` - Notes/updates on ticket
- `ticket_escalations` - Human handoff records
- `ticket_statuses`, `ticket_priorities` - Lookup tables
- `support_agents` - Bot/Human agents

#### 4. Call Analytics (WHAT happened)
- `call_logs` - Every inbound call with:
  - caller_phone, from_number, to_number
  - organization_id, contact_id (resolved from phone)
  - duration, status, ai_resolution, was_escalated
  - transcript, call_summary, sentiment
  - ticket_id (if ticket created)
- `agent_interactions` - Each AI agent invocation per call
- `ai_usage_logs` - Token/cost tracking per call
- `twilio_usage_logs` - Twilio billing per call

#### 5. Dashboard Analytics
- `daily_metrics` - Aggregated daily stats
- `hourly_metrics` - For charts
- `system_health_logs` - Server monitoring
- `customer_metrics` - Caller history
- `conversation_analysis` - Sentiment, intent

#### 6. Dashboard Users
- `users` - Admin/agent login for dashboard

---

## New Architecture

### 1. Frontend (React + TypeScript) - Port 5173
**Purpose**: Dashboard for admins and human agents
**Features**:
- Login (JWT auth against NestJS)
- Call log viewer with transcripts
- Ticket management (view, assign, escalate, close)
- Device/Organization lookup
- Real-time call status (WebSocket)
- Analytics dashboard (charts, metrics)

### 2. Backend (NestJS + TypeScript) - Port 3000
**Purpose**: Business logic, API, data ownership
**Modules**:
- `auth` - JWT login for dashboard users
- `calls` - Call log CRUD, transcript viewer
- `tickets` - Ticket lifecycle, SLA, assignments
- `devices` - Device lookup, org/contact resolution
- `organizations` - Org management
- `contacts` - Contact management
- `dashboard` - Analytics aggregation
- `ai-service` - Proxy to Python for AI tasks
- `websocket` - Real-time updates to frontend

**Key Endpoints**:
```
POST /auth/login
GET  /calls?page=1&status=completed
GET  /calls/:id (with transcript)
GET  /tickets?status=open&priority=high
POST /tickets/:id/assign
POST /tickets/:id/escalate
GET  /devices?org=123
GET  /organizations/:id/contacts
GET  /dashboard/overview
WS   /events (realtime call updates)
```

### 3. AI Service (Python FastAPI) - Port 8080
**Purpose**: Voice handling, LLM orchestration
**Keeps**:
- Twilio webhook handlers
- OpenAI realtime voice connection
- Multi-agent system (triage, email, computer, etc.)
- Tool functions (DB lookups)
- Transcript processing

**Removed from Python**:
- Dashboard serving (moved to React)
- Dashboard API (moved to NestJS)
- User auth (moved to NestJS)

**New Internal API** (called by NestJS):
```
POST /ai/summarize    - Summarize call transcript
POST /ai/classify     - Classify ticket category
POST /ai/suggest      - Suggest next action
POST /ai/search-kb    - Search knowledge base
```

---

## Service Communication

```
┌─────────────────────────────────────────────────────────────┐
│                        USERS                                 │
└─────────────────────────────────────────────────────────────┘
           │                              │
           │ Browser                      │ Phone Call
           ▼                              ▼
┌─────────────────────┐         ┌─────────────────────┐
│   React Frontend    │         │      Twilio         │
│   (Dashboard UI)    │         │   (Voice Gateway)   │
└──────────┬──────────┘         └──────────┬──────────┘
           │ REST + WS                     │ Webhooks
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   NestJS Backend    │◀───────▶│  Python AI Service  │
│  (Business Logic)   │ Internal│  (Voice + LLM)      │
└──────────┬──────────┘   API   └──────────┬──────────┘
           │                               │
           │                               │ OpenAI
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   PostgreSQL        │         │   OpenAI Realtime   │
│   (Supabase)        │         │   (Voice API)       │
└─────────────────────┘         └─────────────────────┘
```

---

## File Structure

```
urackit_v2/
├── frontend/                    # React + TypeScript
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Route pages
│   │   ├── hooks/              # Custom hooks
│   │   ├── services/           # API clients
│   │   ├── store/              # State management
│   │   └── types/              # TypeScript types
│   └── package.json
│
├── backend/                     # NestJS
│   ├── src/
│   │   ├── prisma/             # DB client
│   │   ├── auth/               # JWT auth
│   │   ├── calls/              # Call logs
│   │   ├── tickets/            # Ticket management
│   │   ├── devices/            # Device lookup
│   │   ├── organizations/      # Org management
│   │   ├── dashboard/          # Analytics
│   │   ├── ai-service/         # Python proxy
│   │   └── websocket/          # Realtime events
│   └── package.json
│
├── ai-service/                  # Python FastAPI
│   ├── agents/                 # Multi-agent system
│   ├── db/                     # DB queries
│   ├── voice/                  # Twilio + OpenAI
│   ├── tools/                  # Agent tools
│   └── requirements.txt
│
└── package.json                 # Root scripts
```
