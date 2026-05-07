from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.db import engine, init_db
from app.routers import adapters, datasets, finetune, ollama, runs, templates, workflows
from app.services.seed import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with Session(engine) as session:
        seed_if_empty(session)
    yield


app = FastAPI(
    title="LoRA Forge API",
    description="Local-first regulatory AI workflow backend",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(adapters.router)
app.include_router(datasets.router)
app.include_router(workflows.router)
app.include_router(templates.router)
app.include_router(runs.router)
app.include_router(finetune.router)
app.include_router(ollama.router)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "lora-forge", "status": "ok"}
