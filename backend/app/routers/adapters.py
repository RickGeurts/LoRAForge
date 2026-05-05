from datetime import datetime, timezone

from fastapi import APIRouter

from app.models.adapter import Adapter, EvaluationMetrics

router = APIRouter(prefix="/adapters", tags=["adapters"])


_MOCK_ADAPTERS: list[Adapter] = [
    Adapter(
        id="adp_mrel_v1",
        name="MREL Eligibility Classifier",
        baseModel="llama3.1:8b",
        taskType="mrel_classifier",
        version="0.1.0",
        status="draft",
        trainingDataSummary="120 annotated MREL prospectus excerpts (mock)",
        evaluationMetrics=EvaluationMetrics(accuracy=0.0, notes="not yet trained"),
        createdAt=datetime(2026, 5, 5, tzinfo=timezone.utc),
    ),
    Adapter(
        id="adp_clause_v1",
        name="Prospectus Clause Extractor",
        baseModel="llama3.1:8b",
        taskType="clause_extractor",
        version="0.1.0",
        status="draft",
        trainingDataSummary=None,
        evaluationMetrics=None,
        createdAt=datetime(2026, 5, 5, tzinfo=timezone.utc),
    ),
]


@router.get("", response_model=list[Adapter])
def list_adapters() -> list[Adapter]:
    return _MOCK_ADAPTERS
