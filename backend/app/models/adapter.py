from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AdapterStatus = Literal["draft", "trained", "validated", "published", "deprecated"]
TaskType = Literal[
    "mrel_classifier",
    "instrument_classifier",
    "clause_extractor",
    "validator",
    "other",
]


class EvaluationMetrics(BaseModel):
    accuracy: float | None = None
    precision: float | None = None
    recall: float | None = None
    f1: float | None = None
    notes: str | None = None


class Adapter(BaseModel):
    id: str
    name: str
    base_model: str = Field(alias="baseModel")
    task_type: TaskType = Field(alias="taskType")
    version: str
    status: AdapterStatus
    training_data_summary: str | None = Field(default=None, alias="trainingDataSummary")
    evaluation_metrics: EvaluationMetrics | None = Field(
        default=None, alias="evaluationMetrics"
    )
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}
