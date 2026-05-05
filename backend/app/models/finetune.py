from datetime import datetime
from typing import Literal

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.models.run import TraceEntry

FineTuneStatus = Literal["queued", "running", "completed", "failed"]


class FineTuneHyperparams(BaseModel):
    epochs: int = PydanticField(default=3, ge=1, le=100)
    learning_rate: float = PydanticField(
        default=2e-4, alias="learningRate", gt=0, lt=1
    )
    batch_size: int = PydanticField(default=8, alias="batchSize", ge=1, le=512)

    model_config = {"populate_by_name": True}


class FineTuneMetrics(BaseModel):
    accuracy: float | None = None
    f1: float | None = None
    eval_loss: float | None = PydanticField(default=None, alias="evalLoss")
    notes: str | None = None

    model_config = {"populate_by_name": True}


class FineTuneRun(BaseModel):
    id: str
    dataset_id: str = PydanticField(alias="datasetId")
    base_model: str = PydanticField(alias="baseModel")
    adapter_name: str = PydanticField(alias="adapterName")
    task_type: str = PydanticField(alias="taskType")
    hyperparams: FineTuneHyperparams
    status: FineTuneStatus
    metrics: FineTuneMetrics | None = None
    produced_adapter_id: str | None = PydanticField(
        default=None, alias="producedAdapterId"
    )
    trace: list[TraceEntry] = PydanticField(default_factory=list)
    started_at: datetime = PydanticField(alias="startedAt")
    finished_at: datetime | None = PydanticField(default=None, alias="finishedAt")

    model_config = {"populate_by_name": True}


class FineTuneRunCreate(BaseModel):
    dataset_id: str = PydanticField(alias="datasetId")
    base_model: str = PydanticField(alias="baseModel")
    adapter_name: str = PydanticField(alias="adapterName")
    hyperparams: FineTuneHyperparams = PydanticField(default_factory=FineTuneHyperparams)

    model_config = {"populate_by_name": True}


class FineTuneRunTable(SQLModel, table=True):
    __tablename__ = "finetune_run"

    id: str = Field(primary_key=True)
    dataset_id: str = Field(foreign_key="dataset.id")
    base_model: str
    adapter_name: str
    task_type: str
    hyperparams: dict = Field(default_factory=dict, sa_column=Column(JSON))
    status: str
    metrics: dict | None = Field(default=None, sa_column=Column(JSON))
    produced_adapter_id: str | None = None
    trace: list = Field(default_factory=list, sa_column=Column(JSON))
    started_at: datetime
    finished_at: datetime | None = None

    def to_api(self) -> FineTuneRun:
        metrics = FineTuneMetrics(**self.metrics) if self.metrics else None
        trace = [TraceEntry(**entry) for entry in (self.trace or [])]
        return FineTuneRun(
            id=self.id,
            datasetId=self.dataset_id,
            baseModel=self.base_model,
            adapterName=self.adapter_name,
            taskType=self.task_type,
            hyperparams=FineTuneHyperparams(**self.hyperparams),
            status=self.status,  # type: ignore[arg-type]
            metrics=metrics,
            producedAdapterId=self.produced_adapter_id,
            trace=trace,
            startedAt=self.started_at,
            finishedAt=self.finished_at,
        )

    @classmethod
    def from_api(cls, run: FineTuneRun) -> "FineTuneRunTable":
        metrics = (
            run.metrics.model_dump(by_alias=False, mode="json")
            if run.metrics is not None
            else None
        )
        return cls(
            id=run.id,
            dataset_id=run.dataset_id,
            base_model=run.base_model,
            adapter_name=run.adapter_name,
            task_type=run.task_type,
            hyperparams=run.hyperparams.model_dump(by_alias=False, mode="json"),
            status=run.status,
            metrics=metrics,
            produced_adapter_id=run.produced_adapter_id,
            trace=[entry.model_dump(by_alias=False, mode="json") for entry in run.trace],
            started_at=run.started_at,
            finished_at=run.finished_at,
        )
