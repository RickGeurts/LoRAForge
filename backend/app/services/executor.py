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

from app.models.adapter import Adapter
from app.models.run import RunOutput, TraceEntry, TraceStatus
from app.models.task import Task
from app.models.workflow import Workflow, WorkflowNode
from app.services import ollama_client

_NODE_STEP_MS = 30
_FALLBACK_ADAPTER_VERSION = "0.1.0"
_AI_SYSTEM_PROMPT = (
    "You are a regulatory analysis assistant for bank resolution workflows. "
    "Be concise and factual. Reply in 1-2 short sentences. Do not speculate."
)


class _PermissiveInputs(dict):
    """format_map dict that returns "" for missing keys.

    Lets users write prompts with placeholders that may not be in the
    runtime inputs (e.g. {clause}) without blowing up the run.
    """

    def __missing__(self, key: str) -> str:  # type: ignore[override]
        return ""


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


def _run_hf_node(
    node: WorkflowNode,
    inputs: dict[str, Any],
    adapter: Adapter,
    task: Task | None,
) -> tuple[TraceStatus, str, str | None, int | None, int | None]:
    """Run inference against the adapter's local LoRA weights via HF.

    Returns (status, summary, model, total_tokens, latency_ms). On any
    failure (missing weights, load error, generation error) falls back to
    the mock summary with a 'warn' status — runs always finish.
    """
    template = task.prompt_template if task else ""
    if not template:
        status, summary = _mock_summary(node, inputs)
        return status, summary, None, None, None

    format_inputs = _PermissiveInputs(inputs)
    format_inputs.setdefault("document", "the input document")
    prompt = template.format_map(format_inputs)

    from app.services import hf_inference

    result = hf_inference.generate(
        prompt=prompt,
        base_model=adapter.base_model,
        weights_path=adapter.weights_path or "",
    )

    prefix = f"[adapter {adapter.id} v{adapter.version} (LoRA on local weights)] "
    if result.error:
        _, mock = _mock_summary(node, inputs)
        return (
            "warn",
            f"[LoRA inference failed: {result.error}] " + mock,
            None,
            None,
            None,
        )

    return (
        "ok",
        prefix + result.response,
        result.model,
        result.total_tokens,
        result.latency_ms,
    )


def _run_ai_node(
    node: WorkflowNode,
    inputs: dict[str, Any],
    model: str | None,
    task: Task | None,
    *,
    prefix: str = "",
) -> tuple[TraceStatus, str, str | None, int | None, int | None]:
    """Call Ollama for AI nodes, falling back to the mock summary on failure.

    `task` is the resolved Task for this node (its prompt template is the
    source of truth). `prefix` lets the caller prepend a short note (e.g.
    base-model fallback warning) to the rendered summary. Returns
    (status, summary, model, total_tokens, latency_ms).
    """
    template = task.prompt_template if task else ""
    if not template:
        status, summary = _mock_summary(node, inputs)
        return status, prefix + summary, None, None, None

    format_inputs = _PermissiveInputs(inputs)
    format_inputs.setdefault("document", "the input document")
    prompt = template.format_map(format_inputs)
    result = ollama_client.generate(prompt, system=_AI_SYSTEM_PROMPT, model=model)

    if result.stub or not result.response:
        status, summary = _mock_summary(node, inputs)
        return status, prefix + summary, None, None, None

    return (
        "ok",
        prefix + result.response,
        result.model,
        result.total_tokens,
        result.latency_ms,
    )


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

    # If any AI step ran with a bound adapter, cite that adapter's version
    # in the audit-relevant decision payload. Otherwise fall back so legacy
    # workflows still produce a sensible value.
    adapter_version = next(
        (entry.adapter_version for entry in trace if entry.adapter_version),
        _FALLBACK_ADAPTER_VERSION,
    )

    return RunOutput(
        decision=decision,
        confidence=confidence,
        explanation=explanation,
        sources=sources,
        adapterVersion=adapter_version,
        workflowVersion=workflow.version,
        timestamp=timestamp,
    )


def execute_workflow(
    workflow: Workflow,
    inputs: dict[str, Any],
    *,
    started_at: datetime | None = None,
    use_ollama: bool | None = None,
    adapters: dict[str, Adapter] | None = None,
    tasks: dict[str, Task] | None = None,
) -> tuple[str, RunOutput, list[TraceEntry], datetime]:
    """Run a workflow against inputs.

    `use_ollama` defaults to whether the local runtime is reachable. Pass
    False explicitly (e.g. seed-time) to keep the executor deterministic.

    `adapters` is the live registry, keyed by id. Used to resolve
    workflow-node bindings: an AI node's `adapter_id` selects the base
    model and is recorded in the trace for audit. When omitted, AI nodes
    behave as before (global default model, no adapter citation).

    `tasks` is the live Task registry, keyed by id. AI nodes look up
    `tasks[node.type].prompt_template` to build the Ollama prompt. When
    omitted or the lookup misses, the node falls back to the mock summary.

    Returns (status, output, trace, finished_at).
    """
    started = started_at or datetime.now(timezone.utc)
    adapters = adapters or {}
    tasks = tasks or {}
    if use_ollama is None:
        status_info = ollama_client.get_status()
        use_ollama = bool(status_info.get("reachable"))

    installed_names: set[str] = set()
    fallback_model: str | None = None
    if use_ollama:
        # Prefer the configured default if it's installed; otherwise pick the
        # first available model so we never call generate() with a name Ollama
        # rejects.
        installed = ollama_client.list_models()
        installed_names = {
            str(m.get("name") or "") for m in installed if not m.get("stub")
        }
        if ollama_client.OLLAMA_DEFAULT_MODEL in installed_names:
            fallback_model = ollama_client.OLLAMA_DEFAULT_MODEL
        elif installed_names:
            fallback_model = next(iter(installed_names))
        else:
            use_ollama = False

    trace: list[TraceEntry] = []
    cursor = started
    for node in _topological_order(workflow):
        node_started = cursor
        adapter = adapters.get(node.adapter_id) if node.adapter_id else None
        adapter_id = adapter.id if adapter else None
        adapter_version = adapter.version if adapter else None

        if (
            node.group == "ai"
            and adapter is not None
            and adapter.weights_path
        ):
            # Trained LoRA bound — route through HF inference. Bypasses the
            # Ollama installed-models check entirely; the adapter knows its
            # own base model.
            task = tasks.get(node.type)
            status, summary, model, tokens, latency_ms = _run_hf_node(
                node, inputs, adapter, task
            )
            step_ms = latency_ms if latency_ms is not None else _NODE_STEP_MS
        elif use_ollama and node.group == "ai":
            base_model, status_override, prefix = _resolve_ai_model(
                node, adapter, fallback_model, installed_names
            )
            task = tasks.get(node.type)
            status, summary, model, tokens, latency_ms = _run_ai_node(
                node, inputs, base_model, task, prefix=prefix
            )
            if status_override is not None:
                status = status_override
            step_ms = latency_ms if latency_ms is not None else _NODE_STEP_MS
        else:
            status, summary = _mock_summary(node, inputs)
            if node.adapter_id and adapter is None:
                # Binding points at a deleted adapter — surface it.
                status = "warn"
                summary = (
                    f"[binding broken: adapter {node.adapter_id!r} not in registry] "
                    + summary
                )
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
                adapterId=adapter_id,
                adapterVersion=adapter_version,
            )
        )

    output = _build_output(workflow, trace, cursor)
    final_status = (
        "needs_review"
        if any(entry.status == "warn" for entry in trace)
        else "completed"
    )
    return final_status, output, trace, cursor


def _resolve_ai_model(
    node: WorkflowNode,
    adapter: Adapter | None,
    fallback_model: str | None,
    installed_names: set[str],
) -> tuple[str | None, TraceStatus | None, str]:
    """Pick the base model for an AI node and build any summary prefix.

    Returns (model_name, forced_status_or_none, summary_prefix).
    """
    # No binding — keep the previous behaviour.
    if adapter is None:
        if node.adapter_id:
            return (
                fallback_model,
                "warn",
                f"[binding broken: adapter {node.adapter_id!r} not in registry] ",
            )
        return fallback_model, None, ""

    # Adapter exists. Prefer its baseModel, but only if Ollama actually has
    # that model installed; otherwise warn and fall back so the run still
    # completes.
    if adapter.base_model in installed_names:
        return adapter.base_model, None, f"[adapter {adapter.id} v{adapter.version}] "
    return (
        fallback_model,
        "warn",
        f"[adapter {adapter.id} requires base model {adapter.base_model!r}, "
        f"not installed — falling back to {fallback_model!r}] ",
    )
