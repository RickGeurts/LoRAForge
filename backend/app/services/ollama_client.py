"""Ollama HTTP client.

LoRA Forge is local-first; Ollama is the only inference runtime we talk
to. Every call here points at a localhost-style URL (default :11434) and
gracefully falls back to a stubbed response when Ollama isn't running,
so the rest of the app keeps rendering instead of crashing.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_DEFAULT_MODEL = os.environ.get("OLLAMA_DEFAULT_MODEL", "llama3.1:8b")
_REQUEST_TIMEOUT = httpx.Timeout(connect=2.0, read=60.0, write=10.0, pool=10.0)
_FAST_TIMEOUT = httpx.Timeout(connect=1.0, read=3.0, write=2.0, pool=3.0)


@dataclass
class GenerateResult:
    response: str
    model: str
    total_tokens: int
    latency_ms: int
    stub: bool = False


def _format_size(num_bytes: int | None) -> str:
    if not num_bytes:
        return "—"
    gb = num_bytes / (1024**3)
    return f"{gb:.1f}GB"


def _stub_models() -> list[dict[str, Any]]:
    return [
        {"name": "llama3.1:8b", "size": "4.7GB", "family": "llama", "stub": True},
        {"name": "mistral:7b", "size": "4.1GB", "family": "mistral", "stub": True},
    ]


def get_status() -> dict[str, Any]:
    """Probe Ollama. Always returns a dict; never raises."""
    try:
        with httpx.Client(timeout=_FAST_TIMEOUT) as client:
            version_resp = client.get(f"{OLLAMA_BASE_URL}/api/version")
            version_resp.raise_for_status()
            version = version_resp.json().get("version")
            tags_resp = client.get(f"{OLLAMA_BASE_URL}/api/tags")
            tags_resp.raise_for_status()
            models = tags_resp.json().get("models", [])
        return {
            "reachable": True,
            "baseUrl": OLLAMA_BASE_URL,
            "version": version,
            "modelCount": len(models),
        }
    except (httpx.HTTPError, ValueError) as exc:
        return {
            "reachable": False,
            "baseUrl": OLLAMA_BASE_URL,
            "error": type(exc).__name__,
            "stub": True,
        }


def list_models() -> list[dict[str, Any]]:
    """Return installed Ollama models. Falls back to a stub list on error."""
    try:
        with httpx.Client(timeout=_FAST_TIMEOUT) as client:
            resp = client.get(f"{OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError):
        return _stub_models()

    out: list[dict[str, Any]] = []
    for model in data.get("models", []):
        details = model.get("details") or {}
        out.append(
            {
                "name": model.get("name") or "",
                "size": _format_size(model.get("size")),
                "family": details.get("family") or "unknown",
            }
        )
    return out or _stub_models()


def generate(
    prompt: str,
    *,
    model: str | None = None,
    system: str | None = None,
    base_url: str | None = None,
) -> GenerateResult:
    """Run a non-streaming completion against Ollama.

    Returns a GenerateResult; on any error returns a stubbed result so the
    caller can fall back without try/except boilerplate.
    """
    chosen_model = model or OLLAMA_DEFAULT_MODEL
    url = f"{(base_url or OLLAMA_BASE_URL).rstrip('/')}/api/generate"
    payload: dict[str, Any] = {
        "model": chosen_model,
        "prompt": prompt,
        "stream": False,
    }
    if system:
        payload["system"] = system

    started = time.monotonic()
    try:
        with httpx.Client(timeout=_REQUEST_TIMEOUT) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError):
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return GenerateResult(
            response="",
            model=chosen_model,
            total_tokens=0,
            latency_ms=elapsed_ms,
            stub=True,
        )

    elapsed_ms = int((time.monotonic() - started) * 1000)
    total_tokens = int(data.get("eval_count") or 0) + int(
        data.get("prompt_eval_count") or 0
    )
    return GenerateResult(
        response=str(data.get("response") or "").strip(),
        model=str(data.get("model") or chosen_model),
        total_tokens=total_tokens,
        latency_ms=elapsed_ms,
    )
