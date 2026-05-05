from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models.workflow import Workflow, WorkflowTable

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("", response_model=list[Workflow], response_model_by_alias=True)
def list_workflows(session: Session = Depends(get_session)) -> list[Workflow]:
    rows = session.exec(select(WorkflowTable)).all()
    return [row.to_api() for row in rows]


@router.get("/{workflow_id}", response_model=Workflow, response_model_by_alias=True)
def get_workflow(
    workflow_id: str, session: Session = Depends(get_session)
) -> Workflow:
    row = session.get(WorkflowTable, workflow_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return row.to_api()


@router.post(
    "",
    response_model=Workflow,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_workflow(
    payload: Workflow, session: Session = Depends(get_session)
) -> Workflow:
    if session.get(WorkflowTable, payload.id) is not None:
        raise HTTPException(
            status_code=409, detail=f"Workflow {payload.id} already exists"
        )
    row = WorkflowTable.from_api(payload)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row.to_api()


@router.put(
    "/{workflow_id}",
    response_model=Workflow,
    response_model_by_alias=True,
)
def replace_workflow(
    workflow_id: str,
    payload: Workflow,
    session: Session = Depends(get_session),
) -> Workflow:
    if workflow_id != payload.id:
        raise HTTPException(status_code=400, detail="Workflow ID mismatch")
    existing = session.get(WorkflowTable, workflow_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    payload.updated_at = datetime.now(timezone.utc)
    session.delete(existing)
    session.flush()
    new_row = WorkflowTable.from_api(payload)
    session.add(new_row)
    session.commit()
    session.refresh(new_row)
    return new_row.to_api()


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(
    workflow_id: str, session: Session = Depends(get_session)
) -> None:
    row = session.get(WorkflowTable, workflow_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    session.delete(row)
    session.commit()
