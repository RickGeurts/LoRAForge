import Link from "next/link";
import {
  Boxes,
  PlayCircle,
  Server,
  Workflow as WorkflowIcon,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { api, type Adapter, type Run, type Workflow, type OllamaStatus } from "@/lib/api";

type DashboardData = {
  adapters: Adapter[];
  workflows: Workflow[];
  runs: Run[];
  ollama: OllamaStatus | null;
};

async function loadDashboard(): Promise<{ data: DashboardData; error: string | null }> {
  try {
    const [adapters, workflows, runs, ollama] = await Promise.all([
      api.adapters(),
      api.workflows(),
      api.runs(),
      api.ollamaStatus().catch(() => null),
    ]);
    return { data: { adapters, workflows, runs, ollama }, error: null };
  } catch (e) {
    return {
      data: { adapters: [], workflows: [], runs: [], ollama: null },
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DashboardPage() {
  const { data, error } = await loadDashboard();
  const { adapters, workflows, runs, ollama } = data;

  const adapterStatus = countBy(adapters, (a) => a.status);
  const runStatus = countBy(runs, (r) => r.status);
  const recentRuns = [...runs]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 5);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Dashboard"
        description="Local-first regulatory AI workflow builder. Auditable, traceable, and human-reviewable."
      />
      <section className="px-8 py-6 max-w-5xl space-y-6">
        {error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
            Backend unreachable — start the FastAPI server on :8001. ({error})
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            href="/adapters"
            icon={<Boxes size={16} />}
            label="Adapters"
            value={adapters.length}
            sub={statusBreakdown(adapterStatus)}
          />
          <StatTile
            href="/workflows"
            icon={<WorkflowIcon size={16} />}
            label="Workflows"
            value={workflows.length}
            sub={
              workflows.length === 0
                ? "no workflows yet"
                : `${workflows.reduce((n, w) => n + w.nodes.length, 0)} nodes total`
            }
          />
          <StatTile
            href="/runs"
            icon={<PlayCircle size={16} />}
            label="Runs"
            value={runs.length}
            sub={statusBreakdown(runStatus)}
          />
          <OllamaTile ollama={ollama} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <header className="flex items-baseline justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
                Recent runs
              </h2>
              <Link
                href="/runs"
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                View all →
              </Link>
            </header>
            {recentRuns.length === 0 ? (
              <p className="px-5 py-8 text-sm text-zinc-500 text-center">
                No runs yet. Trigger a workflow to see it here.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {recentRuns.map((r) => (
                  <li
                    key={r.id}
                    className="px-5 py-3 flex items-baseline justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-zinc-500">{r.id}</p>
                      <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-50 truncate">
                        {r.output?.decision ?? <span className="text-zinc-500">no output yet</span>}
                        {r.output ? (
                          <span className="ml-2 text-zinc-500">
                            ({Math.round(r.output.confidence * 100)}%)
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusPill status={r.status} />
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatDateTime(r.startedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <header className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
                Workflows
              </h2>
            </header>
            {workflows.length === 0 ? (
              <p className="px-5 py-8 text-sm text-zinc-500 text-center">
                No workflows defined.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {workflows.slice(0, 5).map((w) => (
                  <li key={w.id} className="px-5 py-3">
                    <p className="text-sm text-zinc-900 dark:text-zinc-50">
                      {w.name}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      v{w.version} · {w.nodes.length} nodes
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatTile({
  href,
  icon,
  label,
  value,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-center gap-2 text-zinc-500">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-50 tabular-nums">
        {value}
      </div>
      <p className="mt-1 text-xs text-zinc-500 truncate">{sub}</p>
    </Link>
  );
}

function OllamaTile({ ollama }: { ollama: OllamaStatus | null }) {
  const reachable = ollama?.reachable ?? false;
  const stub = ollama?.stub ?? false;
  const label = ollama === null
    ? "unknown"
    : reachable
      ? stub ? "stubbed" : "reachable"
      : "unreachable";
  const dot = reachable && !stub
    ? "bg-green-500"
    : reachable
      ? "bg-amber-500"
      : "bg-zinc-400";
  return (
    <Link
      href="/settings"
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-center gap-2 text-zinc-500">
        <Server size={16} />
        <span className="text-xs uppercase tracking-wide">Ollama</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
        <span className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          {label}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500 truncate font-mono">
        {ollama?.baseUrl ?? "—"}
      </p>
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
      : status === "failed"
        ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
        : status === "needs_review"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${tone}`}
    >
      {status}
    </span>
  );
}

function statusBreakdown(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${v} ${k}`).join(" · ");
}