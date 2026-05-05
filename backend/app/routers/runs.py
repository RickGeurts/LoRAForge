import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models.run import Run, RunCreate, RunTable
from app.models.workflow import WorkflowTable

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("", response_model=list[Run], response_model_by_alias=True)
def list_runs(session: Session = Depends(get_session)) -> list[Run]:
    rows = session.exec(select(RunTable)).all()
    return [row.to_api() for row in rows]


@router.get("/{run_id}", response_model=Run, response_model_by_alias=True)
def get_run(run_id: str, session: Session = Depends(get_session)) -> Run:
    row = session.get(RunTable, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return row.to_api()


@router.post(
    "",
    response_model=Run,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_run(
    payload: RunCreate, session: Session = Depends(get_session)
) -> Run:
    workflow = session.get(WorkflowTable, payload.workflow_id)
    if workflow is None:
        raise HTTPException(
            status_code=404,
            detail=f"Workflow {payload.workflow_id} not found",
        )
    run = Run(
        id=f"run_{uuid.uuid4().hex[:12]}",
        workflowId=payload.workflow_id,
        workflowVersion=workflow.version,
        status="queued",
        inputs=payload.inputs,
        output=None,
        startedAt=datetime.now(timezone.utc),
        finishedAt=None,
    )
    row = RunTable.from_api(run)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row.to_api()
