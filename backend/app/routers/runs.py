from datetime import datetime, timezone

from fastapi import APIRouter

from app.models.run import Run, RunOutput

router = APIRouter(prefix="/runs", tags=["runs"])


_MOCK_RUNS: list[Run] = [
    Run(
        id="run_001",
        workflowId="wf_mrel_template",
        workflowVersion="0.1.0",
        status="completed",
        inputs={"document": "sample_prospectus.pdf"},
        output=RunOutput(
            decision="MREL-eligible",
            confidence=0.87,
            explanation="Subordination clause detected; maturity > 1 year.",
            sources=["page 12 §4.2", "page 18 §6.1"],
            adapterVersion="0.1.0",
            workflowVersion="0.1.0",
            timestamp=datetime(2026, 5, 5, tzinfo=timezone.utc),
        ),
        startedAt=datetime(2026, 5, 5, tzinfo=timezone.utc),
        finishedAt=datetime(2026, 5, 5, tzinfo=timezone.utc),
    ),
]


@router.get("", response_model=list[Run])
def list_runs() -> list[Run]:
    return _MOCK_RUNS
