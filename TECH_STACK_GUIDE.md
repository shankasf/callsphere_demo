# URackIT v2 - Tech Stack & Architecture Guide

> **Reusable Template for Building AI Voice Agent Applications**
>
> This document explains how the urackit_v2 app works so you can replicate this pattern for any other use case (e.g., salon booking, real estate, customer support, etc.)

---

## 🏗️ Architecture Overview

This is a **3-tier architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACES                                    │
│  ┌─────────────────────────────────┐  ┌────────────────────────────────────┐│
│  │  WEB DASHBOARD (React)          │  │  VOICE (Phone Call / WebRTC)       ││
│  │  - Admin views data             │  │  - Caller talks to AI              ││
│  │  - Manages tickets, devices     │  │  - Twilio routes call              ││
│  └───────────────┬─────────────────┘  └───────────────┬────────────────────┘│
└──────────────────┼────────────────────────────────────┼─────────────────────┘
                   │ HTTP/WebSocket                     │ Twilio Webhooks
                   ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TIER 2: BACKEND SERVICES                                │
│                                                                              │
│  ┌─────────────────────────────┐    ┌────────────────────────────────────┐  │
│  │  NestJS Backend (Node.js)   │◄───│  FastAPI AI Service (Python)       │  │
│  │  Port: 3003                 │    │  Port: 8081                        │  │
│  │                             │    │                                    │  │
│  │  - REST API                 │    │  - Twilio webhook handlers         │  │
│  │  - JWT Authentication       │    │  - OpenAI Realtime voice API       │  │
│  │  - WebSocket events         │    │  - Multi-agent LLM orchestration   │  │
│  │  - Business logic           │    │  - RAG knowledge base (ChromaDB)   │  │
│  │  - Prisma ORM               │    │  - Tool functions                  │  │
│  └──────────────┬──────────────┘    └───────────────┬────────────────────┘  │
│                 │                                   │                        │
└─────────────────┼───────────────────────────────────┼────────────────────────┘
                  │                                   │
                  ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TIER 3: DATA & AI SERVICES                            │
│                                                                              │
│  ┌─────────────────────────────┐    ┌────────────────────────────────────┐  │
│  │  PostgreSQL (Supabase)      │    │  OpenAI Realtime API               │  │
│  │  - Organizations            │    │  - GPT-4o Realtime voice model     │  │
│  │  - Contacts                 │    │  - Whisper transcription           │  │
│  │  - Devices                  │    │  - Function calling                │  │
│  │  - Tickets                  │    │                                    │  │
│  │  - Call logs                │    │                                    │  │
│  │  - Analytics                │    │                                    │  │
│  └─────────────────────────────┘    └────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
my_app/
├── package.json              # Root - scripts to run all services
├── ecosystem.config.js       # PM2 config for production
├── Dockerfile               # Docker build for all services
│
├── frontend/                # React + TypeScript + Vite
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── src/
│       ├── App.tsx          # Routes & auth wrapper
│       ├── main.tsx         # Entry point
│       ├── components/      # Reusable UI components
│       ├── pages/           # Route pages (Overview, Calls, Tickets, etc.)
│       ├── services/        # API client (axios)
│       ├── context/         # React Context (Auth)
│       ├── hooks/           # Custom hooks (useRealtime, etc.)
│       └── types/           # TypeScript interfaces
│
├── backend/                 # NestJS + Prisma
│   ├── package.json
│   ├── nest-cli.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma    # Database schema
│   └── src/
│       ├── main.ts          # Entry point (port, CORS, Swagger)
│       ├── app.module.ts    # Root module imports
│       ├── prisma/          # Prisma service
│       ├── auth/            # JWT authentication
│       ├── dashboard/       # Dashboard aggregations
│       ├── calls/           # Call log CRUD
│       ├── tickets/         # Ticket management
│       ├── devices/         # Device inventory
│       ├── organizations/   # Org management
│       ├── contacts/        # Contact management
│       ├── events/          # WebSocket gateway (Socket.io)
│       └── ai/              # Proxy to Python AI service
│
├── ai-service/              # Python FastAPI
│   ├── requirements.txt
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Environment configuration
│   ├── agents/              # OpenAI Agent SDK pipeline
│   │   └── pipeline.py
│   ├── app_agents/          # Domain-specific agents
│   │   ├── triage_agent.py  # Entry point, routes to others
│   │   ├── device_agent.py
│   │   ├── ticket_agent.py
│   │   └── ...
│   ├── db/
│   │   ├── connection.py    # Supabase REST client
│   │   └── queries.py       # Tool functions for agents
│   ├── memory/
│   │   ├── memory.py        # Session memory
│   │   └── knowledge_base.py # ChromaDB RAG
│   ├── sip_integration/     # Voice handling
│   │   ├── webhook_server.py    # Twilio HTTP webhooks
│   │   ├── media_stream.py      # Twilio WebSocket audio
│   │   ├── openai_realtime.py   # OpenAI Realtime WebSocket
│   │   └── session_manager.py   # Call session state
│   └── static/              # Optional web interfaces
│
└── db/                      # Database migrations (optional)
    └── schema.sql
```

---

## 🔧 Tech Stack Details

### 1. Frontend (React + TypeScript)

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.x | UI framework |
| **TypeScript** | 5.x | Type safety |
| **Vite** | 7.x | Build tool (fast HMR) |
| **Tailwind CSS** | 4.x | Utility-first styling |
| **React Router** | 7.x | Client-side routing |
| **TanStack Query** | 5.x | Server state management |
| **Recharts** | 3.x | Charts/graphs |
| **Socket.io Client** | 4.x | Real-time updates |
| **Axios** | 1.x | HTTP client |
| **Lucide React** | 0.5x | Icons |

**Key Patterns:**
```tsx
// services/api.ts - Centralized API client
const api = axios.create({ baseURL: '/api' });

// Add JWT token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// services/websocket.ts - Real-time connection
import { io } from 'socket.io-client';
const socket = io({ path: '/socket.io' });
socket.on('call:started', (data) => { /* update UI */ });
```

### 2. Backend (NestJS + Prisma)

| Technology | Version | Purpose |
|------------|---------|---------|
| **NestJS** | 11.x | API framework (modular) |
| **Prisma** | 7.x | ORM with type safety |
| **PostgreSQL** | 15+ | Primary database |
| **Socket.io** | 4.x | WebSocket server |
| **Passport JWT** | 4.x | Authentication |
| **Swagger** | 11.x | API documentation |

**Key Patterns:**

```typescript
// Module structure (each feature is a module)
@Module({
  imports: [PrismaModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}

// Service with Prisma
@Injectable()
export class CallsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: CallFilters) {
    return this.prisma.call_logs.findMany({
      where: { ...filters },
      include: { organization: true },
    });
  }
}

// WebSocket Gateway for real-time
@WebSocketGateway({ cors: true })
export class EventsGateway {
  @WebSocketServer() server: Server;

  emitCallStarted(callData: any) {
    this.server.emit('call:started', callData);
  }
}
```

### 3. AI Service (Python FastAPI)

| Technology | Version | Purpose |
|------------|---------|---------|
| **FastAPI** | 0.115.x | Async API framework |
| **OpenAI Agents SDK** | 0.0.15 | Multi-agent orchestration |
| **ChromaDB** | 0.5.x | Vector store for RAG |
| **Twilio** | 9.x | Voice/SIP integration |
| **WebSockets** | 14.x | Real-time audio streaming |
| **Pydantic** | 2.x | Data validation |

**Key Patterns:**

```python
# Multi-agent setup with handoffs
from agents import Agent, Runner

triage_agent = Agent(
    name="TriageAgent",
    instructions="You are a helpful assistant...",
    tools=[find_organization, create_ticket, handoff_to_device_agent],
)

device_agent = Agent(
    name="DeviceAgent",
    instructions="You help with device issues...",
    tools=[get_device_status, search_knowledge],
)

# Run the agent pipeline
result = await Runner.run(triage_agent, user_message, context=context)
```

---

## 🔊 Voice Architecture (Twilio + OpenAI Realtime)

```
                    ┌─────────────────┐
                    │  Phone Call     │
                    │  (Caller)       │
                    └────────┬────────┘
                             │ PSTN
                             ▼
                    ┌─────────────────┐
                    │  Twilio         │
                    │  (Voice SIP)    │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │ HTTP Webhook    │ WebSocket       │
           ▼                 ▼                 │
┌──────────────────┐ ┌──────────────────┐      │
│ /twilio          │ │ /media-stream    │      │
│ (Call start/end) │ │ (Audio stream)   │      │
└────────┬─────────┘ └────────┬─────────┘      │
         │                    │                │
         │    ┌───────────────┘                │
         │    │                                │
         ▼    ▼                                │
┌──────────────────────────────────────┐       │
│  Python AI Service                   │       │
│  ┌────────────────────────────────┐  │       │
│  │  Session Manager               │  │       │
│  │  - Track active calls          │  │       │
│  │  - Store conversation state    │  │       │
│  └────────────────────────────────┘  │       │
│                 │                    │       │
│                 ▼                    │       │
│  ┌────────────────────────────────┐  │       │
│  │  Media Stream Handler          │  │       │
│  │  - Receive Twilio audio (mulaw)│  │       │
│  │  - Convert to PCM16            │  │       │
│  │  - Send to OpenAI              │  │       │
│  │  - Receive OpenAI audio        │  │       │
│  │  - Send back to Twilio         │  │       │
│  └────────────────────────────────┘  │       │
│                 │                    │       │
│                 ▼                    │       │
│  ┌────────────────────────────────┐  │       │
│  │  OpenAI Realtime Connection    │◄─┼───────┘
│  │  - WebSocket to OpenAI         │  │
│  │  - Send/receive audio chunks   │  │
│  │  - Handle tool calls           │  │
│  │  - Transcription (Whisper)     │  │
│  └────────────────────────────────┘  │
│                 │                    │
│                 ▼                    │
│  ┌────────────────────────────────┐  │
│  │  Agent Pipeline                │  │
│  │  - Triage → Specialized agent  │  │
│  │  - Tool execution              │  │
│  │  - Knowledge base search       │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

**Twilio Webhook Flow:**

1. **Call comes in** → Twilio hits `POST /twilio` with call details
2. **Return TwiML** → Tell Twilio to connect WebSocket to `/media-stream/{session_id}`
3. **Audio streams** → Twilio sends 8kHz mulaw audio via WebSocket
4. **Convert & forward** → AI service converts to PCM16, sends to OpenAI Realtime
5. **AI responds** → OpenAI sends audio back, convert to mulaw, send to Twilio
6. **Call ends** → Twilio hits webhook, save transcript to database

---

## 💾 Database Schema Pattern

The database is organized into logical groups:

### Core Entities (WHO)
```sql
-- Organizations (clients/companies)
CREATE TABLE organizations (
  organization_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  u_e_code VARCHAR(50) UNIQUE,  -- Identifier for voice lookup
  account_manager_id INT REFERENCES account_managers(manager_id)
);

-- Contacts (people at organizations)
CREATE TABLE contacts (
  contact_id SERIAL PRIMARY KEY,
  organization_id INT REFERENCES organizations(organization_id),
  full_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50)  -- For caller identification
);
```

### Business Objects (WHAT)
```sql
-- Tickets (support issues)
CREATE TABLE support_tickets (
  ticket_id SERIAL PRIMARY KEY,
  organization_id INT REFERENCES organizations(organization_id),
  contact_id INT REFERENCES contacts(contact_id),
  status_id INT REFERENCES ticket_statuses(status_id),
  priority_id INT REFERENCES ticket_priorities(priority_id),
  subject VARCHAR(500),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Devices (inventory items) - adjust for your domain
CREATE TABLE devices (
  device_id SERIAL PRIMARY KEY,
  organization_id INT REFERENCES organizations(organization_id),
  device_type_id INT REFERENCES device_types(type_id),
  hostname VARCHAR(255),
  serial_number VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active'
);
```

### Analytics (TRACKING)
```sql
-- Call logs (every voice interaction)
CREATE TABLE call_logs (
  call_id VARCHAR(100) PRIMARY KEY,
  call_sid VARCHAR(64) UNIQUE,  -- Twilio SID
  caller_phone VARCHAR(50),
  organization_id INT REFERENCES organizations(organization_id),
  contact_id INT REFERENCES contacts(contact_id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'in_progress',
  ai_resolution BOOLEAN DEFAULT true,
  was_escalated BOOLEAN DEFAULT false,
  transcript TEXT,
  call_summary TEXT,
  ticket_id INT REFERENCES support_tickets(ticket_id)
);

-- AI usage tracking
CREATE TABLE ai_usage_logs (
  usage_id SERIAL PRIMARY KEY,
  call_id VARCHAR(100) REFERENCES call_logs(call_id),
  model VARCHAR(100),
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  total_cost_cents DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🤖 Multi-Agent Pattern

The system uses specialized agents that hand off to each other:

```python
# 1. Define tools as functions with @function_tool decorator
from agents import function_tool

@function_tool
def find_organization_by_code(u_e_code: str) -> dict:
    """Find organization by U&E code."""
    db = SupabaseDB()
    result = db.select("organizations", filters={"u_e_code": f"eq.{u_e_code}"})
    return result[0] if result else None

@function_tool
def create_ticket(org_id: int, subject: str, description: str) -> dict:
    """Create a new support ticket."""
    db = SupabaseDB()
    return db.insert("support_tickets", {
        "organization_id": org_id,
        "subject": subject,
        "description": description,
    })

# 2. Define agents with specific instructions and tools
from agents import Agent

triage_agent = Agent(
    name="TriageAgent",
    instructions="""
    You are the initial contact. Your job is to:
    1. Greet the caller
    2. Ask for their organization code
    3. Verify their identity
    4. Determine their issue category
    5. Hand off to the appropriate specialist agent
    """,
    tools=[
        find_organization_by_code,
        find_contact_by_phone,
        create_ticket,
    ],
    handoffs=[device_agent, ticket_agent, network_agent],
)

device_agent = Agent(
    name="DeviceAgent",
    instructions="""
    You handle device-related issues. You can:
    - Look up device information
    - Troubleshoot common issues
    - Create tickets for complex problems
    """,
    tools=[
        get_device_status,
        search_knowledge_base,
        create_ticket,
    ],
    handoffs=[triage_agent],  # Can hand back
)

# 3. Run the pipeline
from agents import Runner

async def process_message(user_message: str, context: dict):
    result = await Runner.run(
        triage_agent,
        user_message,
        context=context,
    )
    return result.final_output
```

---

## 🧠 RAG Knowledge Base

Uses ChromaDB to store and search domain knowledge:

```python
import chromadb
from chromadb.utils import embedding_functions

# Initialize ChromaDB
client = chromadb.PersistentClient(path="./chroma_store")
embedding_fn = embedding_functions.DefaultEmbeddingFunction()
collection = client.get_or_create_collection("knowledge_base", embedding_function=embedding_fn)

# Load knowledge from text file
def load_knowledge(file_path: str):
    with open(file_path, "r") as f:
        text = f.read()
    
    # Split into chunks
    chunks = split_text(text, chunk_size=600, overlap=120)
    
    # Add to collection
    ids = [f"doc-{i}" for i in range(len(chunks))]
    collection.upsert(ids=ids, documents=chunks)

# Search function (used as agent tool)
@function_tool
def search_knowledge(query: str, n_results: int = 3) -> list:
    """Search the knowledge base for relevant information."""
    results = collection.query(query_texts=[query], n_results=n_results)
    return results["documents"][0] if results["documents"] else []
```

**Knowledge file format** (`knowledge.txt`):
```
# Topic: Email Issues
## Problem: Outlook not receiving emails
1. Check internet connection
2. Verify Outlook is online (bottom right)
3. Check webmail at outlook.office365.com
4. If webmail works, restart Outlook

# Topic: Printer Issues
## Problem: Printer not printing
1. Check printer is powered on
2. Check for paper jams
3. Run Windows troubleshooter
...
```

---

## 🌐 Real-time Updates (WebSocket)

Frontend subscribes to events, backend emits when data changes:

**Backend (NestJS Gateway):**
```typescript
@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  // Called from services when data changes
  emitCallStarted(call: CallLog) {
    this.server.emit('call:started', call);
  }

  emitCallEnded(call: CallLog) {
    this.server.emit('call:ended', call);
  }

  emitTicketCreated(ticket: Ticket) {
    this.server.emit('ticket:created', ticket);
  }
}
```

**Frontend (React):**
```typescript
import { useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io();

export function useRealtimeUpdates(onCallStarted: (call) => void) {
  useEffect(() => {
    socket.on('call:started', onCallStarted);
    return () => { socket.off('call:started'); };
  }, [onCallStarted]);
}
```

---

## 🔐 Authentication Flow

```
┌─────────┐         ┌─────────┐         ┌─────────┐
│ Frontend│         │ Backend │         │ Database│
└────┬────┘         └────┬────┘         └────┬────┘
     │ POST /auth/login  │                   │
     │ {email, password} │                   │
     │──────────────────>│                   │
     │                   │ Find user         │
     │                   │──────────────────>│
     │                   │<──────────────────│
     │                   │ Verify password   │
     │                   │ Generate JWT      │
     │ {accessToken, user}                   │
     │<──────────────────│                   │
     │                   │                   │
     │ GET /api/calls    │                   │
     │ Authorization:    │                   │
     │   Bearer <token>  │                   │
     │──────────────────>│                   │
     │                   │ Verify JWT        │
     │                   │ Extract user      │
     │ {calls: [...]}    │                   │
     │<──────────────────│                   │
```

---

## 📦 Dependencies Summary

### Frontend (`frontend/package.json`)
```json
{
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.11.0",
    "@tanstack/react-query": "^5.90.0",
    "axios": "^1.13.0",
    "socket.io-client": "^4.8.0",
    "tailwindcss": "^4.1.0",
    "recharts": "^3.6.0",
    "lucide-react": "^0.562.0"
  }
}
```

### Backend (`backend/package.json`)
```json
{
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/passport": "^11.0.0",
    "@nestjs/platform-socket.io": "^11.0.0",
    "@nestjs/swagger": "^11.2.0",
    "@prisma/client": "^7.2.0",
    "passport-jwt": "^4.0.0",
    "socket.io": "^4.8.0",
    "axios": "^1.13.0",
    "bcryptjs": "^3.0.0"
  }
}
```

### AI Service (`ai-service/requirements.txt`)
```
fastapi==0.115.6
uvicorn[standard]==0.34.0
python-dotenv==1.0.1
pydantic==2.10.3
openai-agents==0.0.15
chromadb==0.5.23
websockets==14.1
twilio==9.4.1
requests==2.32.3
psycopg2-binary==2.9.10
```

---

## 🚀 Deployment

### Development
```bash
# Terminal 1: Frontend
cd frontend && npm run dev  # http://localhost:5173

# Terminal 2: Backend
cd backend && npm run start:dev  # http://localhost:3003

# Terminal 3: AI Service
cd ai-service
source venv/bin/activate
uvicorn main:app --reload --port 8081
```

### Production (PM2)
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'app-backend',
      script: 'dist/src/main.js',
      cwd: './backend',
      env: { PORT: 3003, AI_SERVICE_URL: 'http://localhost:8081' }
    },
    {
      name: 'app-ai',
      script: './venv/bin/uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8081',
      cwd: './ai-service',
      interpreter: 'none'
    }
  ]
};
```

### Nginx Config
```nginx
server {
    listen 443 ssl;
    server_name myapp.example.com;

    # Frontend & API (NestJS serves both)
    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # AI Service (Twilio webhooks)
    location /ai/ {
        proxy_pass http://localhost:8081/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 🔄 Adapting for Another Use Case

### Example: Salon Booking Voice Agent

1. **Change the agents** in `ai-service/app_agents/`:
   - `triage_agent.py` → Ask for appointment type
   - `booking_agent.py` → Check availability, book slots
   - `info_agent.py` → Answer questions about services

2. **Change the database schema** in `backend/prisma/schema.prisma`:
   - `organizations` → `salons`
   - `devices` → `services` (haircut, manicure, etc.)
   - `contacts` → `customers`
   - `support_tickets` → `appointments`

3. **Change the knowledge base** in `ai-service/knowledge.txt`:
   - Services offered
   - Pricing
   - Hours of operation
   - FAQ

4. **Change the dashboard pages** in `frontend/src/pages/`:
   - `DevicesPage` → `ServicesPage`
   - `TicketsPage` → `AppointmentsPage`
   - Update charts and metrics

5. **Update tool functions** in `ai-service/db/queries.py`:
   - `find_device` → `find_service`
   - `create_ticket` → `create_appointment`
   - Add `check_availability`, `get_stylist_schedule`, etc.

---

## 📋 Checklist for New Project

- [ ] Clone the structure
- [ ] Update `package.json` names
- [ ] Create new Prisma schema for your domain
- [ ] Write domain-specific agents with tools
- [ ] Create knowledge base content
- [ ] Update frontend pages/components
- [ ] Configure environment variables
- [ ] Set up Twilio phone number & webhooks
- [ ] Deploy with PM2 + Nginx

---

## 📞 Support

For questions about this architecture, refer to:
- [README.md](./README.md) - Project overview
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed architecture
- Backend Swagger docs at `/api/docs`

---

*Built with ❤️ - Reusable AI Voice Agent Platform*
