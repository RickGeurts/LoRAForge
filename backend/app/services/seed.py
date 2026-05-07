"""First-boot seed data so the dashboard isn't empty on a fresh DB.

Most blocks are idempotent: they insert into a table only when that table
is empty. The dataset block is also idempotent in the other direction —
it deletes superseded mock datasets by id so the registry shows just one
hand-crafted MREL clause example after upgrade.
"""
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models.adapter import Adapter, AdapterTable, EvaluationMetrics
from app.models.dataset import Dataset, DatasetTable
from app.models.run import Run, RunTable
from app.models.task import Task, TaskTable
from app.models.workflow import Workflow, WorkflowTable
from app.services.executor import execute_workflow
from app.services.mrel_clauses_dataset import build_mrel_clause_rows
from app.services.templates import mrel_eligibility

_SEED_TS = datetime(2026, 5, 5, tzinfo=timezone.utc)
_SUPERSEDED_DATASET_IDS = ("ds_mrel_corpus", "ds_clauses_v1")
_MREL_CLAUSE_DATASET_ID = "ds_mrel_clauses"


def _seed_tasks() -> list[Task]:
    return [
        Task(
            id="mrel_classifier",
            name="MREL Eligibility Classifier",
            description=(
                "Decide whether a financial instrument is MREL-eligible based on "
                "subordination, secured status, and effective maturity to first call."
            ),
            promptTemplate=(
                "Briefly assess MREL eligibility for the prospectus '{document}', "
                "given subordination and maturity > 1y are typical eligibility criteria."
            ),
            expectedOutput=(
                "A short eligibility verdict (eligible / not eligible) plus 1-2 "
                "sentences of rationale citing subordination and maturity."
            ),
            nodeGroup="ai",
            defaultBaseModel="llama3.1:8b",
            builtin=True,
            createdAt=_SEED_TS,
            updatedAt=_SEED_TS,
        ),
        Task(
            id="instrument_classifier",
            name="Instrument Classifier",
            description=(
                "Classify a financial instrument by type (Tier 2, AT1, senior "
                "preferred, covered bond, …)."
            ),
            promptTemplate=(
                "Briefly classify the financial instrument described in prospectus "
                "'{document}' (e.g. Tier 2 capital, senior unsecured, covered bond)."
            ),
            expectedOutput="Instrument type label and 1-sentence rationale.",
            nodeGroup="ai",
            defaultBaseModel="llama3.1:8b",
            builtin=True,
            createdAt=_SEED_TS,
            updatedAt=_SEED_TS,
        ),
        Task(
            id="clause_extractor",
            name="Prospectus Clause Extractor",
            description=(
                "Extract clauses relevant to MREL eligibility (subordination, "
                "ranking, maturity, governing law) from a prospectus."
            ),
            promptTemplate=(
                "List the most likely clauses to extract from prospectus '{document}' "
                "that affect MREL eligibility (subordination, ranking, maturity)."
            ),
            expectedOutput=(
                "Bulleted list of clause references with a one-line excerpt each."
            ),
            nodeGroup="ai",
            defaultBaseModel="llama3.1:8b",
            builtin=True,
            createdAt=_SEED_TS,
            updatedAt=_SEED_TS,
        ),
        Task(
            id="validator",
            name="Validator",
            description=(
                "Apply deterministic regulatory rules to a prior node's output. "
                "Not an AI task — this Task entry exists so adapters/datasets can "
                "still reference 'validator' as their type."
            ),
            promptTemplate="",
            expectedOutput="Pass/fail per rule, with a list of failed rule ids.",
            nodeGroup="rules",
            defaultBaseModel="llama3.1:8b",
            builtin=True,
            createdAt=_SEED_TS,
            updatedAt=_SEED_TS,
        ),
        Task(
            id="other",
            name="Other",
            description=(
                "Catch-all for adapters or datasets whose task doesn't fit one of "
                "the named categories."
            ),
            promptTemplate="",
            expectedOutput="",
            nodeGroup="ai",
            defaultBaseModel="llama3.1:8b",
            builtin=True,
            createdAt=_SEED_TS,
            updatedAt=_SEED_TS,
        ),
    ]


def _seed_adapters() -> list[Adapter]:
    return [
        Adapter(
            id="adp_mrel_v1",
            name="MREL Eligibility Classifier",
            baseModel="llama3.1:8b",
            taskType="mrel_classifier",
            version="0.1.0",
            status="draft",
            trainingDataSummary="10 hand-labelled MREL clause excerpts (mock)",
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


def _mrel_clause_dataset() -> Dataset:
    rows = build_mrel_clause_rows()
    return Dataset(
        id=_MREL_CLAUSE_DATASET_ID,
        name="MREL clause eligibility — labelled examples",
        taskType="mrel_classifier",
        sourceType="mock",
        summary=(
            f"{len(rows)} synthetic-but-realistic prospectus clause excerpts "
            "labelled MREL-eligible or not, generated by cross-producting "
            "instrument archetypes × maturities × call options × governing law. "
            "Eligibility follows BRRD/SRMR Article 45b: subordinated, unsecured, "
            "effective maturity to first call ≥ 1 year, issued by the resolution "
            "entity."
        ),
        rowCount=len(rows),
        rows=rows,
        createdAt=_SEED_TS,
    )


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


def _reconcile_datasets(session: Session) -> None:
    # Drop superseded mock datasets if they're still hanging around from an
    # earlier seed. Insert or refresh the canonical MREL clause dataset.
    for old_id in _SUPERSEDED_DATASET_IDS:
        old = session.get(DatasetTable, old_id)
        if old is not None:
            session.delete(old)

    canonical = _mrel_clause_dataset()
    existing = session.get(DatasetTable, _MREL_CLAUSE_DATASET_ID)
    if existing is None:
        session.add(DatasetTable.from_api(canonical))
        return

    # Refresh in place when the row count is below the canonical size so
    # the upgrade from the original 10-row hand-crafted dataset to the
    # generated 200-row dataset takes effect on next boot. We don't
    # overwrite a larger user-edited dataset.
    if existing.row_count < canonical.row_count:
        existing.row_count = canonical.row_count
        existing.rows = canonical.rows
        existing.summary = canonical.summary
        existing.name = canonical.name
        session.add(existing)


def _reconcile_tasks(session: Session) -> None:
    # Insert any builtin task that's missing. Don't overwrite existing rows —
    # users may have edited a builtin's description or prompt template, and
    # we should respect that.
    for task in _seed_tasks():
        if session.get(TaskTable, task.id) is None:
            session.add(TaskTable.from_api(task))


def seed_if_empty(session: Session) -> None:
    _reconcile_tasks(session)
    if session.exec(select(AdapterTable)).first() is None:
        for adapter in _seed_adapters():
            session.add(AdapterTable.from_api(adapter))
    _reconcile_datasets(session)
    if session.exec(select(WorkflowTable)).first() is None:
        for workflow in _seed_workflows():
            session.add(WorkflowTable.from_api(workflow))
    if session.exec(select(RunTable)).first() is None:
        workflows = _seed_workflows()
        for run in _seed_runs(workflows):
            session.add(RunTable.from_api(run))
    session.commit()
