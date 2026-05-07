"""Fine-tune routes.

POST /finetune kicks off training in a background thread and returns the
queued FineTuneRun row immediately. The thread writes progress updates to
the same row while training runs, so the frontend can poll /finetune for
live status. Mock training stays synchronous because it's instant.
"""
import threading
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import engine, get_session
from app.models.adapter import AdapterTable
from app.models.dataset import DatasetTable
from app.models.finetune import (
    FineTuneHyperparams,
    FineTuneRun,
    FineTuneRunCreate,
    FineTuneRunTable,
)
from app.models.task import TaskTable
from app.services.finetune_executor import execute_finetune
from app.services.real_finetune import (
    execute_real_finetune,
    is_supported_base,
)

router = APIRouter(prefix="/finetune", tags=["finetune"])


@router.get("", response_model=list[FineTuneRun], response_model_by_alias=True)
def list_finetune_runs(session: Session = Depends(get_session)) -> list[FineTuneRun]:
    rows = session.exec(select(FineTuneRunTable)).all()
    return [row.to_api() for row in rows]


@router.get("/{run_id}", response_model=FineTuneRun, response_model_by_alias=True)
def get_finetune_run(
    run_id: str, session: Session = Depends(get_session)
) -> FineTuneRun:
    row = session.get(FineTuneRunTable, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Fine-tune run not found")
    return row.to_api()


@router.post(
    "",
    response_model=FineTuneRun,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_finetune_run(
    payload: FineTuneRunCreate, session: Session = Depends(get_session)
) -> FineTuneRun:
    dataset_row = session.get(DatasetTable, payload.dataset_id)
    if dataset_row is None:
        raise HTTPException(
            status_code=404, detail=f"Dataset {payload.dataset_id} not found"
        )

    run_id = f"ft_{uuid.uuid4().hex[:12]}"
    started = datetime.now(timezone.utc)
    placeholder = FineTuneRun(
        id=run_id,
        datasetId=payload.dataset_id,
        baseModel=payload.base_model,
        adapterName=payload.adapter_name,
        taskType=dataset_row.task_type,
        hyperparams=payload.hyperparams,
        status="queued",
        metrics=None,
        producedAdapterId=None,
        trace=[],
        trainingPairs=[],
        progress=0.0,
        currentStep=0,
        totalSteps=0,
        currentEpoch=0,
        error=None,
        startedAt=started,
        finishedAt=None,
    )
    session.add(FineTuneRunTable.from_api(placeholder))
    session.commit()

    threading.Thread(
        target=_run_in_thread,
        args=(run_id, payload),
        daemon=True,
    ).start()

    return placeholder


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_finetune_run(
    run_id: str, session: Session = Depends(get_session)
) -> None:
    row = session.get(FineTuneRunTable, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Fine-tune run not found")
    session.delete(row)
    session.commit()


# ---- background-thread plumbing -------------------------------------------


def _update_run(run_id: str, **fields: Any) -> None:
    """Open a fresh session and patch the FineTuneRun row.

    Called from the training thread, so it must not share the request's
    session. Any unknown column name is silently ignored — keeps the
    on_progress callback flexible.
    """
    with Session(engine) as session:
        row = session.get(FineTuneRunTable, run_id)
        if row is None:
            return
        for key, value in fields.items():
            if hasattr(row, key):
                setattr(row, key, value)
        session.add(row)
        session.commit()


def _run_in_thread(run_id: str, payload: FineTuneRunCreate) -> None:
    try:
        _update_run(run_id, status="running")

        with Session(engine) as session:
            dataset_row = session.get(DatasetTable, payload.dataset_id)
            if dataset_row is None:
                raise RuntimeError(f"Dataset {payload.dataset_id} disappeared")
            dataset = dataset_row.to_api()
            task_row = session.get(TaskTable, dataset.task_type)
            task = task_row.to_api() if task_row is not None else None

        on_progress = lambda fields: _update_run(run_id, **fields)  # noqa: E731

        if is_supported_base(payload.base_model):
            run, adapter = execute_real_finetune(
                dataset=dataset,
                base_model=payload.base_model,
                adapter_name=payload.adapter_name,
                hyperparams=payload.hyperparams,
                task=task,
                on_progress=on_progress,
            )
        else:
            run, adapter = execute_finetune(
                dataset=dataset,
                base_model=payload.base_model,
                adapter_name=payload.adapter_name,
                hyperparams=payload.hyperparams,
                task=task,
            )

        # Replace the placeholder row with the real one (preserving its id)
        # and persist the produced adapter. Carry forward the live step
        # counters from the placeholder so completed runs still show
        # "step N/N — epoch K/K" instead of zeros.
        run.id = run_id
        run.progress = 1.0
        run.status = "completed"
        with Session(engine) as session:
            existing = session.get(FineTuneRunTable, run_id)
            if existing is not None:
                run.total_steps = max(run.total_steps, int(existing.total_steps or 0))
                run.current_step = max(run.current_step, int(existing.current_step or 0))
                run.current_epoch = max(
                    run.current_epoch, int(existing.current_epoch or 0)
                )
                session.delete(existing)
                session.flush()
            session.add(FineTuneRunTable.from_api(run))
            session.add(AdapterTable.from_api(adapter))
            session.commit()
    except Exception as exc:  # noqa: BLE001 — surface any failure on the row
        traceback.print_exc()
        _update_run(
            run_id,
            status="failed",
            error=str(exc),
            finished_at=datetime.now(timezone.utc),
        )
