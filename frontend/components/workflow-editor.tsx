"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  Handle,
  Position,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";

import {
  api,
  type Adapter,
  type NodeGroup,
  type Workflow as ApiWorkflow,
} from "@/lib/api";

type PaletteItem = { group: NodeGroup; type: string; label: string };

const PALETTE: PaletteItem[] = [
  { group: "documents", type: "prospectus_loader", label: "Prospectus Loader" },
  { group: "documents", type: "pdf_extractor", label: "PDF Extractor" },
  { group: "ai", type: "clause_extractor", label: "Clause Extractor" },
  { group: "ai", type: "mrel_classifier", label: "MREL Classifier" },
  { group: "ai", type: "instrument_classifier", label: "Instrument Classifier" },
  { group: "rules", type: "validator", label: "Validator" },
  { group: "rules", type: "confidence_filter", label: "Confidence Filter" },
  { group: "logic", type: "router", label: "Router" },
  { group: "logic", type: "human_review", label: "Human Review" },
  { group: "output", type: "decision_output", label: "Decision Output" },
  { group: "output", type: "report_generator", label: "Report Generator" },
];

const GROUP_ORDER: NodeGroup[] = ["documents", "ai", "rules", "logic", "output"];

const GROUP_LABELS: Record<NodeGroup, string> = {
  documents: "Documents",
  ai: "AI",
  rules: "Rules",
  logic: "Logic",
  output: "Output",
};

const GROUP_TONE: Record<NodeGroup, { border: string; bg: string; dot: string }> = {
  documents: {
    border: "border-sky-300 dark:border-sky-800",
    bg: "bg-sky-50 dark:bg-sky-950/40",
    dot: "bg-sky-500",
  },
  ai: {
    border: "border-violet-300 dark:border-violet-800",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    dot: "bg-violet-500",
  },
  rules: {
    border: "border-amber-300 dark:border-amber-800",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    dot: "bg-amber-500",
  },
  logic: {
    border: "border-pink-300 dark:border-pink-800",
    bg: "bg-pink-50 dark:bg-pink-950/40",
    dot: "bg-pink-500",
  },
  output: {
    border: "border-emerald-300 dark:border-emerald-800",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    dot: "bg-emerald-500",
  },
};

const DRAG_MIME = "application/loraforge-node";

type FlowNodeData = {
  group: NodeGroup;
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
  adapterId: string | null;
  // Display-only — set during workflowToFlow so the node card can show
  // a human-readable badge without redoing the lookup on every render.
  adapterLabel: string | null;
};

type FlowNode = Node<FlowNodeData, "loraforge">;

function LoraForgeNode({ data }: NodeProps<FlowNode>) {
  const tone = GROUP_TONE[data.group];
  return (
    <div
      className={`rounded-md border ${tone.border} ${tone.bg} px-3 py-2 shadow-sm min-w-[160px]`}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-400" />
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${tone.dot}`} />
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          {GROUP_LABELS[data.group]}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {data.label}
      </p>
      <p className="text-[10px] font-mono text-zinc-500">{data.nodeType}</p>
      {data.adapterId ? (
        <p className="mt-1 text-[10px] font-mono text-zinc-700 dark:text-zinc-300 bg-white/60 dark:bg-zinc-900/60 rounded px-1 py-0.5 truncate max-w-[180px]">
          ⚡ {data.adapterLabel ?? data.adapterId}
        </p>
      ) : data.group === "ai" ? (
        <p className="mt-1 text-[10px] text-zinc-400 italic">no adapter bound</p>
      ) : null}
      <Handle type="source" position={Position.Right} className="!bg-zinc-400" />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { loraforge: LoraForgeNode };
const EDGE_TYPES: EdgeTypes = {};

function autoPosition(index: number): { x: number; y: number } {
  return { x: 40 + (index % 6) * 220, y: 80 + Math.floor(index / 6) * 140 };
}

function adapterLabelFor(
  id: string | null,
  adapters: Adapter[],
): string | null {
  if (!id) return null;
  const a = adapters.find((x) => x.id === id);
  return a ? `${a.name} v${a.version}` : id;
}

function workflowToFlow(
  workflow: ApiWorkflow,
  adapters: Adapter[],
): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = workflow.nodes.map((n, i) => ({
    id: n.id,
    type: "loraforge",
    position: n.position ?? autoPosition(i),
    data: {
      group: n.group,
      label: n.label,
      nodeType: n.type,
      config: n.config,
      adapterId: n.adapterId ?? null,
      adapterLabel: adapterLabelFor(n.adapterId ?? null, adapters),
    },
  }));
  const edges: Edge[] = workflow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
  return { nodes, edges };
}

function flowToWorkflow(
  base: ApiWorkflow,
  nodes: FlowNode[],
  edges: Edge[],
): ApiWorkflow {
  return {
    ...base,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      group: n.data.group,
      label: n.data.label,
      config: n.data.config,
      position: { x: n.position.x, y: n.position.y },
      adapterId: n.data.adapterId,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
    updatedAt: new Date().toISOString(),
  };
}

function hasCycle(nodes: FlowNode[], edges: Edge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.source)?.push(e.target);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.id, WHITE);

  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && visit(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const n of nodes) {
    if (color.get(n.id) === WHITE && visit(n.id)) return true;
  }
  return false;
}

function validate(nodes: FlowNode[], edges: Edge[]): string | null {
  if (nodes.length === 0) return "Workflow is empty.";
  if (!nodes.some((n) => n.data.group === "documents"))
    return "Workflow must have at least one input node (Documents group).";
  if (!nodes.some((n) => n.data.group === "output"))
    return "Workflow must have at least one output node (Output group).";
  if (hasCycle(nodes, edges))
    return "Workflow has a cycle. Remove the back-edge before saving.";
  return null;
}

export function WorkflowEditor({
  workflow,
  adapters,
}: {
  workflow: ApiWorkflow;
  adapters: Adapter[];
}) {
  return (
    <ReactFlowProvider>
      <EditorInner workflow={workflow} adapters={adapters} />
    </ReactFlowProvider>
  );
}

function EditorInner({
  workflow,
  adapters,
}: {
  workflow: ApiWorkflow;
  adapters: Adapter[];
}) {
  const initial = useMemo(
    () => workflowToFlow(workflow, adapters),
    [workflow, adapters],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const router = useRouter();

  const nodeTypes = useMemo(() => NODE_TYPES, []);
  const edgeTypes = useMemo(() => EDGE_TYPES, []);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (conn.source === conn.target) return;
      setEdges((eds) =>
        addEdge({ ...conn, markerEnd: { type: MarkerType.ArrowClosed } }, eds),
      );
    },
    [setEdges],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      const item = JSON.parse(raw) as PaletteItem;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const newNode: FlowNode = {
        id,
        type: "loraforge",
        position,
        data: {
          group: item.group,
          label: item.label,
          nodeType: item.type,
          config: {},
          adapterId: null,
          adapterLabel: null,
        },
      };
      setNodes((ns) => [...ns, newNode]);
    },
    [screenToFlowPosition, setNodes],
  );

  const onSave = useCallback(async () => {
    const err = validate(nodes, edges);
    if (err) {
      setMessage({ tone: "err", text: err });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const updated = flowToWorkflow(workflow, nodes, edges);
      await api.replaceWorkflow(workflow.id, updated);
      setMessage({ tone: "ok", text: "Saved." });
    } catch (e) {
      setMessage({
        tone: "err",
        text: e instanceof Error ? e.message : "Save failed.",
      });
    } finally {
      setSaving(false);
    }
  }, [workflow, nodes, edges]);

  const onRun = useCallback(async () => {
    const err = validate(nodes, edges);
    if (err) {
      setMessage({ tone: "err", text: err });
      return;
    }
    setRunning(true);
    setMessage(null);
    try {
      // Save first so the run executes against the canvas state, not stale DB.
      const updated = flowToWorkflow(workflow, nodes, edges);
      await api.replaceWorkflow(workflow.id, updated);
      const run = await api.createRun({
        workflowId: workflow.id,
        inputs: { document: "sample_prospectus.pdf" },
      });
      router.push(`/runs/${run.id}`);
    } catch (e) {
      setMessage({
        tone: "err",
        text: e instanceof Error ? e.message : "Run failed.",
      });
      setRunning(false);
    }
  }, [workflow, nodes, edges, router]);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodeId(selected[0]?.id ?? null);
    },
    [],
  );

  const setNodeAdapter = useCallback(
    (nodeId: string, adapterId: string | null) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  adapterId,
                  adapterLabel: adapterLabelFor(adapterId, adapters),
                },
              }
            : n,
        ),
      );
    },
    [setNodes, adapters],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[480px] border-t border-zinc-200 dark:border-zinc-800">
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 overflow-y-auto">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Node palette
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Drag a node onto the canvas.
          </p>
        </div>
        <div className="p-3 space-y-4">
          {GROUP_ORDER.map((group) => (
            <div key={group}>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 px-1 mb-1">
                {GROUP_LABELS[group]}
              </p>
              <div className="space-y-1">
                {PALETTE.filter((p) => p.group === group).map((item) => (
                  <PaletteCard key={item.type} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div
        className="flex-1 relative"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {message ? (
            <span
              className={`text-xs px-2 py-1 rounded ${
                message.tone === "ok"
                  ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                  : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
              }`}
            >
              {message.text}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || running}
            className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={saving || running}
            className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
        >
          <Background gap={16} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      <Inspector
        node={selectedNode}
        adapters={adapters}
        onAdapterChange={setNodeAdapter}
      />
    </div>
  );
}

function Inspector({
  node,
  adapters,
  onAdapterChange,
}: {
  node: FlowNode | null;
  adapters: Adapter[];
  onAdapterChange: (nodeId: string, adapterId: string | null) => void;
}) {
  if (!node) {
    return (
      <aside className="w-64 shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 text-xs text-zinc-500">
        Select a node to inspect or bind an adapter.
      </aside>
    );
  }

  const isAi = node.data.group === "ai";
  // Adapters in the registry that match this node's task type — keeps the
  // dropdown short and reflects the "constrained workflow" principle.
  const compatible = adapters.filter((a) => a.taskType === node.data.nodeType);
  const incompatible = adapters.filter((a) => a.taskType !== node.data.nodeType);

  return (
    <aside className="w-64 shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 overflow-y-auto">
      <p className="text-xs uppercase tracking-wide text-zinc-500">
        Inspector
      </p>
      <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {node.data.label}
      </p>
      <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
        {node.data.nodeType} · {node.data.group}
      </p>

      {isAi ? (
        <div className="mt-4">
          <label className="text-[11px] uppercase tracking-wide text-zinc-500">
            Adapter binding
          </label>
          <select
            value={node.data.adapterId ?? ""}
            onChange={(e) =>
              onAdapterChange(node.id, e.target.value || null)
            }
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs"
          >
            <option value="">(no adapter)</option>
            {compatible.length > 0 ? (
              <optgroup label={`Matching ${node.data.nodeType}`}>
                {compatible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} v{a.version} · {a.baseModel}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {incompatible.length > 0 ? (
              <optgroup label="Other adapters (task-type mismatch)">
                {incompatible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} v{a.version} · {a.taskType}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          {node.data.adapterId ? (
            <button
              type="button"
              onClick={() => onAdapterChange(node.id, null)}
              className="mt-2 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
            >
              Detach adapter
            </button>
          ) : null}
          <p className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
            The bound adapter&apos;s base model is used at run time. If it
            isn&apos;t installed in Ollama, the executor falls back to an
            available model and the trace records a warning.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-[11px] text-zinc-500 leading-relaxed">
          Adapter binding only applies to AI-group nodes. This node runs
          deterministic logic.
        </p>
      )}
    </aside>
  );
}

function PaletteCard({ item }: { item: PaletteItem }) {
  const tone = GROUP_TONE[item.group];
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item));
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`cursor-grab active:cursor-grabbing rounded border ${tone.border} ${tone.bg} px-2.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-50`}
    >
      {item.label}
    </div>
  );
}
