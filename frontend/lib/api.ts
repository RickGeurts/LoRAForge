const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
}

export type Adapter = {
  id: string;
  name: string;
  baseModel: string;
  taskType: string;
  version: string;
  status: string;
  trainingDataSummary: string | null;
  evaluationMetrics: Record<string, unknown> | null;
  createdAt: string;
};

export type NodeGroup = "documents" | "ai" | "rules" | "logic" | "output";

export type WorkflowNode = {
  id: string;
  type: string;
  group: NodeGroup;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number } | null;
  adapterId: string | null;
};

export type WorkflowEdge = { id: string; source: string; target: string };

export type Workflow = {
  id: string;
  name: string;
  version: string;
  description: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
};

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "needs_review";

export type TraceStatus = "ok" | "warn" | "error";

export type TraceEntry = {
  nodeId: string;
  nodeType: string;
  label: string;
  group: string;
  status: TraceStatus;
  summary: string;
  startedAt: string;
  finishedAt: string;
  model: string | null;
  totalTokens: number | null;
  latencyMs: number | null;
  adapterId: string | null;
  adapterVersion: string | null;
};

export type Run = {
  id: string;
  workflowId: string;
  workflowVersion: string;
  status: RunStatus;
  inputs: Record<string, unknown>;
  output: {
    decision: string;
    confidence: number;
    explanation: string;
    sources: string[];
    adapterVersion: string;
    workflowVersion: string;
    timestamp: string;
  } | null;
  trace: TraceEntry[];
  startedAt: string;
  finishedAt: string | null;
};

export type RunCreate = {
  workflowId: string;
  inputs?: Record<string, unknown>;
};

export type DatasetSource = "file" | "text" | "external" | "mock";

export type Dataset = {
  id: string;
  name: string;
  taskType: string;
  sourceType: DatasetSource;
  summary: string;
  rowCount: number;
  rows: Array<Record<string, unknown>>;
  createdAt: string;
};

export type DatasetCreate = {
  name: string;
  taskType: string;
  sourceType: DatasetSource;
  summary: string;
  rowCount: number;
};

export type FineTuneStatus = "queued" | "running" | "completed" | "failed";

export type FineTuneHyperparams = {
  epochs: number;
  learningRate: number;
  batchSize: number;
};

export type FineTuneMetrics = {
  accuracy: number | null;
  f1: number | null;
  evalLoss: number | null;
  notes: string | null;
};

export type FineTuneRun = {
  id: string;
  datasetId: string;
  baseModel: string;
  adapterName: string;
  taskType: string;
  hyperparams: FineTuneHyperparams;
  status: FineTuneStatus;
  metrics: FineTuneMetrics | null;
  producedAdapterId: string | null;
  trace: TraceEntry[];
  startedAt: string;
  finishedAt: string | null;
};

export type FineTuneRunCreate = {
  datasetId: string;
  baseModel: string;
  adapterName: string;
  hyperparams?: FineTuneHyperparams;
};

export type Template = {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
};

export type Task = {
  id: string;
  name: string;
  description: string;
  promptTemplate: string;
  expectedOutput: string;
  nodeGroup: NodeGroup;
  defaultBaseModel: string;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OllamaStatus = {
  reachable: boolean;
  baseUrl: string;
  version?: string;
  modelCount?: number;
  error?: string;
  stub?: boolean;
};

export type OllamaModel = {
  name: string;
  size: string;
  family: string;
  stub?: boolean;
};

const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const api = {
  // Reads
  adapters: () => request<Adapter[]>("/adapters"),
  adapter: (id: string) => request<Adapter>(`/adapters/${id}`),
  workflows: () => request<Workflow[]>("/workflows"),
  workflow: (id: string) => request<Workflow>(`/workflows/${id}`),
  runs: () => request<Run[]>("/runs"),
  run: (id: string) => request<Run>(`/runs/${id}`),
  ollamaStatus: () => request<OllamaStatus>("/ollama/status"),
  ollamaModels: () => request<OllamaModel[]>("/ollama/models"),

  // Writes
  createAdapter: (payload: Adapter) => request<Adapter>("/adapters", json(payload)),
  replaceAdapter: (id: string, payload: Adapter) =>
    request<Adapter>(`/adapters/${id}`, { ...json(payload), method: "PUT" }),
  deleteAdapter: (id: string) =>
    requestVoid(`/adapters/${id}`, { method: "DELETE" }),

  createWorkflow: (payload: Workflow) =>
    request<Workflow>("/workflows", json(payload)),
  createBlankWorkflow: (name: string) =>
    request<Workflow>(
      `/workflows/blank?name=${encodeURIComponent(name)}`,
      { method: "POST" },
    ),
  replaceWorkflow: (id: string, payload: Workflow) =>
    request<Workflow>(`/workflows/${id}`, { ...json(payload), method: "PUT" }),
  deleteWorkflow: (id: string) =>
    requestVoid(`/workflows/${id}`, { method: "DELETE" }),

  createRun: (payload: RunCreate) => request<Run>("/runs", json(payload)),

  datasets: () => request<Dataset[]>("/datasets"),
  dataset: (id: string) => request<Dataset>(`/datasets/${id}`),
  createDataset: (payload: DatasetCreate) =>
    request<Dataset>("/datasets", json(payload)),
  deleteDataset: (id: string) =>
    requestVoid(`/datasets/${id}`, { method: "DELETE" }),

  finetuneRuns: () => request<FineTuneRun[]>("/finetune"),
  finetuneRun: (id: string) => request<FineTuneRun>(`/finetune/${id}`),
  createFinetuneRun: (payload: FineTuneRunCreate) =>
    request<FineTuneRun>("/finetune", json(payload)),

  templates: () => request<Template[]>("/templates"),
  cloneTemplate: (id: string) =>
    request<Workflow>(`/templates/${id}/clone`, { method: "POST" }),

  tasks: (group?: NodeGroup) =>
    request<Task[]>(`/tasks${group ? `?group=${group}` : ""}`),
  task: (id: string) => request<Task>(`/tasks/${id}`),
  createTask: (payload: {
    id?: string;
    name: string;
    description: string;
    promptTemplate: string;
    expectedOutput: string;
    nodeGroup: NodeGroup;
    defaultBaseModel: string;
  }) => request<Task>("/tasks", json(payload)),
  replaceTask: (
    id: string,
    payload: {
      name: string;
      description: string;
      promptTemplate: string;
      expectedOutput: string;
      nodeGroup: NodeGroup;
      defaultBaseModel: string;
    },
  ) => request<Task>(`/tasks/${id}`, { ...json(payload), method: "PUT" }),
  deleteTask: (id: string) => requestVoid(`/tasks/${id}`, { method: "DELETE" }),
};
