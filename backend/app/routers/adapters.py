import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models.adapter import Adapter, AdapterTable

router = APIRouter(prefix="/adapters", tags=["adapters"])

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


@router.get("", response_model=list[Adapter], response_model_by_alias=True)
def list_adapters(session: Session = Depends(get_session)) -> list[Adapter]:
    rows = session.exec(select(AdapterTable)).all()
    return [row.to_api() for row in rows]


@router.get("/{adapter_id}", response_model=Adapter, response_model_by_alias=True)
def get_adapter(
    adapter_id: str, session: Session = Depends(get_session)
) -> Adapter:
    row = session.get(AdapterTable, adapter_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Adapter not found")
    return row.to_api()


@router.post(
    "",
    response_model=Adapter,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_adapter(
    payload: Adapter, session: Session = Depends(get_session)
) -> Adapter:
    if session.get(AdapterTable, payload.id) is not None:
        raise HTTPException(
            status_code=409, detail=f"Adapter {payload.id} already exists"
        )
    row = AdapterTable.from_api(payload)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row.to_api()


@router.put(
    "/{adapter_id}",
    response_model=Adapter,
    response_model_by_alias=True,
)
def replace_adapter(
    adapter_id: str,
    payload: Adapter,
    session: Session = Depends(get_session),
) -> Adapter:
    if adapter_id != payload.id:
        raise HTTPException(status_code=400, detail="Adapter ID mismatch")
    existing = session.get(AdapterTable, adapter_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Adapter not found")
    session.delete(existing)
    session.flush()
    new_row = AdapterTable.from_api(payload)
    session.add(new_row)
    session.commit()
    session.refresh(new_row)
    return new_row.to_api()


@router.delete("/{adapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_adapter(
    adapter_id: str, session: Session = Depends(get_session)
) -> None:
    row = session.get(AdapterTable, adapter_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Adapter not found")

    # Drop any LoRA weights from disk so the next training run for the
    # same id starts clean. Only does anything for HF-trained adapters.
    if row.weights_path:
        weights_dir = _BACKEND_ROOT / row.weights_path
        if weights_dir.exists() and weights_dir.is_dir():
            shutil.rmtree(weights_dir, ignore_errors=True)

    session.delete(row)
    session.commit()
