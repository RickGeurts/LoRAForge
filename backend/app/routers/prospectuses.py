import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models.prospectus import Prospectus, ProspectusTable

router = APIRouter(prefix="/prospectuses", tags=["prospectuses"])


class ProspectusCreate(BaseModel):
    """Client payload for creating a prospectus. Server fills id/createdAt/source."""

    name: str
    identifier: str | None = None
    summary: str | None = None
    text: str


@router.get("", response_model=list[Prospectus], response_model_by_alias=True)
def list_prospectuses(session: Session = Depends(get_session)) -> list[Prospectus]:
    rows = session.exec(select(ProspectusTable)).all()
    return [row.to_api() for row in rows]


@router.get(
    "/{prospectus_id}", response_model=Prospectus, response_model_by_alias=True
)
def get_prospectus(
    prospectus_id: str, session: Session = Depends(get_session)
) -> Prospectus:
    row = session.get(ProspectusTable, prospectus_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Prospectus not found")
    return row.to_api()


@router.post(
    "",
    response_model=Prospectus,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_prospectus(
    payload: ProspectusCreate, session: Session = Depends(get_session)
) -> Prospectus:
    prospectus = Prospectus(
        id=f"pr_{uuid.uuid4().hex[:10]}",
        name=payload.name,
        identifier=payload.identifier,
        summary=payload.summary,
        text=payload.text,
        source="pasted",
        createdAt=datetime.now(timezone.utc),
    )
    row = ProspectusTable.from_api(prospectus)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row.to_api()


@router.delete("/{prospectus_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prospectus(
    prospectus_id: str, session: Session = Depends(get_session)
) -> None:
    row = session.get(ProspectusTable, prospectus_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Prospectus not found")
    session.delete(row)
    session.commit()
