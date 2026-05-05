from datetime import datetime
from typing import Literal

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlmodel import Field, SQLModel

from app.models.adapter import TaskType

DatasetSource = Literal["file", "text", "external", "mock"]


class Dataset(BaseModel):
    id: str
    name: str
    task_type: TaskType = PydanticField(alias="taskType")
    source_type: DatasetSource = PydanticField(alias="sourceType")
    summary: str
    row_count: int = PydanticField(alias="rowCount")
    created_at: datetime = PydanticField(alias="createdAt")

    model_config = {"populate_by_name": True}


class DatasetTable(SQLModel, table=True):
    __tablename__ = "dataset"

    id: str = Field(primary_key=True)
    name: str
    task_type: str
    source_type: str
    summary: str
    row_count: int
    created_at: datetime

    def to_api(self) -> Dataset:
        return Dataset(
            id=self.id,
            name=self.name,
            taskType=self.task_type,  # type: ignore[arg-type]
            sourceType=self.source_type,  # type: ignore[arg-type]
            summary=self.summary,
            rowCount=self.row_count,
            createdAt=self.created_at,
        )

    @classmethod
    def from_api(cls, dataset: Dataset) -> "DatasetTable":
        return cls(
            id=dataset.id,
            name=dataset.name,
            task_type=dataset.task_type,
            source_type=dataset.source_type,
            summary=dataset.summary,
            row_count=dataset.row_count,
            created_at=dataset.created_at,
        )
