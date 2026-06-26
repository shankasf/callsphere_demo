# CallSphere Multi‑Industry Demo

A single codebase that impersonates a **different AI voice + chat receptionist for every industry** CallSphere serves. Pick an industry on the landing page and the whole demo — persona, knowledge base, voice, booking — re‑skins to that business.

- **Live:** https://demo.callsphere.site
- **Industries (13):** Healthcare · Dental · Behavioral Health · Real Estate · Insurance · Finance · Legal · Home Services (HVAC) · Automotive · Hospitality · Logistics · SaaS / IT Support · Body Care (salon, spa & aesthetic/laser clinics)

Each industry has its **own persona**, its **own pgvector knowledge base** (`demo_<slug>` database), and an agent that can **answer from that KB, book a real appointment, and email a confirmation** via AWS SES.

---

## 1. System architecture

```mermaid
flowchart TB
    subgraph Browser
        UI["React + Vite SPA<br/>(industry picker, dashboards)"]
        CW["Chat widget"]
        VW["Voice widget (WebRTC)"]
    end

    subgraph K3s["k3s namespace: demo"]
        BE["NestJS backend :3003<br/>serves SPA, /api proxy, socket.io"]
        AI["Python FastAPI ai-service :8081<br/>chat pipeline + realtime voice"]
    end

    subgraph Data["Central Postgres"]
        APP[("demo DB<br/>industries, demo_appointments,<br/>demo_leads, call_logs, analytics")]
        KB[("demo_slug DBs<br/>kb.qa — pgvector per industry")]
    end

    subgraph OpenAI
        RESP["Responses API<br/>(chat — gpt-5.x)"]
        RT["Realtime API<br/>(voice — gpt-realtime-2)"]
        EMB["Embeddings<br/>(text-embedding-3-small)"]
    end

    SES["AWS SES<br/>mail.callsphere.site"]

    UI --> BE
    CW -->|/api/chat| BE
    VW -->|/api/voice/webrtc/connect| BE
    BE -->|proxy| AI
    AI --> RESP
    AI --> EMB
    AI -->|mint client_secret + SDP| RT
    VW -.->|WebRTC media/audio| RT
    AI --> APP
    AI --> KB
    AI -->|confirmation email| SES
    BE --> APP
```

The backend serves the built SPA and proxies `/api/chat` + `/api/voice/*` to the ai‑service. All AI logic lives in the ai‑service.

---

## 2. AI services — chat agent (text)

The chat agent is **one dynamic agent** built per request from the selected industry. It uses the **OpenAI Responses API** with built‑in server‑side memory (`previous_response_id`), so it remembers the whole conversation without us replaying history.

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Chat widget
    participant BE as NestJS /api/chat
    participant AI as ai-service /api/chat
    participant DB as Postgres
    participant LLM as Responses API
    participant SES as AWS SES

    U->>FE: message (+ sticky session_id)
    FE->>BE: POST /api/chat
    BE->>AI: proxy
    AI->>AI: build per-industry agent<br/>(persona + KB RAG + chat rules)
    AI->>LLM: responses.create(instructions, input,<br/>previous_response_id, store=true, tools)
    alt model calls a tool
        LLM-->>AI: function_call
        AI->>DB: search_qa (pgvector) / INSERT demo_appointments
        AI->>SES: confirmation email (on book, after user confirms)
        AI->>LLM: responses.create(tool output, previous_response_id)
    end
    LLM-->>AI: final reply + response_id
    AI->>AI: persist response_id (next-turn memory)
    AI-->>FE: reply
```

**Tools available to the chat agent**

| Tool | What it does |
|------|--------------|
| `search_knowledge` | Vector search over the industry's `demo_<slug>.kb.qa` (per‑industry RAG). |
| `book_appointment` | Validates + writes a real row to `demo_appointments`, then sends an SES confirmation. Only called **after the customer confirms**. |

**Conversation rules (all industries):** short replies, ask the customer's **name + email up front**, list services as a **numbered list**, read details back and **confirm before booking**, then confirm in one line that the email is on its way.

---

## 3. AI services — voice agent (speech‑to‑speech, separate)

Voice is a **separate agent** on the **`gpt-realtime-2`** speech‑to‑speech model with `gpt-realtime-whisper` transcription. It is intentionally kept apart from the chat pipeline.

```mermaid
flowchart LR
    VW["Browser voice widget"] -->|SDP offer + industry| BE2["backend /api/voice/webrtc/connect"]
    BE2 --> AIC["ai-service /webrtc/connect"]
    AIC -->|"1. mint client_secret (persona, greeting, audio out)"| OAI["OpenAI Realtime<br/>gpt-realtime-2"]
    AIC -->|"2. SDP exchange /v1/realtime/calls"| OAI
    AIC -->|answer SDP| VW
    VW <-->|"WebRTC audio (alloy voice)"| OAI

    TW["Twilio number"] -->|webhook| AIC2["ai-service /twilio"]
    AIC2 -->|TwiML Stream| MS["/media-stream WS"]
    MS <-->|"G.711 ulaw audio"| OAI
    MS --> ADP["agent_adapter<br/>search_knowledge, select_industry"]
```

- **Browser voice** mints an ephemeral `client_secret` with the industry persona + greeting, then the browser talks **directly** to OpenAI Realtime over WebRTC (audio never round‑trips through us).
- **Phone voice** streams Twilio media to OpenAI Realtime via a WebSocket. The shared single line uses a **concierge** persona + `select_industry` tool so one number can demo any industry.

---

## 4. Per‑industry knowledge base (RAG)

```mermaid
flowchart LR
    Q["question"] --> E["embed<br/>text-embedding-3-small (1536d)"]
    E --> V{"cosine search<br/>demo_slug.kb.qa"}
    V --> A["top-k Q&amp;A pairs"]
    A --> P["injected into agent / returned by search_knowledge"]
```

Each industry's KB is seeded by `ai-service/scripts/seed_qa.py` (20 brand‑neutral Q&A pairs per industry) into its own `demo_<slug>` database with the `vector` extension and a `kb.qa` table.

---

## 5. Services & layout

| Path | Service | Notes |
|------|---------|-------|
| `frontend/` | React + Vite SPA | Built to `frontend/dist`, served by the backend. |
| `backend/` | NestJS (`:3003`) | Serves SPA, proxies `/api/chat` & `/api/voice/*`, socket.io `/events`, demo/industries/dashboard modules. |
| `ai-service/` | Python FastAPI (`:8081`) | Chat pipeline (`agents/pipeline.py`), industry context + RAG (`industry_context.py`), booking + SES (`booking.py`, `mailer.py`), realtime voice (`sip_integration/`). |
| `k8s/` | Manifests | Deployments, configmap, ingress; secrets via `*-app-secrets` (see `secrets.example.yaml`). |

### Data model (demo DB highlights)
- `industries` — slug, name, tagline, persona, greeting, icon, accent_color.
- `demo_appointments` — real bookings written by the agent (+ `confirmation_sent`).
- `demo_leads` — captured demo emails.
- `call_logs`, `conversation_analysis`, `agent_interactions` — voice/chat analytics.

---

## 6. Local / ops notes

- **Backend** runs straight off the hostPath repo: installs deps + `npm run build` on first start, then `node dist/src/main.js`. Rebuild `dist` to ship backend changes.
- **ai-service** runs `uvicorn main:app` (no `--reload`) — restart the deployment to pick up code changes.
- **Frontend** changes require `npm run build` (served from `frontend/dist`) + a backend restart.
- **Secrets** (DB URL, OpenAI key, Twilio, AWS SES) come from the `demo-app-secrets` Secret — never commit `.env`.

```bash
# seed a fresh industry KB
cd ai-service && ./venv/bin/python -m scripts.seed_qa

# rebuild + ship frontend
cd frontend && npm run build && kubectl rollout restart deploy/demo-backend -n demo

# ship ai-service changes
kubectl rollout restart deploy/demo-ai -n demo
```

---

*Powered by CallSphere — AI voice & chat agents for every industry · [callsphere.ai](https://callsphere.ai)*
