import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteRowButton } from "@/components/delete-row-button";
import { PageHeader } from "@/components/page-header";
import { TaskChip } from "@/components/task-chip";
import {
  api,
  type Adapter,
  type Dataset,
  type FineTuneRun,
  type Task,
  type Workflow,
} from "@/lib/api";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdapterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let adapter: Adapter;
  try {
    adapter = await api.adapter(id);
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) notFound();
    throw e;
  }

  // Resolve the surrounding context so this page closes the chain:
  // task (kind+labels), source dataset, source fine-tune run, workflows that
  // bind this adapter. Each lookup is best-effort — fall back to "—" if the
  // related row is gone.
  const [task, datasets, finetuneRuns, workflows] = await Promise.all([
    api.task(adapter.taskType).catch(() => null as Task | null),
    api.datasets().catch(() => [] as Dataset[]),
    api.finetuneRuns().catch(() => [] as FineTuneRun[]),
    api.workflows().catch(() => [] as Workflow[]),
  ]);

  const sourceRun = finetuneRuns.find((r) => r.producedAdapterId === adapter.id) ?? null;
  const sourceDataset = sourceRun
    ? datasets.find((d) => d.id === sourceRun.datasetId) ?? null
    : null;
  const referencingWorkflows = workflows.filter((w) =>
    w.nodes.some((n) => n.adapterId === adapter.id),
  );

  return (
    <div className="flex flex-col">
      <PageHeader title={adapter.name} description={adapter.trainingDataSummary ?? undefined} />
      <div className="px-8 pt-3 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/adapters"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← All adapters
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-zinc-500">
            {adapter.id} · v{adapter.version}
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300">
            {adapter.status}
          </span>
          <DeleteRowButton kind="adapter" id={adapter.id} label={adapter.name} />
        </div>
      </div>

      <section className="px-8 py-4 max-w-5xl space-y-5">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-3">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">
            Target task
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <TaskChip task={task} taskType={adapter.taskType} showLabels />
            {task ? (
              <Link
                href={`/tasks/${task.id}`}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
              >
                open task →
              </Link>
            ) : null}
          </div>
          {task ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {task.description}
            </p>
          ) : (
            <p className="text-xs text-zinc-500 italic">
              Task <code>{adapter.taskType}</code> is no longer in the registry.
            </p>
          )}
          {task && task.kind === "classifier" ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                Labels
              </p>
              <div className="flex flex-wrap gap-1.5">
                {task.labels.length === 0 ? (
                  <span className="text-zinc-500 italic text-sm">none</span>
                ) : (
                  task.labels.map((l) => (
                    <span
                      key={l}
                      className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900 font-mono"
                    >
                      {l}
                    </span>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
            Provenance
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Source fine-tune run
              </dt>
              <dd className="mt-0.5">
                {sourceRun ? (
                  <Link
                    href={`/finetune/${sourceRun.id}`}
                    className="text-zinc-900 dark:text-zinc-50 hover:underline"
                  >
                    {sourceRun.adapterName}{" "}
                    <span className="font-mono text-xs text-zinc-500">
                      {sourceRun.id}
                    </span>
                  </Link>
                ) : (
                  <span className="text-zinc-500 italic">
                    No fine-tune run is tagged as the source.
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Source dataset
              </dt>
              <dd className="mt-0.5">
                {sourceDataset ? (
                  <Link
                    href={`/datasets/${sourceDataset.id}`}
                    className="text-zinc-900 dark:text-zinc-50 hover:underline"
                  >
                    {sourceDataset.name}
                  </Link>
                ) : (
                  <span className="text-zinc-500 italic">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Base model
              </dt>
              <dd className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-50">
                {adapter.baseModel}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Created
              </dt>
              <dd className="mt-0.5 text-zinc-700 dark:text-zinc-300">
                {formatDate(adapter.createdAt)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Weights
              </dt>
              <dd className="mt-0.5 font-mono text-xs text-zinc-700 dark:text-zinc-300 break-all">
                {adapter.weightsPath ?? (
                  <span className="text-zinc-500 italic font-sans">
                    Not trained yet — no weights on disk.
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {adapter.evaluationMetrics ? (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
            <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
              Evaluation metrics
            </h2>
            <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
              {JSON.stringify(adapter.evaluationMetrics, null, 2)}
            </pre>
          </div>
        ) : null}

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
            Used by ({referencingWorkflows.length})
          </h2>
          {referencingWorkflows.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">
              No workflow currently binds this adapter.
            </p>
          ) : (
            <ul className="text-sm space-y-1">
              {referencingWorkflows.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/workflows/${w.id}`}
                    className="text-zinc-900 dark:text-zinc-50 hover:underline"
                  >
                    {w.name}{" "}
                    <span className="font-mono text-xs text-zinc-500">
                      v{w.version}
                    </span>
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
