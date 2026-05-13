from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlalchemy import JSON, Column
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
    rows: list[dict[str, Any]] = PydanticField(default_factory=list)
    # Column-mapping into the row dicts. Default to the historical
    # convention so older datasets keep working without an explicit setting.
    label_column: str = PydanticField(default="label", alias="labelColumn")
    text_column: str = PydanticField(default="excerpt", alias="textColumn")
    rationale_column: str | None = PydanticField(
        default="rationale", alias="rationaleColumn"
    )
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
    rows: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    label_column: str = "label"
    text_column: str = "excerpt"
    rationale_column: str | None = "rationale"
    created_at: datetime

    def to_api(self) -> Dataset:
        return Dataset(
            id=self.id,
            name=self.name,
            taskType=self.task_type,  # type: ignore[arg-type]
            sourceType=self.source_type,  # type: ignore[arg-type]
            summary=self.summary,
            rowCount=self.row_count,
            rows=list(self.rows or []),
            labelColumn=self.label_column or "label",
            textColumn=self.text_column or "excerpt",
            rationaleColumn=self.rationale_column,
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
            rows=list(dataset.rows or []),
            label_column=dataset.label_column,
            text_column=dataset.text_column,
            rationale_column=dataset.rationale_column,
            created_at=dataset.created_at,
        )
