from datetime import datetime
from typing import Literal

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlmodel import Field, SQLModel

# How the prospectus got into the registry. PDF upload is intentionally
# absent — CLAUDE.md non-goal — text-only ingest only.
ProspectusSource = Literal["seeded", "pasted"]


class Prospectus(BaseModel):
    id: str
    name: str
    identifier: str | None = None
    summary: str | None = None
    text: str
    source: ProspectusSource
    created_at: datetime = PydanticField(alias="createdAt")

    model_config = {"populate_by_name": True}


class ProspectusTable(SQLModel, table=True):
    __tablename__ = "prospectus"

    id: str = Field(primary_key=True)
    name: str
    identifier: str | None = None
    summary: str | None = None
    text: str
    source: str
    created_at: datetime

    def to_api(self) -> Prospectus:
        return Prospectus(
            id=self.id,
            name=self.name,
            identifier=self.identifier,
            summary=self.summary,
            text=self.text,
            source=self.source,  # type: ignore[arg-type]
            createdAt=self.created_at,
        )

    @classmethod
    def from_api(cls, prospectus: Prospectus) -> "ProspectusTable":
        return cls(
            id=prospectus.id,
            name=prospectus.name,
            identifier=prospectus.identifier,
            summary=prospectus.summary,
            text=prospectus.text,
            source=prospectus.source,
            created_at=prospectus.created_at,
        )
