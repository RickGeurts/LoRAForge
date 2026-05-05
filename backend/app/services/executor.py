"""Workflow executor.

Walks the workflow's nodes in topological order, emits a per-node trace
entry, and synthesises a final RunOutput. AI-group nodes call Ollama
when it's reachable so the trace records real model+token usage; on any
failure (Ollama down, slow, error response) the node falls back to a
deterministic mock summary so runs always finish.

Decision and confidence remain rule-based for now: free-form LLM output
isn't a regulatory decision source — it's an audit-relevant intermediate.
"""
from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.run import RunOutput, TraceEntry, TraceStatus
from app.models.workflow import Workflow, WorkflowNode
from app.services import ollama_client

_NODE_STEP_MS = 30
_FALLBACK_ADAPTER_VERSION = "0.1.0"
_AI_SYSTEM_PROMPT = (
    "You are a regulatory analysis assistant for bank resolution workflows. "
    "Be concise and factual. Reply in 1-2 short sentences. Do not speculate."
)
_AI_PROMPTS: dict[str, str] = {
    "clause_extractor": (
        "List the most likely clauses to extract from prospectus '{document}' "
        "that affect MREL eligibility (subordination, ranking, maturity)."
    ),
    "mrel_classifier": (
        "Briefly assess MREL eligibility for the prospectus '{document}', "
        "given subordination and maturity > 1y are typical eligibility criteria."
    ),
    "instrument_classifier": (
        "Briefly classify the financial instrument described in prospectus "
        "'{document}' (e.g. Tier 2 capital, senior unsecured, covered bond)."
    ),
}


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


def _mock_summary(node: WorkflowNode, inputs: dict[str, Any]) -> tuple[TraceStatus, str]:
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


def _run_ai_node(
    node: WorkflowNode,
    inputs: dict[str, Any],
    model: str | None,
) -> tuple[TraceStatus, str, str | None, int | None, int | None]:
    """Call Ollama for AI nodes, falling back to the mock summary on failure.

    Returns (status, summary, model, total_tokens, latency_ms).
    """
    template = _AI_PROMPTS.get(node.type)
    if template is None:
        status, summary = _mock_summary(node, inputs)
        return status, summary, None, None, None

    document = str(inputs.get("document") or "the input document")
    prompt = template.format(document=document)
    result = ollama_client.generate(prompt, system=_AI_SYSTEM_PROMPT, model=model)

    if result.stub or not result.response:
        status, summary = _mock_summary(node, inputs)
        return status, summary, None, None, None

    return ("ok", result.response, result.model, result.total_tokens, result.latency_ms)


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
    use_ollama: bool | None = None,
) -> tuple[str, RunOutput, list[TraceEntry], datetime]:
    """Run a workflow against inputs.

    `use_ollama` defaults to whether the local runtime is reachable. Pass
    False explicitly (e.g. seed-time) to keep the executor deterministic.

    Returns (status, output, trace, finished_at).
    """
    started = started_at or datetime.now(timezone.utc)
    chosen_model: str | None = None
    if use_ollama is None:
        status_info = ollama_client.get_status()
        use_ollama = bool(status_info.get("reachable"))
    if use_ollama:
        # Prefer the configured default if it's installed; otherwise pick the
        # first available model so we never call generate() with a name Ollama
        # rejects.
        installed = ollama_client.list_models()
        installed_names = {m.get("name") for m in installed if not m.get("stub")}
        if ollama_client.OLLAMA_DEFAULT_MODEL in installed_names:
            chosen_model = ollama_client.OLLAMA_DEFAULT_MODEL
        elif installed_names:
            chosen_model = next(iter(installed_names))
        else:
            use_ollama = False

    trace: list[TraceEntry] = []
    cursor = started
    for node in _topological_order(workflow):
        node_started = cursor
        if use_ollama and node.group == "ai":
            status, summary, model, tokens, latency_ms = _run_ai_node(
                node, inputs, chosen_model
            )
            # Use real wall-clock latency if we have it; otherwise step ms.
            step_ms = latency_ms if latency_ms is not None else _NODE_STEP_MS
        else:
            status, summary = _mock_summary(node, inputs)
            model, tokens, latency_ms = None, None, None
            step_ms = _NODE_STEP_MS

        cursor = cursor + timedelta(milliseconds=step_ms)
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
                model=model,
                totalTokens=tokens,
                latencyMs=latency_ms,
            )
        )

    output = _build_output(workflow, trace, cursor)
    final_status = (
        "needs_review"
        if any(entry.status == "warn" for entry in trace)
        else "completed"
    )
    return final_status, output, trace, cursor
