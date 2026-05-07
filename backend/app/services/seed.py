"""First-boot seed data so the dashboard isn't empty on a fresh DB.

Idempotent: each block only inserts if its table is empty, so this is safe
to run on every startup.
"""
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models.adapter import Adapter, AdapterTable, EvaluationMetrics
from app.models.dataset import Dataset, DatasetTable
from app.models.run import Run, RunTable
from app.models.workflow import Workflow, WorkflowTable
from app.services.executor import execute_workflow
from app.services.templates import mrel_eligibility

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


def _seed_datasets() -> list[Dataset]:
    return [
        Dataset(
            id="ds_mrel_corpus",
            name="MREL annotated prospectus corpus",
            taskType="mrel_classifier",
            sourceType="mock",
            summary=(
                "120 prospectus excerpts hand-labelled for MREL eligibility, "
                "with subordination clause, ranking, and maturity annotations."
            ),
            rowCount=120,
            createdAt=_SEED_TS,
        ),
        Dataset(
            id="ds_clauses_v1",
            name="Prospectus clause snippets",
            taskType="clause_extractor",
            sourceType="mock",
            summary="450 short snippets tagged with clause type (subordination/ranking/maturity).",
            rowCount=450,
            createdAt=_SEED_TS,
        ),
    ]


def _seed_workflows() -> list[Workflow]:
    return [mrel_eligibility(workflow_id="wf_mrel_template", ts=_SEED_TS)]


def _seed_runs(workflows: list[Workflow]) -> list[Run]:
    template = next((w for w in workflows if w.id == "wf_mrel_template"), None)
    if template is None:
        return []
    inputs = {"document": "sample_prospectus.pdf"}
    final_status, output, trace, finished_at = execute_workflow(
        template, inputs, started_at=_SEED_TS, use_ollama=False
    )
    return [
        Run(
            id="run_001",
            workflowId=template.id,
            workflowVersion=template.version,
            status=final_status,  # type: ignore[arg-type]
            inputs=inputs,
            output=output,
            trace=trace,
            startedAt=_SEED_TS,
            finishedAt=finished_at,
        ),
    ]


def seed_if_empty(session: Session) -> None:
    if session.exec(select(AdapterTable)).first() is None:
        for adapter in _seed_adapters():
            session.add(AdapterTable.from_api(adapter))
    if session.exec(select(DatasetTable)).first() is None:
        for dataset in _seed_datasets():
            session.add(DatasetTable.from_api(dataset))
    if session.exec(select(WorkflowTable)).first() is None:
        for workflow in _seed_workflows():
            session.add(WorkflowTable.from_api(workflow))
    if session.exec(select(RunTable)).first() is None:
        workflows = _seed_workflows()
        for run in _seed_runs(workflows):
            session.add(RunTable.from_api(run))
    session.commit()
