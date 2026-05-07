from datetime import datetime
from typing import Literal

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

AdapterStatus = Literal["draft", "trained", "validated", "published", "deprecated"]
# TaskType used to be a Literal of the five seeded ids. Now that the Task
# registry can be extended by users, any string that resolves to a Task.id is
# valid; the API trusts the UI to pick from /tasks. Step 5 of the plan will
# add a runtime check in the executor.
TaskType = str


class EvaluationMetrics(BaseModel):
    accuracy: float | None = None
    precision: float | None = None
    recall: float | None = None
    f1: float | None = None
    notes: str | None = None


class Adapter(BaseModel):
    id: str
    name: str
    base_model: str = PydanticField(alias="baseModel")
    task_type: TaskType = PydanticField(alias="taskType")
    version: str
    status: AdapterStatus
    training_data_summary: str | None = PydanticField(
        default=None, alias="trainingDataSummary"
    )
    evaluation_metrics: EvaluationMetrics | None = PydanticField(
        default=None, alias="evaluationMetrics"
    )
    created_at: datetime = PydanticField(alias="createdAt")

    model_config = {"populate_by_name": True}


class AdapterTable(SQLModel, table=True):
    __tablename__ = "adapter"

    id: str = Field(primary_key=True)
    name: str
    base_model: str
    task_type: str
    version: str
    status: str
    training_data_summary: str | None = None
    evaluation_metrics: dict | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime

    def to_api(self) -> Adapter:
        metrics = (
            EvaluationMetrics(**self.evaluation_metrics)
            if self.evaluation_metrics is not None
            else None
        )
        return Adapter(
            id=self.id,
            name=self.name,
            baseModel=self.base_model,
            taskType=self.task_type,  # type: ignore[arg-type]
            version=self.version,
            status=self.status,  # type: ignore[arg-type]
            trainingDataSummary=self.training_data_summary,
            evaluationMetrics=metrics,
            createdAt=self.created_at,
        )

    @classmethod
    def from_api(cls, adapter: Adapter) -> "AdapterTable":
        metrics = (
            adapter.evaluation_metrics.model_dump()
            if adapter.evaluation_metrics is not None
            else None
        )
        return cls(
            id=adapter.id,
            name=adapter.name,
            base_model=adapter.base_model,
            task_type=adapter.task_type,
            version=adapter.version,
            status=adapter.status,
            training_data_summary=adapter.training_data_summary,
            evaluation_metrics=metrics,
            created_at=adapter.created_at,
        )
