# CLAUDE.md — AI Fundraising Copilot

Full context for working on this project across sessions.

---

## Project Overview

**AI Fundraising Copilot** — helps NGOs (initially Tunisian) discover, evaluate, prepare, and manage grant opportunities using AI.

**Stack:** React 18 + Vite (frontend) · FastAPI + SQLite by default, PostgreSQL optional (backend) · Mistral AI (LLM + embeddings) · Qdrant, embedded on disk by default (vector search) · Tavily (web search for new grant sources) · APScheduler (crawling + reminders) · JWT auth


---

## Repository Layout

```
fundraising-copilot/
├── backend/
│   ├── config.py               # Pydantic settings — reads from .env
│   ├── main.py                 # FastAPI entry point, CORS, routers, scheduler
│   ├── requirements.txt
│   ├── models/                 # SQLAlchemy ORM models
│   │   ├── database.py         # Engine, SessionLocal, Base, init_database()
│   │   ├── ngo.py              # NGO profile
│   │   ├── user.py             # Users (JWT auth)
│   │   ├── grant.py            # Grant + GrantSource
│   │   ├── pipeline.py         # PipelineEntry + NGOInteraction
│   │   └── application.py     # Application drafts
│   ├── schemas/                # Pydantic request/response models
│   ├── routers/                # FastAPI route handlers (all require a JWT except /auth/register, /auth/login, /health)
│   │   ├── auth.py             # /auth/ — register, login, me, link NGO
│   │   ├── ngos.py             # /ngos/ — NGO CRUD
│   │   ├── grants.py           # /grants/ — search, sources, ingestion trigger
│   │   ├── matches.py          # /matches/ — AI match scoring
│   │   ├── pipeline.py         # /pipeline/ — pipeline CRUD
│   │   ├── applications.py     # /applications/ — AI draft + save
│   │   └── dashboard.py        # /dashboard/ — KPIs
│   └── services/
│       ├── mistral_service.py  # All Mistral AI calls (embed, score, draft, extract)
│       ├── qdrant_service.py   # Qdrant vector store (init, upsert, search)
│       ├── ingestion_service.py# Web scraper + grant ingestion pipeline
│       ├── tavily_service.py   # Tavily web search (source discovery)
│       ├── url_safety.py       # Blocks fetching private/internal URLs (SSRF)
│       ├── auth_service.py     # Password hashing, JWT, get_current_user, require_ngo_access
│       ├── matching_service.py # Vector search + Mistral scoring orchestration
│       └── scheduler.py        # APScheduler jobs (ingestion + reminders)
│
└── frontend/
    ├── src/
    │   ├── api/client.js       # All Axios API calls
    │   ├── App.jsx             # Router
    │   ├── context/AppContext.jsx
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   └── GrantCard.jsx
    │   └── pages/
    │       ├── OnboardingPage.jsx      # NGO profile setup
    │       ├── DiscoveryPage.jsx       # AI matches + search
    │       ├── PipelinePage.jsx        # Grant pipeline board
    │       ├── ApplicationPage.jsx     # AI-assisted draft editor
    │       └── DashboardPage.jsx       # KPIs + deadlines
```

---

## How to Run

### Prerequisites
- Node.js ≥ 18, Python ≥ 3.10
- Nothing else by default: SQLite (`backend/data/fundraising_copilot.db`) and embedded Qdrant
  (`QDRANT_URL=local`, stored in `backend/data/qdrant_local/`) are created automatically.
- Optional: PostgreSQL (`DATABASE_URL=postgresql://...`) and a Qdrant server
  (`docker run -p 6333:6333 qdrant/qdrant`, `QDRANT_URL=http://localhost:6333`).
- Embedded Qdrant locks its folder: run a single uvicorn process (no `--workers N`).

### Backend
On this Windows machine an Application Control policy blocks `pip.exe` / `uvicorn.exe`:
always use `python -m pip ...` and `python -m uvicorn ...`.
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate       # Windows
python -m pip install -r requirements.txt
cp ../.env.example .env        # fill in keys
python -m uvicorn main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

### Frontend
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | DB connection string (default SQLite; relative paths resolve from `backend/`) |
| `QDRANT_URL` | `local` for embedded storage, or a Qdrant server URL |
| `TAVILY_API_KEY` | Tavily web search — discovers new grant pages |
| `QDRANT_COLLECTION` | Collection name (default: grants) |
| `MISTRAL_API_KEY` | Mistral AI — embeddings + LLM |
| `MISTRAL_MODEL` | LLM model (default: ministral-14b-latest; see Mistral models below) |
| `MISTRAL_EMBED_MODEL` | Embedding model (default: mistral-embed, 1024-dim) |
| `SECRET_KEY` | JWT signing key |
| `INGESTION_INTERVAL_HOURS` | How often the crawler runs (default: 6) |
| `SOURCE_RECRAWL_HOURS` | Min hours before an analysed page is crawled again (default: 24) |
| `INGESTION_MAX_SOURCES_PER_CYCLE` | Pages analysed per scan (default: 25) |
| `REMINDER_CHECK_INTERVAL_HOURS` | Deadline reminder check frequency (default: 24) |

---

## Architecture Notes

### Grant Matching Flow
1. NGO profile → text representation → `mistral-embed` (1024-dim vector)
2. Qdrant cosine search → top N candidate grants
3. Mistral LLM scores each candidate (0–100) + writes explanation
4. Results ranked by `match_score` descending

### Grant Ingestion Pipeline (`services/ingestion_service.py`)
Runs in a background thread: `POST /grants/ingest/run` returns 202, the UI polls `GET /grants/ingest/status`.
The scheduler and the manual trigger share `ingestion_lock`, so only one cycle runs at a time.
1. Tavily search (queries built from NGO sectors) → new pages filtered by Tavily score and funding keywords;
   their text comes from one batched Tavily `extract` call
2. Due sources: never analysed by the LLM (`content_hash` NULL) or not crawled for `SOURCE_RECRAWL_HOURS` (24h);
   max `INGESTION_MAX_SOURCES_PER_CYCLE` (25) per cycle
3. Pages downloaded in parallel (`SCRAPE_CONCURRENCY`); 403/timeouts retried via Tavily `extract`
4. `focus_text()` keeps the grant-related excerpts (≤ 12k chars); unchanged pages (same hash) are skipped
5. Mistral extracts grants open to the NGOs' countries (3 pages in parallel, ≤ 15 grants/page, closed calls dropped)
6. Dedupe on `source_url` and on title; grants embedded in batches and upserted to Qdrant
7. A source is deactivated after 3 consecutive failures (fetch errors or analyses yielding nothing)
8. If every Mistral model is rate limited, the cycle stops early; unanalysed pages stay due for the next scan

### Mistral models
`MISTRAL_MODEL` (default `ministral-14b-latest`) then `MISTRAL_FALLBACK_MODELS` (`ministral-8b-latest`, `ministral-3b-latest`).
A model answering 429 with `x-ratelimit-limit-req-minute: 0` has no quota on the account and is disabled for the
process; a busy model gets a short cooldown and the next one is used. On the current account
`mistral-small-latest` / `mistral-medium-latest` have zero quota.

### Search (`services/search_service.py`)
Keyword and conversational search are **lexical**, not semantic: mistral-embed gives every grant a similar
score for short queries (0.60–0.70), so vector search returned the whole database. A grant matches if it
contains the query terms (prefix match, e.g. "disability" → disabled) or belongs to the canonical sector the
query names ("handicap" → Disability, via `services/taxonomy.py`). Embeddings are only used for AI matching.

### Matching (`services/matching_service.py`)
Candidates are scored in one Mistral call per 10 grants; scores are cached in `match_scores` and recomputed
when the NGO profile changes (`ngos.updated_at`).

### Pipeline Stages
`discovered → saved → preparing → submitted → won / lost`

### Phases Remaining to Implement
- Phase 2: Application readiness checklist, success probability prediction
- Phase 3: Document repository, version history
- Phase 4: Multi-user collaboration, task assignment, notifications
- Phase 5: Learning system (preference model from interaction history)
- Auth: invitations / several users per NGO (today an NGO belongs to the first account that links to it)

---

## Key Files Quick Reference

| Task | File |
|---|---|
| Add/change AI prompts | `backend/services/mistral_service.py` |
| Change DB schema | `backend/models/<model>.py`; new columns on existing tables go in `_COLUMN_MIGRATIONS` (`models/database.py`) |
| Add grant sources | `backend/services/ingestion_service.py` → `DEFAULT_SOURCES` |
| Add a new page | `frontend/src/pages/` + route in `App.jsx` |
| Add an API endpoint | `backend/routers/<domain>.py` |
| Change vector store logic | `backend/services/qdrant_service.py` |
