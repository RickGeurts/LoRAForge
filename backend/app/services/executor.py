"""Mock workflow executor.

This is a deterministic stand-in for real LoRA inference. It walks the
workflow's nodes in topological order, emits a per-node trace entry,
then synthesises a final RunOutput based on which node types are present.
The point is not realism — it's giving the audit/review surfaces real
data to render against until milestone 6 wires up Ollama.
"""
from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.run import RunOutput, TraceEntry, TraceStatus
from app.models.workflow import Workflow, WorkflowNode

_NODE_STEP_MS = 30
_FALLBACK_ADAPTER_VERSION = "0.1.0"


def _topological_order(workflow: Workflow) -> list[WorkflowNode]:
    by_id = {n.id: n for n in workflow.nodes}
    indegree: dict[str, int] = defaultdict(int)
    adj: dict[str, list[str]] = defaultdict(list)
    for n in workflow.nodes:
        indegree[n.id] = indegree.get(n.id, 0)
    for e in workflow.edges:
        if e.source in by_id and e.target in by_id:
            adj[e.source].append(e.target)
            indegree[e.target] += 1

    queue: deque[str] = deque(
        n.id for n in workflow.nodes if indegree[n.id] == 0
    )
    ordered: list[WorkflowNode] = []
    seen: set[str] = set()
    while queue:
        nid = queue.popleft()
        if nid in seen:
            continue
        seen.add(nid)
        ordered.append(by_id[nid])
        for nxt in adj[nid]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)

    # Cycle leftovers — append in insertion order so the run still produces
    # a trace; validation should have caught this on the client.
    if len(ordered) != len(workflow.nodes):
        for n in workflow.nodes:
            if n.id not in seen:
                ordered.append(n)
    return ordered


def _node_summary(node: WorkflowNode, inputs: dict[str, Any]) -> tuple[TraceStatus, str]:
    doc = inputs.get("document") or "input document"
    summaries: dict[str, tuple[TraceStatus, str]] = {
        "prospectus_loader": ("ok", f"Loaded prospectus '{doc}'."),
        "pdf_extractor": ("ok", "Extracted 24 pages of text."),
        "clause_extractor": (
            "ok",
            "Found 3 clauses: subordination (§4.2), ranking (§5.1), maturity (§6.1).",
        ),
        "mrel_classifier": ("ok", "Classified as MREL-eligible (0.87)."),
        "instrument_classifier": ("ok", "Classified as Tier 2 capital instrument (0.82)."),
        "validator": ("ok", "Checked 5 regulatory rules — all passed."),
        "confidence_filter": ("ok", "Confidence 0.87 ≥ threshold 0.80 → passed."),
        "router": ("ok", "Routed to standard review branch."),
        "human_review": ("warn", "Flagged for human review (mock: auto-approved)."),
        "decision_output": ("ok", "Emitted decision payload."),
        "report_generator": ("ok", "Generated 1-page summary report."),
    }
    return summaries.get(node.type, ("ok", f"Executed {node.type}."))


def _build_output(
    workflow: Workflow,
    trace: list[TraceEntry],
    timestamp: datetime,
) -> RunOutput:
    types = {entry.node_type for entry in trace}
    if "mrel_classifier" in types:
        decision, confidence = "MREL-eligible", 0.87
    elif "instrument_classifier" in types:
        decision, confidence = "Tier 2 capital instrument", 0.82
    elif "clause_extractor" in types:
        decision, confidence = "3 clauses extracted", 0.91
    else:
        decision, confidence = "Processed", 0.80

    sources = (
        ["page 12 §4.2", "page 18 §6.1"]
        if "prospectus_loader" in types or "pdf_extractor" in types
        else []
    )

    explanation = " ".join(
        entry.summary for entry in trace if entry.status != "warn"
    ) or "Workflow executed without notable findings."

    return RunOutput(
        decision=decision,
        confidence=confidence,
        explanation=explanation,
        sources=sources,
        adapterVersion=_FALLBACK_ADAPTER_VERSION,
        workflowVersion=workflow.version,
        timestamp=timestamp,
    )


def execute_workflow(
    workflow: Workflow,
    inputs: dict[str, Any],
    *,
    started_at: datetime | None = None,
) -> tuple[str, RunOutput, list[TraceEntry], datetime]:
    """Run a workflow against inputs.

    Returns (status, output, trace, finished_at).
    """
    started = started_at or datetime.now(timezone.utc)
    trace: list[TraceEntry] = []
    cursor = started
    for node in _topological_order(workflow):
        node_started = cursor
        cursor = cursor + timedelta(milliseconds=_NODE_STEP_MS)
        status, summary = _node_summary(node, inputs)
        trace.append(
            TraceEntry(
                nodeId=node.id,
                nodeType=node.type,
                label=node.label,
                group=node.group,
                status=status,
                summary=summary,
                startedAt=node_started,
                finishedAt=cursor,
            )
        )

    output = _build_output(workflow, trace, cursor)
    final_status = (
        "needs_review"
        if any(entry.status == "warn" for entry in trace)
        else "completed"
    )
    return final_status, output, trace, cursor
