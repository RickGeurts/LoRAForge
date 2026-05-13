from fastapi import APIRouter

from app.services import rule_engine

router = APIRouter(prefix="/rules", tags=["rules"])


@router.get("/primitives")
def list_primitives() -> list[dict]:
    """Schema list so the frontend can render a rule-builder form."""
    return [p.as_dict() for p in rule_engine.PRIMITIVES.values()]
