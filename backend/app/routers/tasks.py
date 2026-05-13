import re
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlmodel import Session, select

from app.db import get_session
from app.models.task import Task, TaskKind, TaskTable
from app.models.workflow import NodeGroup

router = APIRouter(prefix="/tasks", tags=["tasks"])

_SLUG_RE = re.compile(r"^[a-z][a-z0-9_]*$")


class TaskCreate(BaseModel):
    """Client payload for creating a task. Server fills builtin=False and timestamps."""

    id: str | None = None
    name: str
    description: str
    prompt_template: str = PydanticField(default="", alias="promptTemplate")
    expected_output: str = PydanticField(default="", alias="expectedOutput")
    node_group: NodeGroup = PydanticField(alias="nodeGroup")
    default_base_model: str = PydanticField(
        default="llama3.1:8b", alias="defaultBaseModel"
    )
    kind: TaskKind = "generator"
    labels: list[str] = PydanticField(default_factory=list)

    model_config = {"populate_by_name": True}


class TaskUpdate(BaseModel):
    """Replace-style update. ID and builtin can't be changed."""

    name: str
    description: str
    prompt_template: str = PydanticField(default="", alias="promptTemplate")
    expected_output: str = PydanticField(default="", alias="expectedOutput")
    node_group: NodeGroup = PydanticField(alias="nodeGroup")
    default_base_model: str = PydanticField(
        default="llama3.1:8b", alias="defaultBaseModel"
    )
    kind: TaskKind = "generator"
    labels: list[str] = PydanticField(default_factory=list)

    model_config = {"populate_by_name": True}


def _slugify(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_]+", "_", name.lower()).strip("_")
    return cleaned or f"task_{uuid.uuid4().hex[:8]}"


def _ensure_valid_id(task_id: str) -> None:
    if not _SLUG_RE.match(task_id):
        raise HTTPException(
            status_code=400,
            detail="Task id must match ^[a-z][a-z0-9_]*$ (lowercase, digits, underscores).",
        )


@router.get("", response_model=list[Task], response_model_by_alias=True)
def list_tasks(
    group: Literal["documents", "ai", "rules", "logic", "output"] | None = Query(
        default=None,
        description="Filter to one nodeGroup (e.g. ai for the workflow editor palette).",
    ),
    session: Session = Depends(get_session),
) -> list[Task]:
    stmt = select(TaskTable)
    if group is not None:
        stmt = stmt.where(TaskTable.node_group == group)
    rows = session.exec(stmt).all()
    return [row.to_api() for row in rows]


@router.get("/{task_id}", response_model=Task, response_model_by_alias=True)
def get_task(task_id: str, session: Session = Depends(get_session)) -> Task:
    row = session.get(TaskTable, task_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return row.to_api()


@router.post(
    "",
    response_model=Task,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    payload: TaskCreate, session: Session = Depends(get_session)
) -> Task:
    task_id = (payload.id or _slugify(payload.name)).strip().lower()
    _ensure_valid_id(task_id)
    if session.get(TaskTable, task_id) is not None:
        raise HTTPException(
            status_code=409, detail=f"Task {task_id!r} already exists."
        )

    now = datetime.now(timezone.utc)
    task = Task(
        id=task_id,
        name=payload.name,
        description=payload.description,
        promptTemplate=payload.prompt_template,
        expectedOutput=payload.expected_output,
        nodeGroup=payload.node_group,
        defaultBaseModel=payload.default_base_model,
        kind=payload.kind,
        labels=list(payload.labels or []),
        builtin=False,
        createdAt=now,
        updatedAt=now,
    )
    row = TaskTable.from_api(task)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row.to_api()


@router.put(
    "/{task_id}", response_model=Task, response_model_by_alias=True
)
def replace_task(
    task_id: str,
    payload: TaskUpdate,
    session: Session = Depends(get_session),
) -> Task:
    row = session.get(TaskTable, task_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")

    row.name = payload.name
    row.description = payload.description
    row.prompt_template = payload.prompt_template
    row.expected_output = payload.expected_output
    row.node_group = payload.node_group
    row.default_base_model = payload.default_base_model
    row.kind = payload.kind
    row.labels = list(payload.labels or [])
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row.to_api()


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str, session: Session = Depends(get_session)) -> None:
    row = session.get(TaskTable, task_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if row.builtin:
        raise HTTPException(
            status_code=409,
            detail=(
                "Builtin tasks can't be deleted — they're referenced by adapters, "
                "datasets, and workflow nodes. Edit the fields instead."
            ),
        )
    session.delete(row)
    session.commit()
