from typing import Any

from fastapi import APIRouter

from app.services import ollama_client

router = APIRouter(prefix="/ollama", tags=["ollama"])


@router.get("/status")
def status() -> dict[str, Any]:
    return ollama_client.get_status()


@router.get("/models")
def models() -> list[dict[str, Any]]:
    return ollama_client.list_models()
