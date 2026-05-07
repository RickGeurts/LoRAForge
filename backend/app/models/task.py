"""User-definable task contracts.

A Task ties together a prompt template, an expected output spec, and a
palette group. Adapters declare they can perform a task; datasets declare
they can train one; workflow AI nodes declare they consume one. Step 1
just persists the registry — the rest of the codebase keeps its existing
hardcoded strings until later steps swap them in.
"""
from datetime import datetime

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlmodel import Field, SQLModel

from app.models.workflow import NodeGroup


class Task(BaseModel):
    id: str
    name: str
    description: str
    prompt_template: str = PydanticField(default="", alias="promptTemplate")
    expected_output: str = PydanticField(default="", alias="expectedOutput")
    node_group: NodeGroup = PydanticField(alias="nodeGroup")
    default_base_model: str = PydanticField(
        default="llama3.1:8b", alias="defaultBaseModel"
    )
    builtin: bool = False
    created_at: datetime = PydanticField(alias="createdAt")
    updated_at: datetime = PydanticField(alias="updatedAt")

    model_config = {"populate_by_name": True}


class TaskTable(SQLModel, table=True):
    __tablename__ = "task"

    id: str = Field(primary_key=True)
    name: str
    description: str
    prompt_template: str = ""
    expected_output: str = ""
    node_group: str
    default_base_model: str = "llama3.1:8b"
    builtin: bool = False
    created_at: datetime
    updated_at: datetime

    def to_api(self) -> Task:
        return Task(
            id=self.id,
            name=self.name,
            description=self.description,
            promptTemplate=self.prompt_template,
            expectedOutput=self.expected_output,
            nodeGroup=self.node_group,  # type: ignore[arg-type]
            defaultBaseModel=self.default_base_model,
            builtin=self.builtin,
            createdAt=self.created_at,
            updatedAt=self.updated_at,
        )

    @classmethod
    def from_api(cls, task: Task) -> "TaskTable":
        return cls(
            id=task.id,
            name=task.name,
            description=task.description,
            prompt_template=task.prompt_template,
            expected_output=task.expected_output,
            node_group=task.node_group,
            default_base_model=task.default_base_model,
            builtin=task.builtin,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )
