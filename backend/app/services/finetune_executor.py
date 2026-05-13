"""Mock fine-tune executor.

Walks the canonical Dataset → Preprocess → Base Model → LoRA Trainer →
Evaluation pipeline, emits a TraceEntry per stage, and produces an
Adapter row tagged status="trained". Real LoRA training is explicitly
out of scope for the MVP (CLAUDE.md non-goal); this fills in the
audit/governance surfaces with realistic-shaped data.

Determinism: metrics are hashed off (dataset content, dataset_id, base_model,
adapter_name, hyperparams) so the same config always yields the same numbers
— and editing the dataset's rows shifts the metrics, which is what reviewers
actually want to see.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

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


class _PermissiveInputs(dict):
    """format_map dict that returns "" for missing keys.

    Same shape as in services/executor.py — duplicated here to avoid an
    import cycle and because the two callers are likely to drift over time.
    """

    def __missing__(self, key: str) -> str:  # type: ignore[override]
        return ""


@dataclass
class MaterialisationResult:
    pairs: list[TrainingPair]
    total_rows: int
    skipped_missing_label: int = 0
    skipped_unknown_label: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.skipped_unknown_label is None:
            self.skipped_unknown_label = []

    @property
    def skipped(self) -> int:
        return self.skipped_missing_label + len(self.skipped_unknown_label)

    def summary(self) -> str:
        if self.total_rows == 0:
            return "no rows in dataset"
        parts = [f"{len(self.pairs)}/{self.total_rows} pairs accepted"]
        if self.skipped_missing_label:
            parts.append(f"{self.skipped_missing_label} missing label")
        if self.skipped_unknown_label:
            offenders = ", ".join(sorted(set(self.skipped_unknown_label))[:3])
            parts.append(
                f"{len(self.skipped_unknown_label)} unknown label "
                f"(e.g. {offenders})"
            )
        return "; ".join(parts)


def materialise(
    dataset: Dataset, task: Task | None
) -> MaterialisationResult:
    """Build (prompt, completion) pairs from a dataset against a task.

    Column-mapping comes from the dataset (label_column, text_column,
    rationale_column). For classifier tasks with a non-empty label set,
    rows whose label isn't in task.labels are skipped and reported.
    """
    rows = dataset.rows
    if task is None or not task.prompt_template:
        return MaterialisationResult(pairs=[], total_rows=len(rows))

    label_col = dataset.label_column or "label"
    text_col = dataset.text_column or "excerpt"
    rationale_col = dataset.rationale_column
    allowed = (
        {l.strip() for l in task.labels if l and l.strip()}
        if task.kind == "classifier" and task.labels
        else None
    )

    out: list[TrainingPair] = []
    skipped_missing = 0
    skipped_unknown: list[str] = []
    for row in rows:
        format_inputs = _PermissiveInputs(row)
        format_inputs.setdefault("document", str(row.get(text_col) or ""))
        prompt = task.prompt_template.format_map(format_inputs)
        label_raw = row.get(label_col)
        if not isinstance(label_raw, str) or not label_raw.strip():
            skipped_missing += 1
            continue
        label = label_raw.strip()
        if allowed is not None and label not in allowed:
            skipped_unknown.append(label)
            continue
        rationale = ""
        if rationale_col:
            rationale_raw = row.get(rationale_col)
            if isinstance(rationale_raw, str):
                rationale = rationale_raw
        completion = f"{label} — {rationale}".rstrip(" —")
        out.append(
            TrainingPair(
                rowId=row.get("rowId") if isinstance(row.get("rowId"), str) else None,
                prompt=prompt,
                completion=completion,
            )
        )
    return MaterialisationResult(
        pairs=out,
        total_rows=len(rows),
        skipped_missing_label=skipped_missing,
        skipped_unknown_label=skipped_unknown,
    )


# Backwards-compatible thin wrapper. The mock execution path here still
# calls this; real_finetune.py now uses materialise() directly.
def _materialise_pairs(
    rows: list[dict[str, Any]], task: Task | None
) -> list[TrainingPair]:
    """Legacy shape — uses the default column convention. Avoid in new code."""
    shim = Dataset(
        id="__shim",
        name="",
        taskType=task.id if task else "other",
        sourceType="mock",
        summary="",
        rowCount=len(rows),
        rows=rows,
        createdAt=datetime.now(timezone.utc),
    )
    return materialise(shim, task).pairs

_STAGE_BASE_MS = 60
_VAL_SPLIT_RATIO = 0.1


def _split_sizes(row_count: int) -> tuple[int, int]:
    """Return (train_size, val_size) for a 90/10 split, val ≥ 1 when rows ≥ 1."""
    if row_count <= 0:
        return 0, 0
    val = max(1, int(row_count * _VAL_SPLIT_RATIO))
    return row_count - val, val


def _label_distribution(rows: list[dict[str, Any]]) -> Counter[str] | None:
    """Count rows by their `label` field. Returns None if no rows have a label."""
    counts: Counter[str] = Counter()
    for r in rows:
        label = r.get("label")
        if isinstance(label, str):
            counts[label] += 1
    return counts if counts else None


def _dataset_fingerprint(dataset: Dataset) -> str:
    """Stable hash over the dataset's row content for the metrics seed."""
    if not dataset.rows:
        return f"empty:{dataset.row_count}"
    payload = json.dumps(dataset.rows, sort_keys=True, default=str).encode()
    return hashlib.sha256(payload).hexdigest()[:16]


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
        summary_template="Loaded dataset '{dataset_name}' ({row_count} examples, {source_type}).{label_note}",
    ),
    _Stage(
        node_id="stage_preprocess",
        node_type="preprocess",
        label="Preprocess",
        summary_template="Tokenised {row_count} examples; train/val split {train_size}/{val_size}; max_seq_len 1024.",
    ),
    _Stage(
        node_id="stage_materialise",
        node_type="materialise_pairs",
        label="Materialise prompts",
        summary_template="{pair_summary}",
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
        summary_template="Evaluated on {val_size} validation example(s): accuracy={accuracy:.2f}, f1={f1:.2f}, eval_loss={eval_loss:.3f}.",
    ),
]


def _epoch_curve(
    final: float, *, start: float, epochs: int, digest: bytes, offset: int
) -> list[float]:
    """Smooth exponential approach from start to final over `epochs` steps,
    perturbed deterministically from `digest[offset:]`.
    """
    if epochs <= 0:
        return []
    out: list[float] = []
    for i in range(epochs):
        t = (i + 1) / epochs
        # Exponential approach — typical of training curves.
        base = start + (final - start) * (1 - 2.71828 ** (-3 * t))
        # Small per-epoch wiggle so the curve doesn't look algebraic.
        noise_byte = digest[(offset + i) % len(digest)]
        noise = (noise_byte / 255 - 0.5) * 0.025
        out.append(base + noise)
    # Always pin the last point to the final headline value so the chart
    # matches the metrics card.
    if out:
        out[-1] = final
    return out


def _deterministic_metrics(seed: str, epochs: int) -> FineTuneMetrics:
    digest = hashlib.sha256(seed.encode()).digest()
    # Map first three bytes into plausible final ranges.
    accuracy = 0.78 + (digest[0] / 255) * 0.18  # 0.78–0.96
    f1 = max(0.65, accuracy - 0.04 - (digest[1] / 255) * 0.05)
    eval_loss = 0.18 + (digest[2] / 255) * 0.32  # 0.18–0.50

    accuracy_curve = _epoch_curve(
        accuracy, start=0.5, epochs=epochs, digest=digest, offset=4
    )
    f1_curve = _epoch_curve(
        f1, start=0.45, epochs=epochs, digest=digest, offset=12
    )
    loss_curve = _epoch_curve(
        eval_loss, start=1.5, epochs=epochs, digest=digest, offset=20
    )
    history = [
        FineTuneStep(
            epoch=i + 1,
            accuracy=round(max(0.0, min(1.0, accuracy_curve[i])), 3),
            f1=round(max(0.0, min(1.0, f1_curve[i])), 3),
            evalLoss=round(max(0.0, loss_curve[i]), 3),
        )
        for i in range(epochs)
    ]

    return FineTuneMetrics(
        accuracy=round(accuracy, 3),
        f1=round(f1, 3),
        evalLoss=round(eval_loss, 3),
        notes="Mock run — no real training was performed.",
        history=history,
    )


def execute_finetune(
    *,
    dataset: Dataset,
    base_model: str,
    adapter_name: str,
    hyperparams: FineTuneHyperparams,
    task: Task | None = None,
    started_at: datetime | None = None,
) -> tuple[FineTuneRun, Adapter]:
    """Run the mocked fine-tune pipeline. Returns (run, produced_adapter).

    `task` is the Task this dataset trains for. When provided, the executor
    materialises one (prompt, completion) pair per labelled row using the
    task's prompt_template and stashes them on the run for the audit trail.
    """
    started = started_at or datetime.now(timezone.utc)
    seed = "|".join(
        [
            dataset.id,
            _dataset_fingerprint(dataset),
            base_model,
            adapter_name,
            str(hyperparams.epochs),
            f"{hyperparams.learning_rate:.6f}",
            str(hyperparams.batch_size),
        ]
    )
    metrics = _deterministic_metrics(seed, hyperparams.epochs)

    train_size, val_size = _split_sizes(dataset.row_count)
    label_dist = _label_distribution(dataset.rows)
    label_note = (
        " Labels: " + ", ".join(f"{n} {label}" for label, n in label_dist.most_common())
        if label_dist
        else ""
    )
    mat = materialise(dataset, task)
    training_pairs = mat.pairs
    if training_pairs:
        pair_summary = (
            f"Materialised {len(training_pairs)} pairs from task "
            f"'{task.id if task else '?'}'.prompt_template + dataset rows ("
            + mat.summary()
            + ")."
        )
    elif task is None:
        pair_summary = (
            "No task resolved for this dataset's task type — skipped prompt "
            "materialisation."
        )
    elif not task.prompt_template:
        pair_summary = (
            f"Task '{task.id}' has no prompt template — skipped prompt "
            "materialisation. (Edit the task to add one.)"
        )
    else:
        pair_summary = (
            f"No usable rows ({mat.summary()}) — check dataset column mapping "
            "and that label values match the task's declared labels."
        )

    context = {
        "dataset_name": dataset.name,
        "row_count": dataset.row_count,
        "source_type": dataset.source_type,
        "label_note": label_note,
        "train_size": train_size,
        "val_size": val_size,
        "base_model": base_model,
        "epochs": hyperparams.epochs,
        "learning_rate": hyperparams.learning_rate,
        "batch_size": hyperparams.batch_size,
        "accuracy": metrics.accuracy or 0.0,
        "f1": metrics.f1 or 0.0,
        "eval_loss": metrics.eval_loss or 0.0,
        "pair_summary": pair_summary,
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
            + (
                " Label distribution: "
                + ", ".join(f"{n} {label}" for label, n in label_dist.most_common())
                + "."
                if label_dist
                else ""
            )
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
        trainingPairs=training_pairs,
        startedAt=started,
        finishedAt=cursor,
    )
    return run, adapter
