"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  type DocumentEntry,
  type NodeGroup,
  type RuleInstance,
  type RulePrimitive,
  type RulePrimitiveParam,
  type Task,
  type Workflow as ApiWorkflow,
} from "@/lib/api";

type PaletteItem = { group: NodeGroup; type: string; label: string };

// Non-AI nodes are executor primitives, not user-defined tasks. They stay
// hardcoded. AI palette entries come from the Task registry at runtime.
const STATIC_PALETTE: PaletteItem[] = [
  { group: "documents", type: "document_handler", label: "Document Handler" },
  { group: "documents", type: "pdf_extractor", label: "PDF Extractor" },
  { group: "rules", type: "validator", label: "Validator" },
  { group: "rules", type: "confidence_filter", label: "Confidence Filter" },
  { group: "logic", type: "router", label: "Router" },
  { group: "logic", type: "human_review", label: "Human Review" },
  { group: "output", type: "decision_output", label: "Decision Output" },
  { group: "output", type: "report_generator", label: "Report Generator" },
];

function buildPalette(aiTasks: Task[]): PaletteItem[] {
  const aiItems: PaletteItem[] = aiTasks.map((t) => ({
    group: "ai",
    type: t.id,
    label: t.name,
  }));
  return [...STATIC_PALETTE, ...aiItems];
}

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
      {data.nodeType === "document_handler" && data.config.path ? (
        <p className="mt-1 text-[10px] font-mono text-zinc-700 dark:text-zinc-300 bg-white/60 dark:bg-zinc-900/60 rounded px-1 py-0.5 truncate max-w-[180px]">
          📁 {String(data.config.path).split(/[\\/]/).slice(-2).join("/")}
        </p>
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
  aiTasks,
  primitives,
}: {
  workflow: ApiWorkflow;
  adapters: Adapter[];
  aiTasks: Task[];
  primitives: RulePrimitive[];
}) {
  return (
    <ReactFlowProvider>
      <EditorInner
        workflow={workflow}
        adapters={adapters}
        aiTasks={aiTasks}
        primitives={primitives}
      />
    </ReactFlowProvider>
  );
}

function EditorInner({
  workflow,
  adapters,
  aiTasks,
  primitives,
}: {
  workflow: ApiWorkflow;
  adapters: Adapter[];
  aiTasks: Task[];
  primitives: RulePrimitive[];
}) {
  const initial = useMemo(
    () => workflowToFlow(workflow, adapters),
    [workflow, adapters],
  );
  const palette = useMemo(() => buildPalette(aiTasks), [aiTasks]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
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
        inputs: {},
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

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => setEditingNodeId(node.id),
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

  const setNodeConfigValue = useCallback(
    (nodeId: string, key: string, value: string | null) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const next = { ...n.data.config };
          if (value === null || value === "") {
            delete next[key];
          } else {
            next[key] = value;
          }
          return { ...n, data: { ...n.data, config: next } };
        }),
      );
    },
    [setNodes],
  );

  const setNodeConfigField = useCallback(
    (nodeId: string, key: string, value: unknown) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const next = { ...n.data.config, [key]: value };
          return { ...n, data: { ...n.data, config: next } };
        }),
      );
    },
    [setNodes],
  );

  const editingNode = nodes.find((n) => n.id === editingNodeId) ?? null;

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[480px] border-t border-zinc-200 dark:border-zinc-800">
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 overflow-y-auto">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Node palette
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Drag a node onto the canvas. Double-click a node to configure it.
          </p>
        </div>
        <div className="p-3 space-y-4">
          {GROUP_ORDER.map((group) => (
            <div key={group}>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 px-1 mb-1">
                {GROUP_LABELS[group]}
              </p>
              <div className="space-y-1">
                {palette.filter((p) => p.group === group).map((item) => (
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
          onNodeDoubleClick={onNodeDoubleClick}
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

      {editingNode ? (
        <NodeConfigDrawer
          node={editingNode}
          adapters={adapters}
          primitives={primitives}
          onClose={() => setEditingNodeId(null)}
          onAdapterChange={setNodeAdapter}
          onConfigChange={setNodeConfigValue}
          onConfigField={setNodeConfigField}
        />
      ) : null}
    </div>
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

function NodeConfigDrawer({
  node,
  adapters,
  primitives,
  onClose,
  onAdapterChange,
  onConfigChange,
  onConfigField,
}: {
  node: FlowNode;
  adapters: Adapter[];
  primitives: RulePrimitive[];
  onClose: () => void;
  onAdapterChange: (nodeId: string, adapterId: string | null) => void;
  onConfigChange: (nodeId: string, key: string, value: string | null) => void;
  onConfigField: (nodeId: string, key: string, value: unknown) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isAi = node.data.group === "ai";
  const isDocumentHandler = node.data.nodeType === "document_handler";
  const isConfidenceFilter = node.data.nodeType === "confidence_filter";
  const isValidator = node.data.nodeType === "validator";
  const hasTypeSpecificConfig =
    isAi || isDocumentHandler || isConfidenceFilter || isValidator;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-label="Close"
      />
      <aside className="w-[36rem] max-w-full bg-white dark:bg-zinc-950 shadow-2xl border-l border-zinc-200 dark:border-zinc-800 flex flex-col">
        <header className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
              Configure node
            </p>
            <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-50">
              {node.data.label}
            </p>
            <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
              {node.data.nodeType} · {node.data.group}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 px-2 py-1 rounded"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {isDocumentHandler ? (
            <DocumentHandlerConfig node={node} onConfigChange={onConfigChange} />
          ) : null}
          {isValidator ? (
            <ValidatorConfig
              node={node}
              primitives={primitives}
              onConfigField={onConfigField}
            />
          ) : null}
          {isConfidenceFilter ? (
            <ConfidenceFilterConfig node={node} onConfigChange={onConfigChange} />
          ) : null}
          {isAi ? (
            <AdapterBindingConfig
              node={node}
              adapters={adapters}
              onAdapterChange={onAdapterChange}
            />
          ) : null}
          {!hasTypeSpecificConfig ? (
            <p className="text-sm text-zinc-500 leading-relaxed">
              This node runs deterministic logic and has no configurable
              parameters yet.
            </p>
          ) : null}
        </div>

        <footer className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90"
          >
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}

function DocumentHandlerConfig({
  node,
  onConfigChange,
}: {
  node: FlowNode;
  onConfigChange: (nodeId: string, key: string, value: string | null) => void;
}) {
  const path = (node.data.config.path as string | undefined) ?? "";
  const [pathDraft, setPathDraft] = useState(path);
  const [files, setFiles] = useState<DocumentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPathDraft(path), [path]);

  useEffect(() => {
    if (!path.trim()) {
      setFiles([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listDocuments(path)
      .then((res) => {
        if (!cancelled) setFiles(res.files);
      })
      .catch((err) => {
        if (cancelled) return;
        setFiles([]);
        setError(err instanceof Error ? err.message : "Failed to list files.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const commitPath = () => {
    const trimmed = pathDraft.trim();
    if (trimmed !== path) onConfigChange(node.id, "path", trimmed || null);
  };

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-wide text-zinc-500">
        Document source
      </h3>
      <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
        Absolute directory path
        <input
          value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onBlur={commitPath}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitPath();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="C:\\path\\to\\documents"
          className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-sm font-mono text-zinc-900 dark:text-zinc-50"
        />
        <span className="block mt-1 text-[11px] text-zinc-500 normal-case tracking-normal">
          Every <code>.txt</code> / <code>.md</code> file in this folder is
          loaded at run time. Filesystem path on the backend host.
        </span>
      </label>

      {loading ? (
        <p className="text-[11px] text-zinc-500">Listing files…</p>
      ) : error ? (
        <p className="text-[11px] text-red-700 dark:text-red-300">{error}</p>
      ) : !path ? null : files.length === 0 ? (
        <p className="text-[11px] text-zinc-500">
          No <code>.txt</code> or <code>.md</code> files in that directory.
        </p>
      ) : (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2">
          <p className="text-[11px] text-zinc-500">
            {files.length} file{files.length === 1 ? "" : "s"} ·{" "}
            {(totalBytes / 1024).toFixed(1)} KB total will be loaded
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] font-mono text-zinc-700 dark:text-zinc-300">
            {files.map((f) => (
              <li key={f.name} className="flex justify-between gap-3">
                <span className="truncate">{f.name}</span>
                <span className="text-zinc-500 tabular-nums">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ValidatorConfig({
  node,
  primitives,
  onConfigField,
}: {
  node: FlowNode;
  primitives: RulePrimitive[];
  onConfigField: (nodeId: string, key: string, value: unknown) => void;
}) {
  const rules = useMemo<RuleInstance[]>(() => {
    const stored = node.data.config.rules;
    return Array.isArray(stored) ? (stored as RuleInstance[]) : [];
  }, [node.data.config.rules]);

  const primitivesByType = useMemo(
    () => new Map(primitives.map((p) => [p.type, p])),
    [primitives],
  );

  const commit = (next: RuleInstance[]) => {
    onConfigField(node.id, "rules", next);
  };

  const addRule = () => {
    const id = `rule_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 5)}`;
    const defaultType = primitives[0]?.type ?? "text_contains";
    commit([
      ...rules,
      { id, type: defaultType, target: "", value: "", name: "" },
    ]);
  };

  const updateRule = (i: number, patch: Partial<RuleInstance>) => {
    commit(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const removeRule = (i: number) => commit(rules.filter((_, idx) => idx !== i));

  const moveRule = (i: number, delta: number) => {
    const target = i + delta;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    const [item] = next.splice(i, 1);
    next.splice(target, 0, item);
    commit(next);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">
          Rules ({rules.length})
        </h3>
        <button
          type="button"
          onClick={addRule}
          disabled={primitives.length === 0}
          className="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          + Add rule
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="text-[11px] text-zinc-500 italic">
          No rules yet. Add one to start validating run state.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, i) => (
            <RuleCard
              key={rule.id ?? i}
              rule={rule}
              index={i}
              total={rules.length}
              primitive={primitivesByType.get(rule.type) ?? null}
              primitives={primitives}
              onChange={(patch) => updateRule(i, patch)}
              onDelete={() => removeRule(i)}
              onMove={(delta) => moveRule(i, delta)}
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Rules are generic primitives. <code>target</code> is the run-state
        field to check (e.g. <code>clauses</code>, <code>document_text</code>,
        <code>clauses_list</code>). The Validator&apos;s pass-rate becomes the
        run&apos;s confidence.
      </p>
    </section>
  );
}

function RuleCard({
  rule,
  index,
  total,
  primitive,
  primitives,
  onChange,
  onDelete,
  onMove,
}: {
  rule: RuleInstance;
  index: number;
  total: number;
  primitive: RulePrimitive | null;
  primitives: RulePrimitive[];
  onChange: (patch: Partial<RuleInstance>) => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
}) {
  const params = new Set<RulePrimitiveParam>(primitive?.params ?? []);

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <input
          value={rule.name ?? ""}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={primitive?.name ?? "Rule name"}
          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm font-medium"
        />
        <div className="flex items-center gap-1 text-zinc-500">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="px-1 py-0.5 hover:text-zinc-900 dark:hover:text-zinc-50 disabled:opacity-30"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="px-1 py-0.5 hover:text-zinc-900 dark:hover:text-zinc-50 disabled:opacity-30"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="px-1 py-0.5 hover:text-red-700 dark:hover:text-red-400"
            aria-label="Delete"
          >
            ✕
          </button>
        </div>
      </div>

      <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
        Primitive
        <select
          value={rule.type}
          onChange={(e) => onChange({ type: e.target.value })}
          className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
        >
          {primitives.map((p) => (
            <option key={p.type} value={p.type}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {primitive ? (
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          {primitive.description}
        </p>
      ) : (
        <p className="text-[11px] text-red-700 dark:text-red-300">
          Unknown primitive: <code>{rule.type}</code>
        </p>
      )}

      {params.has("target") ? (
        <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
          Target field
          <input
            value={rule.target ?? ""}
            onChange={(e) => onChange({ target: e.target.value })}
            placeholder="state key, e.g. clauses"
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs font-mono"
          />
        </label>
      ) : null}

      {params.has("value") ? (
        <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
          Value
          <input
            value={rule.value ?? ""}
            onChange={(e) => onChange({ value: e.target.value })}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
          />
        </label>
      ) : null}

      {params.has("values") ? (
        <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
          Values (comma-separated)
          <input
            value={rule.values ?? ""}
            onChange={(e) => onChange({ values: e.target.value })}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
          />
        </label>
      ) : null}

      {params.has("pattern") ? (
        <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
          Pattern (regex)
          <input
            value={rule.pattern ?? ""}
            onChange={(e) => onChange({ pattern: e.target.value })}
            placeholder="\\bword\\b"
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs font-mono"
          />
        </label>
      ) : null}

      {params.has("bound") ? (
        <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
          Bound
          <input
            type="number"
            value={rule.bound ?? ""}
            onChange={(e) => onChange({ bound: e.target.value })}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs tabular-nums"
          />
        </label>
      ) : null}

      {params.has("case_sensitive") ? (
        <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500">
          <input
            type="checkbox"
            checked={Boolean(rule.case_sensitive)}
            onChange={(e) => onChange({ case_sensitive: e.target.checked })}
          />
          Case-sensitive
        </label>
      ) : null}

      <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
        Failure reason (optional)
        <input
          value={rule.reason_on_fail ?? ""}
          onChange={(e) => onChange({ reason_on_fail: e.target.value })}
          placeholder="Shown in trace when the rule fails"
          className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
        />
      </label>
    </div>
  );
}

function ConfidenceFilterConfig({
  node,
  onConfigChange,
}: {
  node: FlowNode;
  onConfigChange: (nodeId: string, key: string, value: string | null) => void;
}) {
  const stored = node.data.config.threshold;
  const threshold =
    typeof stored === "number"
      ? stored
      : typeof stored === "string"
      ? Number(stored)
      : 0.8;

  const commit = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    onConfigChange(node.id, "threshold", String(clamped));
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-wide text-zinc-500">
        Threshold
      </h3>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={Number.isFinite(threshold) ? threshold : 0.8}
          onChange={(e) => commit(Number(e.target.value))}
          className="flex-1 accent-zinc-900 dark:accent-zinc-50"
        />
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={Number.isFinite(threshold) ? threshold : 0.8}
          onChange={(e) => commit(Number(e.target.value))}
          className="w-20 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm tabular-nums"
        />
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        The upstream Validator&apos;s pass-rate is compared against this
        threshold. Runs below the bar are flagged{" "}
        <code>needs_review</code> for human follow-up.
      </p>
    </section>
  );
}

function AdapterBindingConfig({
  node,
  adapters,
  onAdapterChange,
}: {
  node: FlowNode;
  adapters: Adapter[];
  onAdapterChange: (nodeId: string, adapterId: string | null) => void;
}) {
  const compatible = adapters.filter((a) => a.taskType === node.data.nodeType);
  const incompatible = adapters.filter((a) => a.taskType !== node.data.nodeType);

  return (
    <section className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-zinc-500">
        Adapter binding
      </h3>
      <select
        value={node.data.adapterId ?? ""}
        onChange={(e) => onAdapterChange(node.id, e.target.value || null)}
        className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-sm"
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
          className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
        >
          Detach adapter
        </button>
      ) : null}
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        The bound adapter&apos;s base model is used at run time. If it
        isn&apos;t installed in Ollama, the executor falls back to an
        available model and the trace records a warning.
      </p>
    </section>
  );
}
