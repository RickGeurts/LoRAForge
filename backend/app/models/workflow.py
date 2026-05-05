from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

NodeGroup = Literal["documents", "ai", "rules", "logic", "output"]


class WorkflowNode(BaseModel):
    id: str
    type: str
    group: NodeGroup
    label: str
    config: dict[str, Any] = Field(default_factory=dict)


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str


class Workflow(BaseModel):
    id: str
    name: str
    version: str
    description: str | None = None
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}
