# LoRA Forge

Local-first web application for designing, testing, and auditing **regulatory AI workflows** built around modular LoRA adapters and local LLM runtimes (Ollama).

LoRA Forge is **not a chatbot** — it's a visual, auditable, workflow-driven AI system for regulated decision support. Primary domain: bank resolution (Internal Resolution Team workflows — MREL eligibility, prospectus clause extraction, instrument classification).

See [`CLAUDE.md`](./CLAUDE.md) for the full product vision, principles, and milestones.

## Repo layout

```
LoRAForge/
├── backend/        FastAPI service (mock data; Ollama integration in milestone 6)
├── frontend/       Next.js 16 + React 19 + Tailwind v4
├── CLAUDE.md       Product vision and architecture
└── README.md       This file
```

## Prerequisites

- **Python 3.13** (the project ships with a `.venv` at the root)
- **Node.js 20+** with npm

## Run the backend

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
cd backend
uvicorn app.main:app --reload --port 8000
```

OpenAPI docs at http://localhost:8000/docs.

## Run the frontend

In a second terminal:

```powershell
cd frontend
npm install      # first time only
npm run dev
```

App at http://localhost:3000. The dashboard, workflows, adapters, runs, and settings pages all hit the FastAPI backend; if the backend is down they degrade gracefully with an inline notice.

## What's stubbed vs real (milestone 1)

| Feature | State |
| --- | --- |
| Backend boot, CORS, routers | ✅ real |
| `/adapters`, `/workflows`, `/runs` | mock data, no persistence |
| `/ollama/status`, `/ollama/models` | stub responses |
| Frontend nav, layout, pages | ✅ real |
| React Flow canvas | installed, not wired (milestone 4) |
| Mock execution | milestone 5 |
| Real Ollama calls | milestone 6 |

## Roadmap

Milestones from `CLAUDE.md`:

1. ✅ **Setup** — scaffolding (this commit)
2. **Models** — pydantic schemas + persistence
3. **Dashboard** — populated with real registry/run state
4. **Workflow builder** — React Flow canvas with constrained validation
5. **Mock execution** — node-by-node mock runs producing audit trails
6. **Ollama integration** — real local LLM calls

## License

TBD.
