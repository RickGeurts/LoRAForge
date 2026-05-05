from datetime import datetime, timezone

from fastapi import APIRouter

from app.models.workflow import Workflow, WorkflowEdge, WorkflowNode

router = APIRouter(prefix="/workflows", tags=["workflows"])


_MOCK_WORKFLOWS: list[Workflow] = [
    Workflow(
        id="wf_mrel_template",
        name="MREL Eligibility Assessment",
        version="0.1.0",
        description="Prospectus → Extract → Classify → Validate → Review → Output",
        nodes=[
            WorkflowNode(id="n1", type="prospectus_loader", group="documents", label="Prospectus Loader"),
            WorkflowNode(id="n2", type="clause_extractor", group="ai", label="Clause Extractor"),
            WorkflowNode(id="n3", type="mrel_classifier", group="ai", label="MREL Classifier"),
            WorkflowNode(id="n4", type="validator", group="rules", label="Validator"),
            WorkflowNode(id="n5", type="confidence_filter", group="rules", label="Confidence Filter"),
            WorkflowNode(id="n6", type="human_review", group="logic", label="Human Review"),
            WorkflowNode(id="n7", type="decision_output", group="output", label="Decision Output"),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(id="e3", source="n3", target="n4"),
            WorkflowEdge(id="e4", source="n4", target="n5"),
            WorkflowEdge(id="e5", source="n5", target="n6"),
            WorkflowEdge(id="e6", source="n6", target="n7"),
        ],
        createdAt=datetime(2026, 5, 5, tzinfo=timezone.utc),
        updatedAt=datetime(2026, 5, 5, tzinfo=timezone.utc),
    ),
]


@router.get("", response_model=list[Workflow])
def list_workflows() -> list[Workflow]:
    return _MOCK_WORKFLOWS
