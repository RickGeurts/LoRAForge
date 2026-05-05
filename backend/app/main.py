from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import adapters, ollama, runs, workflows

app = FastAPI(
    title="LoRA Forge API",
    description="Local-first regulatory AI workflow backend",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(adapters.router)
app.include_router(workflows.router)
app.include_router(runs.router)
app.include_router(ollama.router)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "lora-forge", "status": "ok"}
