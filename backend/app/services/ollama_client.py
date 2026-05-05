"""Ollama client stub. Real HTTP calls land in Milestone 6."""
from typing import Any


OLLAMA_BASE_URL = "http://localhost:11434"


async def get_status() -> dict[str, Any]:
    return {"reachable": False, "baseUrl": OLLAMA_BASE_URL, "stub": True}


async def list_models() -> list[dict[str, Any]]:
    return [
        {
            "name": "llama3.1:8b",
            "size": "4.7GB",
            "family": "llama",
            "stub": True,
        },
        {
            "name": "mistral:7b",
            "size": "4.1GB",
            "family": "mistral",
            "stub": True,
        },
    ]
