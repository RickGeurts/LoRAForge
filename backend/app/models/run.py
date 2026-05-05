from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

RunStatus = Literal["queued", "running", "completed", "failed", "needs_review"]


class RunOutput(BaseModel):
    decision: str
    confidence: float
    explanation: str
    sources: list[str] = Field(default_factory=list)
    adapter_version: str = Field(alias="adapterVersion")
    workflow_version: str = Field(alias="workflowVersion")
    timestamp: datetime

    model_config = {"populate_by_name": True}


class Run(BaseModel):
    id: str
    workflow_id: str = Field(alias="workflowId")
    workflow_version: str = Field(alias="workflowVersion")
    status: RunStatus
    inputs: dict[str, Any] = Field(default_factory=dict)
    output: RunOutput | None = None
    started_at: datetime = Field(alias="startedAt")
    finished_at: datetime | None = Field(default=None, alias="finishedAt")

    model_config = {"populate_by_name": True}
