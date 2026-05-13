# LoRA Forge — Frontend

Next.js 16 + React 19 + Tailwind v4 UI for LoRA Forge. Visual workflow builder (React Flow), adapter registry, dataset viewer, tasks registry, fine-tune jobs with live progress, and run history with audit trails.

See the root [`README.md`](../README.md) for the product context.

## Setup

```powershell
cd frontend
npm install        # first time only
npm run dev
```

App at http://localhost:3000.

## Backend wiring

Pages call the FastAPI backend at `http://127.0.0.1:8001` by default. Override with:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8001"
```

If the backend is down the pages degrade gracefully with an inline notice.

## Pages

- `/` — Dashboard
- `/templates` — Workflow templates
- `/workflows`, `/workflows/[id]` — Workflow list + visual editor (React Flow)
- `/adapters` — Adapter registry (with delete)
- `/datasets`, `/datasets/[id]` — Datasets + row inspection
- `/tasks`, `/tasks/new`, `/tasks/[id]`, `/tasks/[id]/edit` — Task registry CRUD
- `/finetune`, `/finetune/[id]` — Fine-tune jobs with live progress bar + ETA
- `/runs`, `/runs/[id]` — Run history + per-node trace
- `/settings` — Ollama status, base URL, available models

## Notes for agents

This is **Next.js 16** with **React 19** and **Tailwind v4** — read [`AGENTS.md`](./AGENTS.md) and the bundled docs in `node_modules/next/dist/docs/` before changing routing, server components, or styling. APIs differ from older Next versions.