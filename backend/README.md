# LoRA Forge — Backend

FastAPI service. Returns mock data for now; real Ollama integration and persistent storage come in later milestones.

## Setup

From the **project root** (the `.venv` lives there):

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

## Run

```powershell
cd backend
uvicorn app.main:app --reload --port 8001
```

Open http://127.0.0.1:8001/docs for the OpenAPI UI.

> **Port 8001, not 8000** — port 8000 is reserved on this machine for the
> LabelLex project. Using `127.0.0.1` (not `localhost`) avoids Windows
> IPv6/IPv4 resolution issues with Node 18+.

## Endpoints (stubbed)

- `GET /adapters` — list adapters in the registry
- `GET /workflows` — list workflows / templates
- `GET /runs` — list workflow runs
- `GET /ollama/status` — Ollama daemon reachability
- `GET /ollama/models` — locally pulled models

## Layout

```
backend/
├── app/
│   ├── main.py          # FastAPI app, CORS, router includes
│   ├── routers/         # one file per domain
│   ├── models/          # pydantic schemas
│   └── services/        # ollama_client (stub)
└── requirements.txt
```
