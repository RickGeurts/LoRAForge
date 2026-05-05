"""Mock fine-tune executor.

Walks the canonical Dataset → Preprocess → Base Model → LoRA Trainer →
Evaluation pipeline, emits a TraceEntry per stage, and produces an
Adapter row tagged status="trained". Real LoRA training is explicitly
out of scope for the MVP (CLAUDE.md non-goal); this fills in the
audit/governance surfaces with realistic-shaped data.

Determinism: metrics are hashed off (dataset_id, base_model, adapter_name,
hyperparams) so the same config always yields the same numbers — handy
for review and regression-spotting.
"""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.models.adapter import Adapter, EvaluationMetrics
from app.models.dataset import Dataset
from app.models.finetune import (
    FineTuneHyperparams,
    FineTuneMetrics,
    FineTuneRun,
)
from app.models.run import TraceEntry

_STAGE_BASE_MS = 60


@dataclass
class _Stage:
    node_id: str
    node_type: str
    label: str
    summary_template: str


_STAGES: list[_Stage] = [
    _Stage(
        node_id="stage_dataset",
        node_type="dataset_load",
        label="Dataset",
        summary_template="Loaded dataset '{dataset_name}' ({row_count} examples, {source_type}).",
    ),
    _Stage(
        node_id="stage_preprocess",
        node_type="preprocess",
        label="Preprocess",
        summary_template="Tokenised {row_count} examples; train/val split 90/10; max_seq_len 1024.",
    ),
    _Stage(
        node_id="stage_base_model",
        node_type="base_model",
        label="Base Model",
        summary_template="Loaded base model {base_model}; froze backbone weights.",
    ),
    _Stage(
        node_id="stage_trainer",
        node_type="lora_trainer",
        label="LoRA Trainer",
        summary_template="Trained {epochs} epochs at lr={learning_rate}, batch={batch_size} (mock).",
    ),
    _Stage(
        node_id="stage_evaluation",
        node_type="evaluation",
        label="Evaluation",
        summary_template="Evaluated on validation split: accuracy={accuracy:.2f}, f1={f1:.2f}, eval_loss={eval_loss:.3f}.",
    ),
]


def _deterministic_metrics(seed: str) -> FineTuneMetrics:
    digest = hashlib.sha256(seed.encode()).digest()
    # Map first three bytes into plausible ranges.
    accuracy = 0.78 + (digest[0] / 255) * 0.18  # 0.78–0.96
    f1 = max(0.65, accuracy - 0.04 - (digest[1] / 255) * 0.05)
    eval_loss = 0.18 + (digest[2] / 255) * 0.32  # 0.18–0.50
    return FineTuneMetrics(
        accuracy=round(accuracy, 3),
        f1=round(f1, 3),
        evalLoss=round(eval_loss, 3),
        notes="Mock run — no real training was performed.",
    )


def execute_finetune(
    *,
    dataset: Dataset,
    base_model: str,
    adapter_name: str,
    hyperparams: FineTuneHyperparams,
    started_at: datetime | None = None,
) -> tuple[FineTuneRun, Adapter]:
    """Run the mocked fine-tune pipeline. Returns (run, produced_adapter)."""
    started = started_at or datetime.now(timezone.utc)
    seed = "|".join(
        [
            dataset.id,
            base_model,
            adapter_name,
            str(hyperparams.epochs),
            f"{hyperparams.learning_rate:.6f}",
            str(hyperparams.batch_size),
        ]
    )
    metrics = _deterministic_metrics(seed)

    context = {
        "dataset_name": dataset.name,
        "row_count": dataset.row_count,
        "source_type": dataset.source_type,
        "base_model": base_model,
        "epochs": hyperparams.epochs,
        "learning_rate": hyperparams.learning_rate,
        "batch_size": hyperparams.batch_size,
        "accuracy": metrics.accuracy or 0.0,
        "f1": metrics.f1 or 0.0,
        "eval_loss": metrics.eval_loss or 0.0,
    }

    trace: list[TraceEntry] = []
    cursor = started
    for stage in _STAGES:
        node_started = cursor
        cursor = cursor + timedelta(milliseconds=_STAGE_BASE_MS)
        trace.append(
            TraceEntry(
                nodeId=stage.node_id,
                nodeType=stage.node_type,
                label=stage.label,
                group="finetune",
                status="ok",
                summary=stage.summary_template.format(**context),
                startedAt=node_started,
                finishedAt=cursor,
            )
        )

    adapter_id = f"adp_{uuid.uuid4().hex[:10]}"
    adapter = Adapter(
        id=adapter_id,
        name=adapter_name,
        baseModel=base_model,
        taskType=dataset.task_type,
        version="0.1.0",
        status="trained",
        trainingDataSummary=(
            f"{dataset.row_count} examples from '{dataset.name}' ({dataset.source_type})."
        ),
        evaluationMetrics=EvaluationMetrics(
            accuracy=metrics.accuracy,
            f1=metrics.f1,
            notes=metrics.notes,
        ),
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
        startedAt=started,
        finishedAt=cursor,
    )
    return run, adapter
