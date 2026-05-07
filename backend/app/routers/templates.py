import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.db import get_session
from app.models.workflow import Workflow, WorkflowTable
from app.services.templates import TEMPLATES, get_template

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateMeta(BaseModel):
    id: str
    name: str
    description: str
    node_count: int = Field(alias="nodeCount")
    edge_count: int = Field(alias="edgeCount")

    model_config = {"populate_by_name": True}


@router.get("", response_model=list[TemplateMeta], response_model_by_alias=True)
def list_templates() -> list[TemplateMeta]:
    out: list[TemplateMeta] = []
    for t in TEMPLATES:
        # Build a throwaway workflow purely to count nodes/edges so the UI
        # can show shape without us hand-maintaining a second copy.
        wf = t.factory("__preview__", None)
        out.append(
            TemplateMeta(
                id=t.id,
                name=t.name,
                description=t.description,
                nodeCount=len(wf.nodes),
                edgeCount=len(wf.edges),
            )
        )
    return out


@router.post(
    "/{template_id}/clone",
    response_model=Workflow,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def clone_template(
    template_id: str, session: Session = Depends(get_session)
) -> Workflow:
    template = get_template(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail=f"Template {template_id} not found")

    workflow_id = f"wf_{uuid.uuid4().hex[:12]}"
    workflow = template.factory(workflow_id, datetime.now(timezone.utc))
    row = WorkflowTable.from_api(workflow)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row.to_api()
