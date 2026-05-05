from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

RunStatus = Literal["queued", "running", "completed", "failed", "needs_review"]


class RunOutput(BaseModel):
    decision: str
    confidence: float
    explanation: str
    sources: list[str] = PydanticField(default_factory=list)
    adapter_version: str = PydanticField(alias="adapterVersion")
    workflow_version: str = PydanticField(alias="workflowVersion")
    timestamp: datetime

    model_config = {"populate_by_name": True}


class Run(BaseModel):
    id: str
    workflow_id: str = PydanticField(alias="workflowId")
    workflow_version: str = PydanticField(alias="workflowVersion")
    status: RunStatus
    inputs: dict[str, Any] = PydanticField(default_factory=dict)
    output: RunOutput | None = None
    started_at: datetime = PydanticField(alias="startedAt")
    finished_at: datetime | None = PydanticField(default=None, alias="finishedAt")

    model_config = {"populate_by_name": True}


class RunCreate(BaseModel):
    """Client payload to enqueue a run. Server fills id, status, started_at, workflow_version."""

    workflow_id: str = PydanticField(alias="workflowId")
    inputs: dict[str, Any] = PydanticField(default_factory=dict)

    model_config = {"populate_by_name": True}


class RunTable(SQLModel, table=True):
    __tablename__ = "run"

    id: str = Field(primary_key=True)
    workflow_id: str = Field(foreign_key="workflow.id")
    workflow_version: str
    status: str
    inputs: dict = Field(default_factory=dict, sa_column=Column(JSON))
    output: dict | None = Field(default=None, sa_column=Column(JSON))
    started_at: datetime
    finished_at: datetime | None = None

    def to_api(self) -> Run:
        output = RunOutput(**self.output) if self.output is not None else None
        return Run(
            id=self.id,
            workflowId=self.workflow_id,
            workflowVersion=self.workflow_version,
            status=self.status,  # type: ignore[arg-type]
            inputs=self.inputs,
            output=output,
            startedAt=self.started_at,
            finishedAt=self.finished_at,
        )

    @classmethod
    def from_api(cls, run: Run) -> "RunTable":
        # mode="json" converts nested datetimes (RunOutput.timestamp) to ISO
        # strings so SQLAlchemy's JSON column can serialize them. Pydantic
        # parses the strings back to datetime when to_api() reconstructs.
        output_dict = (
            run.output.model_dump(by_alias=False, mode="json")
            if run.output is not None
            else None
        )
        return cls(
            id=run.id,
            workflow_id=run.workflow_id,
            workflow_version=run.workflow_version,
            status=run.status,
            inputs=run.inputs,
            output=output_dict,
            started_at=run.started_at,
            finished_at=run.finished_at,
        )
