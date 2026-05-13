# LoRA Forge — Backend

FastAPI service backing the LoRA Forge UI. SQLModel persistence (SQLite), real Ollama integration with stub fallback, and real QLoRA fine-tuning via Hugging Face + PEFT.

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

## Environment

- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `OLLAMA_DEFAULT_MODEL` (default `llama3.1:8b`)

If Ollama isn't reachable, calls return deterministic stub results so the app keeps rendering.

## Endpoints

- `GET/POST/DELETE /tasks` — Task registry (prompts, expected fields, etc.)
- `GET/POST/DELETE /adapters` — Adapter registry
- `GET /datasets`, `GET /datasets/{id}` — Datasets + row inspection
- `GET/POST /workflows` — Workflow definitions
- `GET /templates` — Workflow templates
- `GET/POST/DELETE /runs` — Workflow runs with full audit trail
- `POST /finetune`, `GET /finetune/{id}` — Real QLoRA fine-tune jobs with live progress and per-epoch accuracy/F1
- `GET /ollama/status` — Ollama daemon reachability (real probe)
- `GET /ollama/models` — Locally pulled Ollama models (real `/api/tags`)

## Layout

```
backend/
├── app/
│   ├── main.py                       # FastAPI app, CORS, router includes, lifespan seed
│   ├── db.py                         # SQLModel engine + init
│   ├── routers/                      # one file per domain
│   ├── models/                       # SQLModel + pydantic schemas
│   └── services/
│       ├── ollama_client.py          # real httpx client with stub fallback
│       ├── hf_inference.py           # HF + LoRA inference for adapter-bound nodes
│       ├── executor.py               # workflow executor (Ollama-backed AI nodes)
│       ├── real_finetune.py          # QLoRA training loop
│       ├── finetune_executor.py      # job runner + progress streaming
│       ├── mrel_clauses_dataset.py   # 200-row seed dataset
│       ├── templates.py              # seed workflow templates
│       └── seed.py                   # lifespan-time seeding
└── requirements.txt
```