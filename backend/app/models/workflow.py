from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

NodeGroup = Literal["documents", "ai", "rules", "logic", "output"]


class NodePosition(BaseModel):
    x: float
    y: float


class WorkflowNode(BaseModel):
    id: str
    type: str
    group: NodeGroup
    label: str
    config: dict[str, Any] = PydanticField(default_factory=dict)
    position: NodePosition | None = None


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str


class Workflow(BaseModel):
    id: str
    name: str
    version: str
    description: str | None = None
    nodes: list[WorkflowNode] = PydanticField(default_factory=list)
    edges: list[WorkflowEdge] = PydanticField(default_factory=list)
    created_at: datetime = PydanticField(alias="createdAt")
    updated_at: datetime = PydanticField(alias="updatedAt")

    model_config = {"populate_by_name": True}


class WorkflowTable(SQLModel, table=True):
    __tablename__ = "workflow"

    id: str = Field(primary_key=True)
    name: str
    version: str
    description: str | None = None
    nodes: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    edges: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime
    updated_at: datetime

    def to_api(self) -> Workflow:
        return Workflow(
            id=self.id,
            name=self.name,
            version=self.version,
            description=self.description,
            nodes=[WorkflowNode(**n) for n in self.nodes],
            edges=[WorkflowEdge(**e) for e in self.edges],
            createdAt=self.created_at,
            updatedAt=self.updated_at,
        )

    @classmethod
    def from_api(cls, workflow: Workflow) -> "WorkflowTable":
        return cls(
            id=workflow.id,
            name=workflow.name,
            version=workflow.version,
            description=workflow.description,
            nodes=[n.model_dump() for n in workflow.nodes],
            edges=[e.model_dump() for e in workflow.edges],
            created_at=workflow.created_at,
            updated_at=workflow.updated_at,
        )