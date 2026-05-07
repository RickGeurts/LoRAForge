"""Real LoRA fine-tuning via HuggingFace transformers + peft + bitsandbytes.

Heavy ML imports are deferred to function-call time so the FastAPI worker
doesn't pay the cost (and the GPU memory) at boot. Training is synchronous:
the POST /finetune request blocks until training finishes (a few minutes
after the first model download).

Phase 1 scope: produce real LoRA weights on disk and a real training-loss
curve. Inference is still routed through Ollama against the un-tuned base —
that's phase 2.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.models.adapter import Adapter, EvaluationMetrics
from app.models.dataset import Dataset
from app.models.finetune import (
    FineTuneHyperparams,
    FineTuneMetrics,
    FineTuneRun,
    FineTuneStep,
    TrainingPair,
)
from app.models.run import TraceEntry
from app.models.task import Task

ADAPTERS_ROOT = (
    Path(__file__).resolve().parent.parent.parent / "data" / "adapters"
)


def is_supported_base(base_model: str) -> bool:
    """Real training only handles HuggingFace-hostable model ids for now.

    We use 'owner/name' as the cheap heuristic, plus an explicit allow-list
    for the bases we've actually validated. Ollama tags like 'llama3.1:8b'
    fall back to the mock executor.
    """
    if "/" not in base_model:
        return False
    return base_model.lower().startswith("qwen/qwen2.5")


def execute_real_finetune(
    *,
    dataset: Dataset,
    base_model: str,
    adapter_name: str,
    hyperparams: FineTuneHyperparams,
    task: Task | None = None,
    started_at: datetime | None = None,
) -> tuple[FineTuneRun, Adapter]:
    """Run real QLoRA training on a HuggingFace base. Returns (run, adapter).

    Raises ValueError if there isn't enough labelled data to train, and
    propagates any HF/peft/bitsandbytes runtime errors as-is.
    """
    started = started_at or datetime.now(timezone.utc)

    # Reuse the mock executor's materialiser — same shape, same audit-trail
    # field, so reviewers see the same pairs they'd see with the mock.
    from app.services.finetune_executor import _materialise_pairs

    pairs = _materialise_pairs(dataset.rows, task)
    if not pairs:
        raise ValueError(
            "Real training requires at least one labelled row and a task "
            "with a non-empty prompt template. None were materialised."
        )

    adapter_id = f"adp_{uuid.uuid4().hex[:10]}"
    adapter_path = ADAPTERS_ROOT / adapter_id
    adapter_path.mkdir(parents=True, exist_ok=True)

    trace: list[TraceEntry] = []
    cursor = started

    def _emit(stage_id: str, label: str, summary: str, ms: int = 60) -> None:
        nonlocal cursor
        node_started = cursor
        cursor = cursor + timedelta(milliseconds=ms)
        trace.append(
            TraceEntry(
                nodeId=stage_id,
                nodeType=stage_id,
                label=label,
                group="finetune",
                status="ok",
                summary=summary,
                startedAt=node_started,
                finishedAt=cursor,
            )
        )

    # Defer heavy imports until we're actually training.
    import torch
    from datasets import Dataset as HFDataset
    from peft import (
        LoraConfig,
        get_peft_model,
        prepare_model_for_kbit_training,
    )
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        BitsAndBytesConfig,
        DataCollatorForLanguageModeling,
        Trainer,
        TrainerCallback,
        TrainingArguments,
    )

    if not torch.cuda.is_available():
        raise RuntimeError("Real training requires a CUDA GPU.")

    _emit(
        "stage_dataset",
        "Dataset",
        f"Loaded {dataset.row_count} examples from '{dataset.name}'.",
    )
    _emit(
        "stage_pairs",
        "Materialise prompts",
        f"Built {len(pairs)} (prompt, completion) pairs from "
        f"task '{task.id if task else '?'}'.",
    )

    tokenizer = AutoTokenizer.from_pretrained(base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        quantization_config=bnb_config,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )
    model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        r=8,
        lora_alpha=16,
        lora_dropout=0.1,
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    trainable, total = _count_trainable(model)

    _emit(
        "stage_base_model",
        "Base Model",
        f"Loaded {base_model} on {torch.cuda.get_device_name(0)} with 4-bit "
        f"NF4 quantisation. Trainable LoRA params: {trainable:,} / {total:,} "
        f"({100 * trainable / total:.2f}%).",
    )

    # Build training set as ChatML using the tokenizer's template.
    def _format_pair(pair: TrainingPair) -> str:
        messages = [
            {"role": "user", "content": pair.prompt},
            {"role": "assistant", "content": pair.completion},
        ]
        return tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=False
        )

    formatted = [{"text": _format_pair(p)} for p in pairs]
    hf_ds = HFDataset.from_list(formatted)

    def _tokenize(batch):
        out = tokenizer(
            batch["text"],
            padding="max_length",
            truncation=True,
            max_length=512,
        )
        out["labels"] = [list(ids) for ids in out["input_ids"]]
        return out

    tokenized = hf_ds.map(_tokenize, batched=True, remove_columns=["text"])

    losses: list[float] = []

    class _LossCallback(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kwargs):
            if logs and "loss" in logs:
                losses.append(float(logs["loss"]))

    args = TrainingArguments(
        output_dir=str(adapter_path / "training_artifacts"),
        num_train_epochs=hyperparams.epochs,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=max(1, hyperparams.batch_size),
        learning_rate=hyperparams.learning_rate,
        bf16=True,
        logging_steps=1,
        save_strategy="no",
        report_to=[],
        optim="paged_adamw_8bit",
        warmup_ratio=0.03,
        weight_decay=0.01,
        max_grad_norm=1.0,
        disable_tqdm=True,
    )

    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer, mlm=False
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=tokenized,
        data_collator=data_collator,
        callbacks=[_LossCallback()],
    )

    _emit(
        "stage_trainer_start",
        "LoRA Trainer",
        f"Starting QLoRA training: {hyperparams.epochs} epochs, "
        f"effective batch={hyperparams.batch_size}, "
        f"lr={hyperparams.learning_rate}, optim=paged_adamw_8bit.",
    )

    train_result = trainer.train()
    final_loss = float(train_result.training_loss)

    # Save adapter weights to disk under data/adapters/<adapter_id>/.
    model.save_pretrained(str(adapter_path))
    tokenizer.save_pretrained(str(adapter_path))

    _emit(
        "stage_save",
        "Save adapter",
        f"Saved LoRA weights and tokenizer to data/adapters/{adapter_id}/. "
        f"Final training loss: {final_loss:.4f}.",
    )

    history = _step_loss_to_epoch_history(losses, hyperparams.epochs)

    metrics = FineTuneMetrics(
        accuracy=None,
        f1=None,
        evalLoss=round(final_loss, 4),
        notes=(
            "Real QLoRA training on "
            f"{torch.cuda.get_device_name(0)}. accuracy/f1 omitted — too few "
            "validation examples to compute reliably; see the loss curve."
        ),
        history=history,
    )

    _emit(
        "stage_evaluation",
        "Evaluation",
        f"Final training loss {final_loss:.4f} (no held-out eval on "
        f"{dataset.row_count}-row dataset).",
    )

    relative_weights = f"data/adapters/{adapter_id}"
    adapter = Adapter(
        id=adapter_id,
        name=adapter_name,
        baseModel=base_model,
        taskType=dataset.task_type,
        version="0.1.0",
        status="trained",
        trainingDataSummary=(
            f"{dataset.row_count} examples from '{dataset.name}' "
            f"(real QLoRA on {base_model})."
        ),
        evaluationMetrics=EvaluationMetrics(
            notes=f"Final training loss {final_loss:.4f}",
        ),
        weightsPath=relative_weights,
        createdAt=cursor,
    )

    run = FineTuneRun(
        id=f"ft_{uuid.uuid4().hex[:12]}",
        datasetId=dataset.id,
        baseModel=base_model,
        adapterName=adapter_name,
        taskType=dataset.task_type,
        hyperparams=hyperparams,
        status="completed",
        metrics=metrics,
        producedAdapterId=adapter_id,
        trace=trace,
        trainingPairs=pairs,
        startedAt=started,
        finishedAt=cursor,
    )

    # Free GPU memory before returning so the FastAPI worker doesn't keep
    # ~3GB resident between requests.
    del trainer, model, tokenizer
    import gc

    gc.collect()
    torch.cuda.empty_cache()

    return run, adapter


def _count_trainable(model) -> tuple[int, int]:
    trainable = 0
    total = 0
    for param in model.parameters():
        n = param.numel()
        total += n
        if param.requires_grad:
            trainable += n
    return trainable, total


def _step_loss_to_epoch_history(
    losses: list[float], epochs: int
) -> list[FineTuneStep]:
    """Aggregate per-step training losses into per-epoch averages.

    accuracy/f1 in each FineTuneStep are honest placeholders: the chart
    expects the field, but for tiny datasets we can't compute meaningful
    classification metrics, so we leave them at 0.0 and the UI renders
    only the loss curve usefully. (The detail card text already explains.)
    """
    if not losses or epochs <= 0:
        return []
    steps_per_epoch = max(1, len(losses) // epochs)
    history: list[FineTuneStep] = []
    for ep in range(epochs):
        start_idx = ep * steps_per_epoch
        end_idx = (ep + 1) * steps_per_epoch if ep < epochs - 1 else len(losses)
        chunk = losses[start_idx:end_idx] or losses[-1:]
        avg = sum(chunk) / len(chunk)
        history.append(
            FineTuneStep(
                epoch=ep + 1,
                accuracy=0.0,
                f1=0.0,
                evalLoss=round(avg, 4),
            )
        )
    return history
