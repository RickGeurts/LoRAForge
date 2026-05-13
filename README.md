# LoRA Forge

Local-first web application for designing, testing, and auditing **regulatory AI workflows** built around modular LoRA adapters and local LLM runtimes (Ollama).

LoRA Forge is **not a chatbot** — it's a visual, auditable, workflow-driven AI system for regulated decision support. Primary domain: bank resolution (Internal Resolution Team workflows — MREL eligibility, prospectus clause extraction, instrument classification).

See [`CLAUDE.md`](./CLAUDE.md) for the full product vision, principles, and milestones.

## Repo layout

```
LoRAForge/
├── backend/        FastAPI service (SQLModel persistence, real Ollama + QLoRA)
├── frontend/       Next.js 16 + React 19 + Tailwind v4
├── CLAUDE.md       Product vision and architecture
└── README.md       This file
```

## Prerequisites

- **Python 3.13** (the project ships with a `.venv` at the root)
- **Node.js 20+** with npm
- **Ollama** running locally (optional — the app degrades to deterministic stubs when it's unreachable)

## Run the backend

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
cd backend
uvicorn app.main:app --reload --port 8001
```

OpenAPI docs at http://127.0.0.1:8001/docs. **Port 8001 (not 8000)** — port 8000 is reserved for LabelLex on this machine.

Optional environment variables:

- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `OLLAMA_DEFAULT_MODEL` (default `llama3.1:8b`)

## Run the frontend

In a second terminal:

```powershell
cd frontend
npm install      # first time only
npm run dev
```

App at http://localhost:3000. Pages hit the FastAPI backend at `http://127.0.0.1:8001` (override with `NEXT_PUBLIC_API_BASE_URL`); if the backend is down they degrade gracefully with an inline notice.

## What's shipped

| Area | State |
| --- | --- |
| Backend boot, CORS, routers | ✅ real |
| SQLModel persistence + lifespan seed | ✅ real |
| `/adapters`, `/workflows`, `/runs`, `/templates` | ✅ real, persisted, delete supported |
| `/datasets` + dataset viewer (one seeded MREL dataset, 200 rows) | ✅ real |
| `/tasks` registry + CRUD UI | ✅ real |
| `/ollama/status`, `/ollama/models` | ✅ real httpx calls, stub fallback when Ollama is down |
| Workflow execution | ✅ real — AI nodes call Ollama; downstream nodes consume upstream output; decision derived from AI verdict |
| `/finetune` — real QLoRA fine-tuning with live progress + ETA | ✅ real |
| Adapter-bound AI nodes routed through HF + LoRA when weights exist | ✅ real |
| Audit trail with per-epoch accuracy/F1 on held-out validation split | ✅ real |
| React Flow workflow editor | ✅ real |

## License

TBD.