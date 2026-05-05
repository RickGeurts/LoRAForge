from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models.adapter import AdapterTable
from app.models.dataset import DatasetTable
from app.models.finetune import FineTuneRun, FineTuneRunCreate, FineTuneRunTable
from app.services.finetune_executor import execute_finetune

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

    run, adapter = execute_finetune(
        dataset=dataset_row.to_api(),
        base_model=payload.base_model,
        adapter_name=payload.adapter_name,
        hyperparams=payload.hyperparams,
    )

    session.add(AdapterTable.from_api(adapter))
    session.add(FineTuneRunTable.from_api(run))
    session.commit()
    return run
