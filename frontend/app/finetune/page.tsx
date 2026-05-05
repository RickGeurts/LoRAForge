import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { FineTunePipeline } from "@/components/finetune-pipeline";
import { FineTuneForm } from "@/components/finetune-form";
import { api } from "@/lib/api";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function FineTunePage() {
  let datasets: Awaited<ReturnType<typeof api.datasets>> = [];
  let models: Awaited<ReturnType<typeof api.ollamaModels>> = [];
  let runs: Awaited<ReturnType<typeof api.finetuneRuns>> = [];
  let error: string | null = null;
  try {
    [datasets, models, runs] = await Promise.all([
      api.datasets(),
      api.ollamaModels().catch(() => []),
      api.finetuneRuns(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const sorted = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Fine-tune"
        description="Produce a versioned LoRA adapter from a dataset. Training is mocked — the pipeline shape, audit trail, and adapter registry are real."
      />
      <section className="px-8 py-6 space-y-5 max-w-4xl">
        {error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
            Backend unreachable — start the FastAPI server on :8001. ({error})
          </div>
        ) : null}

        <FineTunePipeline />
        <FineTuneForm datasets={datasets} models={models} />

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
          <header className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-baseline justify-between">
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
              Training history
            </h2>
            <span className="text-xs text-zinc-500">
              {runs.length} run{runs.length === 1 ? "" : "s"}
            </span>
          </header>
          {sorted.length === 0 ? (
            <p className="px-5 py-8 text-sm text-zinc-500 text-center">
              No training runs yet.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sorted.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/finetune/${r.id}`}
                    className="block px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-zinc-900 dark:text-zinc-50">
                        {r.adapterName}{" "}
                        <span className="text-zinc-500 font-mono text-xs">
                          {r.id}
                        </span>
                      </p>
                      <span className="text-xs text-zinc-500">{r.status}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {r.taskType} · base {r.baseModel} · {r.hyperparams.epochs}{" "}
                      epochs · {formatDateTime(r.startedAt)}
                    </p>
                    {r.metrics ? (
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                        accuracy {r.metrics.accuracy?.toFixed(2)} · f1{" "}
                        {r.metrics.f1?.toFixed(2)} · eval_loss{" "}
                        {r.metrics.evalLoss?.toFixed(3)}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
