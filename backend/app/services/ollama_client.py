"""Ollama HTTP client.

LoRA Forge is local-first; Ollama is the only inference runtime we talk
to. Every call here points at a localhost-style URL (default :11434) and
gracefully falls back to a stubbed response when Ollama isn't running,
so the rest of the app keeps rendering instead of crashing.
"""
from __future__ import annotations

import math
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


@dataclass
class ScoreResult:
    verdict: str
    confidence: float
    probs: dict[str, float]
    model: str
    latency_ms: int
    error: str | None = None


def score_verdict(
    prompt: str,
    candidates: list[str],
    *,
    model: str | None = None,
    base_url: str | None = None,
) -> ScoreResult | None:
    """Probe the model for token-level confidence over candidate verdicts.

    Uses the OpenAI-compatible chat-completions endpoint with logprobs
    enabled and a single-token max so the model emits exactly one verdict
    word. Returns a ScoreResult with softmax probabilities over the
    candidates, or None if logprobs aren't available from this Ollama
    build / model.

    Token matching is normalised (lowercase, leading whitespace stripped,
    underscores ignored) and prefix-based, since tokenisers split words
    like "eligible" into subword pieces that vary across models.
    """
    if not candidates:
        return None
    chosen_model = model or OLLAMA_DEFAULT_MODEL
    url = f"{(base_url or OLLAMA_BASE_URL).rstrip('/')}/v1/chat/completions"
    payload: dict[str, Any] = {
        "model": chosen_model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1,
        "temperature": 0,
        "logprobs": True,
        "top_logprobs": 20,
    }
    started = time.monotonic()
    try:
        with httpx.Client(timeout=_REQUEST_TIMEOUT) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        return ScoreResult(
            verdict="",
            confidence=0.0,
            probs={},
            model=chosen_model,
            latency_ms=int((time.monotonic() - started) * 1000),
            error=type(exc).__name__,
        )

    elapsed_ms = int((time.monotonic() - started) * 1000)
    try:
        content = data["choices"][0]["logprobs"]["content"]
        if not content:
            return ScoreResult(
                verdict="",
                confidence=0.0,
                probs={},
                model=chosen_model,
                latency_ms=elapsed_ms,
                error="empty_logprobs",
            )
        top_logprobs = content[0]["top_logprobs"]
    except (KeyError, IndexError, TypeError):
        return ScoreResult(
            verdict="",
            confidence=0.0,
            probs={},
            model=chosen_model,
            latency_ms=elapsed_ms,
            error="logprobs_not_supported",
        )

    def _norm(s: str) -> str:
        return s.strip().lower().lstrip("_").lstrip("-").strip()

    candidate_logprobs: dict[str, float] = {}
    for candidate in candidates:
        c_norm = _norm(candidate)[:3]
        if not c_norm:
            continue
        best_lp: float | None = None
        for tlp in top_logprobs:
            tok = _norm(str(tlp.get("token", "")))
            if tok.startswith(c_norm):
                lp = float(tlp.get("logprob", -math.inf))
                if best_lp is None or lp > best_lp:
                    best_lp = lp
        if best_lp is not None:
            candidate_logprobs[candidate] = best_lp

    if not candidate_logprobs:
        return ScoreResult(
            verdict="",
            confidence=0.0,
            probs={},
            model=chosen_model,
            latency_ms=elapsed_ms,
            error="no_candidate_in_top_logprobs",
        )

    # Numerically stable softmax over matched candidates.
    max_lp = max(candidate_logprobs.values())
    exps = {k: math.exp(v - max_lp) for k, v in candidate_logprobs.items()}
    total = sum(exps.values())
    probs = {k: round(exps[k] / total, 4) for k in exps}
    verdict = max(probs, key=lambda k: probs[k])
    return ScoreResult(
        verdict=verdict,
        confidence=probs[verdict],
        probs=probs,
        model=chosen_model,
        latency_ms=elapsed_ms,
        error=None,
    )
