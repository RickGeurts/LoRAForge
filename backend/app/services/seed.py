"""First-boot seed data so the dashboard isn't empty on a fresh DB.

Most blocks are idempotent: they insert into a table only when that table
is empty. The dataset block is also idempotent in the other direction —
it deletes superseded mock datasets by id so the registry shows just one
hand-crafted MREL clause example after upgrade.
"""
from datetime import datetime, timezone
from pathlib import Path

from sqlmodel import Session, select

from app.models.adapter import Adapter, AdapterTable, EvaluationMetrics
from app.models.dataset import Dataset, DatasetTable
from app.models.run import Run, RunTable
from app.models.task import Task, TaskTable
from app.models.workflow import Workflow, WorkflowTable
from app.services.executor import execute_workflow
from app.services.mrel_clauses_dataset import build_mrel_clause_rows
from app.services.templates import mrel_eligibility

_SAMPLE_DOCS_DIR = (
    Path(__file__).resolve().parent.parent.parent / "data" / "sample-documents"
)

_SAMPLE_DOCUMENTS: dict[str, str] = {
    "tier2_2031.txt": (
        "PROSPECTUS — EUR 750,000,000 Subordinated Notes due 2031\n"
        "Issuer: ResolutionCo plc (resolution entity of the Group). "
        "ISIN: XS2031000001.\n\n"
        "§3 Status: The Notes constitute direct, unsecured and subordinated "
        "obligations of the Issuer ranking pari passu among themselves and "
        "behind the claims of all senior creditors.\n\n"
        "§4.1 Maturity: The Notes mature on 30 November 2031.\n\n"
        "§4.3 Optional redemption: The Issuer may redeem the Notes in whole "
        "following a Regulatory Event after the Reset Date, falling five "
        "years after issuance.\n\n"
        "§5.2 Ranking: In the event of resolution or winding-up, the Notes "
        "rank junior to all Senior Preferred and Senior Non-Preferred "
        "liabilities and senior only to Additional Tier 1 instruments.\n\n"
        "§7 Governing Law: English law.\n\n"
        "§9 Issuer: ResolutionCo plc, the resolution entity of the Group."
    ),
    "senior_pref_2028.txt": (
        "PROSPECTUS — EUR 1,000,000,000 Senior Preferred Notes due 2028\n"
        "Issuer: ResolutionCo plc. ISIN: XS2028000002.\n\n"
        "§3 Status: The Notes constitute direct, unsecured and unsubordinated "
        "obligations of the Issuer and rank pari passu with all other "
        "unsubordinated obligations.\n\n"
        "§4.1 Maturity: The Notes mature on 15 March 2028.\n\n"
        "§4.3 Optional redemption: The Notes are not redeemable at the option "
        "of the Issuer prior to maturity, save for tax events.\n\n"
        "§5.2 Ranking: In the event of resolution, the Notes rank senior to "
        "Senior Non-Preferred and Tier 2 liabilities and pari passu with "
        "general senior creditors.\n\n"
        "§7 Governing Law: English law.\n\n"
        "§9 Issuer: ResolutionCo plc, the resolution entity of the Group."
    ),
    "covered_2030.txt": (
        "PROSPECTUS — EUR 500,000,000 Covered Bonds due 2030\n"
        "Issuer: ResolutionCo Mortgage Bank S.A. ISIN: XS2030000003.\n\n"
        "§3 Status: The Covered Bonds are secured obligations of the Issuer, "
        "backed by a dynamic cover pool of residential mortgage loans pursuant "
        "to applicable Covered Bond legislation.\n\n"
        "§4.1 Maturity: The Covered Bonds mature on 1 June 2030, with a "
        "12-month extendible maturity provision.\n\n"
        "§5.2 Ranking: The Covered Bonds rank pari passu among themselves and "
        "benefit from preferential claim on the cover pool assets.\n\n"
        "§7 Governing Law: Luxembourg law.\n\n"
        "§9 Issuer: ResolutionCo Mortgage Bank S.A., a wholly-owned subsidiary "
        "specialised in mortgage funding (not the resolution entity)."
    ),
}


_SAMPLE_DOCX_NAME = "at1_perpetual.docx"
_SAMPLE_DOCX_PARAGRAPHS = (
    "PROSPECTUS — EUR 500,000,000 AT1 Capital Notes",
    "Issuer: ResolutionCo plc. ISIN: XS_TEST_AT1.",
    "§3 Status: The Notes constitute deeply subordinated obligations of the "
    "Issuer ranking junior to Tier 2 instruments.",
    "§4.1 Maturity: The Notes are perpetual and have no fixed maturity date.",
    "§4.3 Optional redemption: The Issuer may redeem the Notes on any Reset "
    "Date subject to regulatory approval.",
    "§7 Governing Law: English law.",
    "§9 Issuer: ResolutionCo plc, the resolution entity of the Group.",
)


def _write_sample_docx(target: "Path") -> None:
    """Best-effort: write a .docx fixture so the parser path is demoable.

    Imported lazily — if python-docx isn't installed we skip silently
    rather than crash at boot. The text fixtures still work.
    """
    try:
        from docx import Document
    except ImportError:
        return
    doc = Document()
    for paragraph in _SAMPLE_DOCX_PARAGRAPHS:
        doc.add_paragraph(paragraph)
    doc.save(str(target))


def _write_sample_documents() -> None:
    """Create the sample-documents directory on disk and populate it.

    Files are only written if missing — analysts can edit them freely.
    """
    _SAMPLE_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    for filename, content in _SAMPLE_DOCUMENTS.items():
        target = _SAMPLE_DOCS_DIR / filename
        if not target.exists():
            target.write_text(content, encoding="utf-8")
    docx_target = _SAMPLE_DOCS_DIR / _SAMPLE_DOCX_NAME
    if not docx_target.exists():
        _write_sample_docx(docx_target)

_SEED_TS = datetime(2026, 5, 5, tzinfo=timezone.utc)
_SUPERSEDED_DATASET_IDS = ("ds_mrel_corpus", "ds_clauses_v1")
_MREL_CLAUSE_DATASET_ID = "ds_mrel_clauses"


_MREL_PROMPT_V1 = (
    "Briefly assess MREL eligibility for the prospectus '{document}', "
    "given subordination and maturity > 1y are typical eligibility criteria."
)
_MREL_PROMPT_V2 = (
    "Classify the following clause excerpts for MREL eligibility "
    "(eligible / not_eligible). Eligibility requires: subordinated "
    "(subordinated, SNP, AT1), unsecured, effective maturity to first call "
    "≥ 1 year, issued by the resolution entity.\n\n"
    "Clauses:\n{clauses}\n\nVerdict:"
)

_INSTRUMENT_PROMPT_V1 = (
    "Briefly classify the financial instrument described in prospectus "
    "'{document}' (e.g. Tier 2 capital, senior unsecured, covered bond)."
)
_INSTRUMENT_PROMPT_V2_LEGACY = (
    "Classify the financial instrument described in the following "
    "prospectus excerpt (e.g. Tier 2 capital, senior unsecured, AT1, "
    "covered bond):\n\n{prospectus_text}\n\nInstrument type:"
)
_INSTRUMENT_PROMPT_V3 = (
    "Classify the financial instrument described in the following "
    "document excerpt (e.g. Tier 2 capital, senior unsecured, AT1, "
    "covered bond):\n\n{document_text}\n\nInstrument type:"
)

_CLAUSE_PROMPT_V1 = (
    "List the most likely clauses to extract from prospectus '{document}' "
    "that affect MREL eligibility (subordination, ranking, maturity)."
)
_CLAUSE_PROMPT_V2_LEGACY = (
    "Extract the clauses from the following prospectus excerpt that "
    "affect MREL eligibility (subordination, ranking, maturity, "
    "governing law). Quote each clause briefly.\n\n{prospectus_text}\n\n"
    "Relevant clauses:"
)
_CLAUSE_PROMPT_V3 = (
    "Extract the clauses from the following document excerpt that "
    "affect MREL eligibility (subordination, ranking, maturity, "
    "governing law). Quote each clause briefly.\n\n{document_text}\n\n"
    "Relevant clauses:"
)

# Templates that are safe to upgrade in place: any builtin task whose
# prompt_template matches one of these strings was never user-edited.
_UPGRADABLE_PROMPTS: dict[str, set[str]] = {
    "mrel_classifier": {_MREL_PROMPT_V1},
    "instrument_classifier": {_INSTRUMENT_PROMPT_V1, _INSTRUMENT_PROMPT_V2_LEGACY},
    "clause_extractor": {_CLAUSE_PROMPT_V1, _CLAUSE_PROMPT_V2_LEGACY},
}


def _seed_tasks() -> list[Task]:
    return [
        Task(
            id="mrel_classifier",
            name="MREL Eligibility Classifier",
            description=(
                "Decide whether a financial instrument is MREL-eligible based on "
                "subordination, secured status, and effective maturity to first call."
            ),
            promptTemplate=_MREL_PROMPT_V2,
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
            promptTemplate=_INSTRUMENT_PROMPT_V3,
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
            promptTemplate=_CLAUSE_PROMPT_V3,
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
    wf = mrel_eligibility(workflow_id="wf_mrel_template", ts=_SEED_TS)
    docs_path = str(_SAMPLE_DOCS_DIR)
    for node in wf.nodes:
        if node.type == "document_handler":
            node.config = {**node.config, "path": docs_path}
    return [wf]


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
    # Insert any builtin task that's missing, and upgrade prompt templates
    # that still match a known-old default. User edits are preserved
    # (anything off the upgradable allow-list is left alone).
    for task in _seed_tasks():
        existing = session.get(TaskTable, task.id)
        if existing is None:
            session.add(TaskTable.from_api(task))
            continue
        upgrade_from = _UPGRADABLE_PROMPTS.get(task.id, set())
        if existing.prompt_template in upgrade_from:
            existing.prompt_template = task.prompt_template
            existing.updated_at = _SEED_TS
            session.add(existing)


def _migrate_legacy_workflow_nodes(session: Session) -> None:
    """One-time cleanup of workflow node config.

    1. Rename prospectus_loader → document_handler (with sample path).
    2. Strip the now-defunct `filename` key from document_handler config
       (Document Handler loads the whole folder).
    """
    docs_path = str(_SAMPLE_DOCS_DIR)
    for wf_row in session.exec(select(WorkflowTable)).all():
        rewrote = False
        new_nodes: list[dict] = []
        for n in wf_row.nodes or []:
            if n.get("type") == "prospectus_loader":
                rewrote = True
                new_nodes.append({
                    **n,
                    "type": "document_handler",
                    "label": "Document Handler",
                    "config": {
                        **{
                            k: v
                            for k, v in (n.get("config") or {}).items()
                            if k not in ("prospectus_id", "filename")
                        },
                        "path": docs_path,
                    },
                })
            elif n.get("type") == "document_handler" and "filename" in (
                n.get("config") or {}
            ):
                rewrote = True
                new_nodes.append({
                    **n,
                    "config": {
                        k: v
                        for k, v in (n.get("config") or {}).items()
                        if k != "filename"
                    },
                })
            else:
                new_nodes.append(n)
        if rewrote:
            wf_row.nodes = new_nodes
            session.add(wf_row)


def seed_if_empty(session: Session) -> None:
    _write_sample_documents()
    _reconcile_tasks(session)
    if session.exec(select(AdapterTable)).first() is None:
        for adapter in _seed_adapters():
            session.add(AdapterTable.from_api(adapter))
    _reconcile_datasets(session)
    if session.exec(select(WorkflowTable)).first() is None:
        for workflow in _seed_workflows():
            session.add(WorkflowTable.from_api(workflow))
    _migrate_legacy_workflow_nodes(session)
    if session.exec(select(RunTable)).first() is None:
        workflows = _seed_workflows()
        for run in _seed_runs(workflows):
            session.add(RunTable.from_api(run))
    session.commit()
