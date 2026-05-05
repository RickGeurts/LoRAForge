import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models.adapter import AdapterTable
from app.models.run import Run, RunCreate, RunTable
from app.models.workflow import WorkflowTable
from app.services.executor import execute_workflow

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
    workflow_row = session.get(WorkflowTable, payload.workflow_id)
    if workflow_row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Workflow {payload.workflow_id} not found",
        )

    started_at = datetime.now(timezone.utc)
    workflow = workflow_row.to_api()
    adapters = {
        row.id: row.to_api() for row in session.exec(select(AdapterTable)).all()
    }
    final_status, output, trace, finished_at = execute_workflow(
        workflow, payload.inputs, started_at=started_at, adapters=adapters
    )

    run = Run(
        id=f"run_{uuid.uuid4().hex[:12]}",
        workflowId=payload.workflow_id,
        workflowVersion=workflow.version,
        status=final_status,
        inputs=payload.inputs,
        output=output,
        trace=trace,
        startedAt=started_at,
        finishedAt=finished_at,
    )
    row = RunTable.from_api(run)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row.to_api()
