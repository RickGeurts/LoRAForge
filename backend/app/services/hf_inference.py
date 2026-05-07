"""HuggingFace inference path for AI nodes bound to a trained LoRA adapter.

Loads the base model with bitsandbytes 4-bit quantisation and applies the
LoRA via peft. Loaded (tokenizer, model) tuples are cached in a module-
level dict keyed by (base_model, adapter_path) so the second inference
call on the same combination is fast — first call pays a 10-30s load
penalty, subsequent calls run in 1-3s on a 5070 Ti.

This is phase 2 of the user-definable adapters plan: workflow runs that
hit an AI node bound to a real LoRA adapter now go through here instead
of Ollama.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any

# Adapter weights paths in the registry are stored relative to the
# backend root (e.g. "data/adapters/adp_xxxx"). Resolve to absolute via
# this anchor so the executor can be called from any CWD.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent

_AI_SYSTEM_PROMPT = (
    "You are a regulatory analysis assistant for bank resolution workflows. "
    "Be concise and factual. Reply in 1-2 short sentences. Do not speculate."
)


@dataclass
class HfInferenceResult:
    response: str
    model: str
    total_tokens: int | None
    latency_ms: int | None
    error: str | None = None


_loaded: dict[tuple[str, str], tuple[Any, Any]] = {}
_lock = Lock()


def has_local_weights(weights_path: str | None) -> bool:
    """True if the adapter dir exists on disk and looks loadable."""
    if not weights_path:
        return False
    abs_path = _resolve(weights_path)
    return (abs_path / "adapter_config.json").is_file()


def _resolve(weights_path: str) -> Path:
    p = Path(weights_path)
    if p.is_absolute():
        return p
    return _BACKEND_ROOT / weights_path


def generate(
    *,
    prompt: str,
    base_model: str,
    weights_path: str,
    system: str | None = None,
    max_new_tokens: int = 200,
) -> HfInferenceResult:
    """Run inference against base_model + LoRA from weights_path.

    Errors (model load, generation) come back in `error` so the caller can
    fall back to a mock summary instead of crashing the workflow run.
    """
    abs_path = _resolve(weights_path)
    if not (abs_path / "adapter_config.json").is_file():
        return HfInferenceResult(
            response="",
            model="",
            total_tokens=None,
            latency_ms=None,
            error=f"adapter dir missing: {weights_path}",
        )

    try:
        tokenizer, model = _ensure_loaded(base_model, abs_path)
    except Exception as exc:  # noqa: BLE001 — surface whatever load broke
        return HfInferenceResult(
            response="",
            model=base_model,
            total_tokens=None,
            latency_ms=None,
            error=f"load failed: {exc!s}",
        )

    import torch

    messages = [
        {"role": "system", "content": system or _AI_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    chat_text = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = tokenizer(chat_text, return_tensors="pt").to(model.device)

    started = time.monotonic()
    try:
        with torch.no_grad():
            output = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id,
            )
    except Exception as exc:  # noqa: BLE001
        return HfInferenceResult(
            response="",
            model=f"{base_model}+{abs_path.name}",
            total_tokens=None,
            latency_ms=int((time.monotonic() - started) * 1000),
            error=f"generation failed: {exc!s}",
        )
    elapsed_ms = int((time.monotonic() - started) * 1000)

    # output[0] includes the prompt tokens; slice them off so the response
    # is just the assistant's reply.
    prompt_len = inputs["input_ids"].shape[-1]
    new_tokens = output[0, prompt_len:]
    response = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

    return HfInferenceResult(
        response=response,
        model=f"{base_model}+{abs_path.name}",
        total_tokens=int(output.shape[-1]),
        latency_ms=elapsed_ms,
    )


def _ensure_loaded(base_model: str, abs_adapter_path: Path) -> tuple[Any, Any]:
    """Load (and cache) the base model + LoRA. Thread-safe."""
    key = (base_model, str(abs_adapter_path))
    with _lock:
        if key in _loaded:
            return _loaded[key]

        import torch
        from peft import PeftModel
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
        )

        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )
        base = AutoModelForCausalLM.from_pretrained(
            base_model,
            quantization_config=bnb_config,
            device_map="auto",
            torch_dtype=torch.bfloat16,
        )
        model = PeftModel.from_pretrained(base, str(abs_adapter_path))
        model.eval()

        tokenizer = AutoTokenizer.from_pretrained(str(abs_adapter_path))
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        _loaded[key] = (tokenizer, model)
        return _loaded[key]


def evict(base_model: str, weights_path: str) -> None:
    """Drop a cached model from memory. Useful if the adapter is deleted."""
    abs_path = _resolve(weights_path)
    key = (base_model, str(abs_path))
    with _lock:
        if key in _loaded:
            del _loaded[key]
            import gc

            import torch

            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
