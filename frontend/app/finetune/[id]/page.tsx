import Link from "next/link";
import { notFound } from "next/navigation";

import { FineTuneMetricsChart } from "@/components/finetune-metrics-chart";
import { FineTunePipeline } from "@/components/finetune-pipeline";
import { PageHeader } from "@/components/page-header";
import { api, type FineTuneStatus } from "@/lib/api";

const STATUS_TONE: Record<FineTuneStatus, string> = {
  completed:
    "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  queued: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};

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

export default async function FineTuneRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let run: Awaited<ReturnType<typeof api.finetuneRun>>;
  try {
    run = await api.finetuneRun(id);
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) notFound();
    throw e;
  }

  const tone = STATUS_TONE[run.status] ?? STATUS_TONE.queued;
  const lastStage = run.trace[run.trace.length - 1]?.nodeId;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={run.adapterName}
        description={`Training run ${run.id}`}
      />
      <div className="px-8 pt-3 pb-2 flex items-center justify-between">
        <Link
          href="/finetune"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← All training runs
        </Link>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${tone}`}>
            {run.status}
          </span>
          {run.producedAdapterId ? (
            <Link
              href="/adapters"
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
            >
              View adapter →
            </Link>
          ) : null}
        </div>
      </div>
      <section className="px-8 py-4 max-w-4xl space-y-5">
        <FineTunePipeline highlightedStage={lastStage} />

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
            Configuration
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              Dataset
            </dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">
              {run.datasetId}
            </dd>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              Base model
            </dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">
              {run.baseModel}
            </dd>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              Task type
            </dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">
              {run.taskType}
            </dd>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              Hyperparams
            </dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">
              {run.hyperparams.epochs} epochs · lr {run.hyperparams.learningRate} ·
              batch {run.hyperparams.batchSize}
            </dd>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              Started
            </dt>
            <dd className="text-zinc-700 dark:text-zinc-300">
              {formatDateTime(run.startedAt)}
            </dd>
            {run.finishedAt ? (
              <>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Finished
                </dt>
                <dd className="text-zinc-700 dark:text-zinc-300">
                  {formatDateTime(run.finishedAt)}
                </dd>
              </>
            ) : null}
          </dl>
        </div>

        {run.metrics ? (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
              Evaluation metrics
            </h2>
            <dl className="mt-3 grid grid-cols-3 gap-4 text-sm tabular-nums">
              {run.metrics.accuracy !== null ? (
                <Metric label="Accuracy" value={run.metrics.accuracy.toFixed(3)} />
              ) : null}
              {run.metrics.f1 !== null ? (
                <Metric label="F1" value={run.metrics.f1.toFixed(3)} />
              ) : null}
              {run.metrics.evalLoss !== null ? (
                <Metric
                  label="Eval loss"
                  value={run.metrics.evalLoss.toFixed(3)}
                />
              ) : null}
            </dl>
            {run.metrics.notes ? (
              <p className="mt-2 text-xs text-zinc-500">{run.metrics.notes}</p>
            ) : null}
            {run.metrics.history && run.metrics.history.length > 0 ? (
              <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
                  Per-epoch evolution
                </h3>
                <FineTuneMetricsChart history={run.metrics.history} />
              </div>
            ) : null}
          </div>
        ) : null}

        {run.trainingPairs && run.trainingPairs.length > 0 ? (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
            <header className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-baseline justify-between">
              <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
                Materialised training pairs
              </h2>
              <span className="text-xs text-zinc-500">
                {run.trainingPairs.length} pair
                {run.trainingPairs.length === 1 ? "" : "s"}
              </span>
            </header>
            <div className="px-5 py-3 text-[11px] text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              The (prompt, completion) pairs the executor would feed a real
              LoRA trainer — built from the task&apos;s prompt template
              rendered against each labelled row.
            </div>
            <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {run.trainingPairs.map((pair, i) => (
                <li
                  key={`${pair.rowId ?? i}`}
                  className="px-5 py-3 grid grid-cols-[3rem_1fr] gap-3"
                >
                  <span className="text-[11px] font-mono text-zinc-500">
                    {pair.rowId ?? `#${i + 1}`}
                  </span>
                  <div className="min-w-0 space-y-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                        prompt
                      </p>
                      <p className="mt-0.5 text-sm font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                        {pair.prompt}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                        completion
                      </p>
                      <p className="mt-0.5 text-sm font-mono text-emerald-700 dark:text-emerald-300 whitespace-pre-wrap">
                        → {pair.completion}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

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
              No trace recorded.
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
                    <p className="text-sm text-zinc-900 dark:text-zinc-50">
                      {entry.label}{" "}
                      <span className="text-zinc-500 font-mono text-xs">
                        {entry.nodeType}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                      {entry.summary}
                    </p>
                    <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
                      {formatDateTime(entry.startedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}
