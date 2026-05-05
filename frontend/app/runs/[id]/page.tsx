import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { api, type TraceEntry, type RunStatus } from "@/lib/api";

const STATUS_TONE: Record<RunStatus, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  needs_review:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  queued: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const TRACE_TONE = {
  ok: "text-zinc-700 dark:text-zinc-300",
  warn: "text-amber-700 dark:text-amber-300",
  error: "text-red-700 dark:text-red-300",
} as const;

const TRACE_DOT = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
} as const;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function durationMs(entry: TraceEntry): number {
  return new Date(entry.finishedAt).getTime() - new Date(entry.startedAt).getTime();
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let run: Awaited<ReturnType<typeof api.run>>;
  try {
    run = await api.run(id);
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) notFound();
    throw e;
  }

  const tone = STATUS_TONE[run.status] ?? STATUS_TONE.queued;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`Run ${run.id}`}
        description={`Workflow ${run.workflowId} · v${run.workflowVersion}`}
      />
      <div className="px-8 pt-3 pb-2 flex items-center justify-between">
        <Link
          href="/runs"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← All runs
        </Link>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${tone}`}>
            {run.status}
          </span>
          <Link
            href={`/workflows/${run.workflowId}`}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            Open workflow →
          </Link>
        </div>
      </div>
      <section className="px-8 py-4 max-w-4xl space-y-5">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Decision</h2>
          {run.output ? (
            <>
              <p className="mt-2 text-lg text-zinc-900 dark:text-zinc-50">
                {run.output.decision}{" "}
                <span className="text-zinc-500 text-base">
                  ({Math.round(run.output.confidence * 100)}% confidence)
                </span>
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {run.output.explanation}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">
                    Adapter version
                  </dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-50">
                    {run.output.adapterVersion}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">
                    Workflow version
                  </dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-50">
                    {run.output.workflowVersion}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">
                    Sources
                  </dt>
                  <dd className="text-zinc-700 dark:text-zinc-300">
                    {run.output.sources.length > 0
                      ? run.output.sources.join(", ")
                      : "—"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">
                    Decision timestamp
                  </dt>
                  <dd className="text-zinc-700 dark:text-zinc-300">
                    {formatDateTime(run.output.timestamp)}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No output recorded.</p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
          <header className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-baseline justify-between">
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
              Audit trail
            </h2>
            <span className="text-xs text-zinc-500">
              {run.trace.length} step{run.trace.length === 1 ? "" : "s"}
            </span>
          </header>
          {run.trace.length === 0 ? (
            <p className="px-5 py-8 text-sm text-zinc-500 text-center">
              No trace recorded for this run.
            </p>
          ) : (
            <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {run.trace.map((entry, i) => (
                <li
                  key={`${entry.nodeId}-${i}`}
                  className="px-5 py-3 flex items-start gap-3"
                >
                  <span className="mt-2 shrink-0 text-xs font-mono text-zinc-500 w-6 text-right">
                    {i + 1}.
                  </span>
                  <span
                    className={`mt-2 inline-block w-2 h-2 rounded-full shrink-0 ${
                      TRACE_DOT[entry.status]
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-zinc-900 dark:text-zinc-50">
                        {entry.label}{" "}
                        <span className="text-zinc-500 font-mono text-xs">
                          {entry.nodeType}
                        </span>
                      </p>
                      <span className="text-xs text-zinc-500 shrink-0 tabular-nums">
                        {entry.latencyMs ?? durationMs(entry)} ms
                      </span>
                    </div>
                    <p className={`mt-0.5 text-sm ${TRACE_TONE[entry.status]}`}>
                      {entry.summary}
                    </p>
                    <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
                      {formatDateTime(entry.startedAt)}
                      {entry.model ? (
                        <>
                          {" · "}
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {entry.model}
                          </span>
                          {entry.totalTokens !== null
                            ? ` · ${entry.totalTokens} tokens`
                            : null}
                        </>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {Object.keys(run.inputs).length > 0 ? (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Inputs</h2>
            <pre className="mt-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-900 p-3 rounded overflow-x-auto">
              {JSON.stringify(run.inputs, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}
