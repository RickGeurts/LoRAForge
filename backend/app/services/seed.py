"""First-boot seed data so the dashboard isn't empty on a fresh DB.

Idempotent: each block only inserts if its table is empty, so this is safe
to run on every startup.
"""
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models.adapter import Adapter, AdapterTable, EvaluationMetrics
from app.models.run import Run, RunOutput, RunTable
from app.models.workflow import (
    NodePosition,
    Workflow,
    WorkflowEdge,
    WorkflowNode,
    WorkflowTable,
)

_SEED_TS = datetime(2026, 5, 5, tzinfo=timezone.utc)


def _seed_adapters() -> list[Adapter]:
    return [
        Adapter(
            id="adp_mrel_v1",
            name="MREL Eligibility Classifier",
            baseModel="llama3.1:8b",
            taskType="mrel_classifier",
            version="0.1.0",
            status="draft",
            trainingDataSummary="120 annotated MREL prospectus excerpts (mock)",
            evaluationMetrics=EvaluationMetrics(accuracy=0.0, notes="not yet trained"),
            createdAt=_SEED_TS,
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
            createdAt=_SEED_TS,
        ),
    ]


def _seed_workflows() -> list[Workflow]:
    return [
        Workflow(
            id="wf_mrel_template",
            name="MREL Eligibility Assessment",
            version="0.1.0",
            description="Prospectus → Extract → Classify → Validate → Review → Output",
            nodes=[
                WorkflowNode(id="n1", type="prospectus_loader", group="documents", label="Prospectus Loader", position=NodePosition(x=40, y=80)),
                WorkflowNode(id="n2", type="clause_extractor", group="ai", label="Clause Extractor", position=NodePosition(x=260, y=80)),
                WorkflowNode(id="n3", type="mrel_classifier", group="ai", label="MREL Classifier", position=NodePosition(x=480, y=80)),
                WorkflowNode(id="n4", type="validator", group="rules", label="Validator", position=NodePosition(x=700, y=80)),
                WorkflowNode(id="n5", type="confidence_filter", group="rules", label="Confidence Filter", position=NodePosition(x=920, y=80)),
                WorkflowNode(id="n6", type="human_review", group="logic", label="Human Review", position=NodePosition(x=1140, y=80)),
                WorkflowNode(id="n7", type="decision_output", group="output", label="Decision Output", position=NodePosition(x=1360, y=80)),
            ],
            edges=[
                WorkflowEdge(id="e1", source="n1", target="n2"),
                WorkflowEdge(id="e2", source="n2", target="n3"),
                WorkflowEdge(id="e3", source="n3", target="n4"),
                WorkflowEdge(id="e4", source="n4", target="n5"),
                WorkflowEdge(id="e5", source="n5", target="n6"),
                WorkflowEdge(id="e6", source="n6", target="n7"),
            ],
            createdAt=_SEED_TS,
            updatedAt=_SEED_TS,
        ),
    ]


def _seed_runs() -> list[Run]:
    return [
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
                timestamp=_SEED_TS,
            ),
            startedAt=_SEED_TS,
            finishedAt=_SEED_TS,
        ),
    ]


def seed_if_empty(session: Session) -> None:
    if session.exec(select(AdapterTable)).first() is None:
        for adapter in _seed_adapters():
            session.add(AdapterTable.from_api(adapter))
    if session.exec(select(WorkflowTable)).first() is None:
        for workflow in _seed_workflows():
            session.add(WorkflowTable.from_api(workflow))
    if session.exec(select(RunTable)).first() is None:
        for run in _seed_runs():
            session.add(RunTable.from_api(run))
    session.commit()
