import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field as PydanticField
from sqlmodel import Session, select

from app.db import get_session
from app.models.adapter import TaskType
from app.models.dataset import Dataset, DatasetSource, DatasetTable

router = APIRouter(prefix="/datasets", tags=["datasets"])


class DatasetCreate(BaseModel):
    """Client payload for creating a dataset. Server fills id and createdAt."""

    name: str
    task_type: TaskType = PydanticField(alias="taskType")
    source_type: DatasetSource = PydanticField(alias="sourceType")
    summary: str
    row_count: int = PydanticField(alias="rowCount", ge=0)
    label_column: str = PydanticField(default="label", alias="labelColumn")
    text_column: str = PydanticField(default="excerpt", alias="textColumn")
    rationale_column: str | None = PydanticField(
        default="rationale", alias="rationaleColumn"
    )

    model_config = {"populate_by_name": True}


@router.get("", response_model=list[Dataset], response_model_by_alias=True)
def list_datasets(session: Session = Depends(get_session)) -> list[Dataset]:
    rows = session.exec(select(DatasetTable)).all()
    return [row.to_api() for row in rows]


@router.get("/{dataset_id}", response_model=Dataset, response_model_by_alias=True)
def get_dataset(
    dataset_id: str, session: Session = Depends(get_session)
) -> Dataset:
    row = session.get(DatasetTable, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return row.to_api()


@router.post(
    "",
    response_model=Dataset,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_dataset(
    payload: DatasetCreate, session: Session = Depends(get_session)
) -> Dataset:
    dataset = Dataset(
        id=f"ds_{uuid.uuid4().hex[:10]}",
        name=payload.name,
        taskType=payload.task_type,
        sourceType=payload.source_type,
        summary=payload.summary,
        rowCount=payload.row_count,
        labelColumn=payload.label_column,
        textColumn=payload.text_column,
        rationaleColumn=payload.rationale_column,
        createdAt=datetime.now(timezone.utc),
    )
    row = DatasetTable.from_api(dataset)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row.to_api()


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset_id: str, session: Session = Depends(get_session)
) -> None:
    row = session.get(DatasetTable, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    session.delete(row)
    session.commit()
