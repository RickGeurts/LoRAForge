"""Static template definitions: pre-built MVP workflows ready to clone.

Each template is a factory that returns a fresh `Workflow` for a given id
and timestamp, so the registry is the single source of truth for both
seeded starter workflows and user-cloned workflows.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from app.models.workflow import (
    NodePosition,
    Workflow,
    WorkflowEdge,
    WorkflowNode,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _node(
    nid: str,
    type_: str,
    group: str,
    label: str,
    x: float,
    y: float,
    *,
    adapter_id: str | None = None,
) -> WorkflowNode:
    return WorkflowNode(
        id=nid,
        type=type_,
        group=group,  # type: ignore[arg-type]
        label=label,
        position=NodePosition(x=x, y=y),
        adapterId=adapter_id,
    )


def mrel_eligibility(
    workflow_id: str = "wf_mrel_template",
    ts: datetime | None = None,
) -> Workflow:
    t = ts or _now()
    return Workflow(
        id=workflow_id,
        name="MREL Eligibility Assessment",
        version="0.1.0",
        description="Prospectus → Extract → Classify → Validate → Review → Output",
        nodes=[
            _node("n1", "prospectus_loader", "documents", "Prospectus Loader", 40, 80),
            _node("n2", "clause_extractor", "ai", "Clause Extractor", 260, 80, adapter_id="adp_clause_v1"),
            _node("n3", "mrel_classifier", "ai", "MREL Classifier", 480, 80, adapter_id="adp_mrel_v1"),
            _node("n4", "validator", "rules", "Validator", 700, 80),
            _node("n5", "confidence_filter", "rules", "Confidence Filter", 920, 80),
            _node("n6", "human_review", "logic", "Human Review", 1140, 80),
            _node("n7", "decision_output", "output", "Decision Output", 1360, 80),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(id="e3", source="n3", target="n4"),
            WorkflowEdge(id="e4", source="n4", target="n5"),
            WorkflowEdge(id="e5", source="n5", target="n6"),
            WorkflowEdge(id="e6", source="n6", target="n7"),
        ],
        createdAt=t,
        updatedAt=t,
    )


def prospectus_clause_extraction(
    workflow_id: str,
    ts: datetime | None = None,
) -> Workflow:
    t = ts or _now()
    return Workflow(
        id=workflow_id,
        name="Prospectus Clause Extraction",
        version="0.1.0",
        description="Prospectus → PDF Extract → Clause Extractor → Validator → Report",
        nodes=[
            _node("n1", "prospectus_loader", "documents", "Prospectus Loader", 40, 80),
            _node("n2", "pdf_extractor", "documents", "PDF Extractor", 260, 80),
            _node("n3", "clause_extractor", "ai", "Clause Extractor", 480, 80, adapter_id="adp_clause_v1"),
            _node("n4", "validator", "rules", "Validator", 700, 80),
            _node("n5", "report_generator", "output", "Report Generator", 920, 80),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(id="e3", source="n3", target="n4"),
            WorkflowEdge(id="e4", source="n4", target="n5"),
        ],
        createdAt=t,
        updatedAt=t,
    )


def instrument_classification(
    workflow_id: str,
    ts: datetime | None = None,
) -> Workflow:
    t = ts or _now()
    return Workflow(
        id=workflow_id,
        name="Instrument Classification",
        version="0.1.0",
        description="Prospectus → Extract → Instrument Classifier → Validator → Confidence → Output",
        nodes=[
            _node("n1", "prospectus_loader", "documents", "Prospectus Loader", 40, 80),
            _node("n2", "clause_extractor", "ai", "Clause Extractor", 260, 80, adapter_id="adp_clause_v1"),
            _node("n3", "instrument_classifier", "ai", "Instrument Classifier", 480, 80),
            _node("n4", "validator", "rules", "Validator", 700, 80),
            _node("n5", "confidence_filter", "rules", "Confidence Filter", 920, 80),
            _node("n6", "decision_output", "output", "Decision Output", 1140, 80),
        ],
        edges=[
            WorkflowEdge(id="e1", source="n1", target="n2"),
            WorkflowEdge(id="e2", source="n2", target="n3"),
            WorkflowEdge(id="e3", source="n3", target="n4"),
            WorkflowEdge(id="e4", source="n4", target="n5"),
            WorkflowEdge(id="e5", source="n5", target="n6"),
        ],
        createdAt=t,
        updatedAt=t,
    )


@dataclass(frozen=True)
class TemplateDef:
    id: str
    name: str
    description: str
    factory: Callable[[str, datetime | None], Workflow]


TEMPLATES: list[TemplateDef] = [
    TemplateDef(
        id="mrel_eligibility",
        name="MREL Eligibility Assessment",
        description=(
            "Classify an instrument as MREL-eligible based on prospectus clauses, "
            "subordination, and maturity."
        ),
        factory=mrel_eligibility,
    ),
    TemplateDef(
        id="prospectus_clause_extraction",
        name="Prospectus Clause Extraction",
        description=(
            "Extract relevant clauses (subordination, ranking, maturity, governing law) "
            "from a prospectus PDF."
        ),
        factory=prospectus_clause_extraction,
    ),
    TemplateDef(
        id="instrument_classification",
        name="Instrument Classification",
        description=(
            "Classify a financial instrument by type, ranking, and regulatory bucket."
        ),
        factory=instrument_classification,
    ),
]


def get_template(template_id: str) -> TemplateDef | None:
    return next((t for t in TEMPLATES if t.id == template_id), None)
