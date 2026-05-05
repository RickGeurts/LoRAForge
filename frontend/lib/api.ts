const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
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

export type Workflow = {
  id: string;
  name: string;
  version: string;
  description: string | null;
  nodes: Array<{
    id: string;
    type: string;
    group: string;
    label: string;
    config: Record<string, unknown>;
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
  createdAt: string;
  updatedAt: string;
};

export type Run = {
  id: string;
  workflowId: string;
  workflowVersion: string;
  status: string;
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
  startedAt: string;
  finishedAt: string | null;
};

export type OllamaStatus = {
  reachable: boolean;
  baseUrl: string;
  stub?: boolean;
};

export type OllamaModel = {
  name: string;
  size: string;
  family: string;
  stub?: boolean;
};

export const api = {
  adapters: () => request<Adapter[]>("/adapters"),
  workflows: () => request<Workflow[]>("/workflows"),
  runs: () => request<Run[]>("/runs"),
  ollamaStatus: () => request<OllamaStatus>("/ollama/status"),
  ollamaModels: () => request<OllamaModel[]>("/ollama/models"),
};
