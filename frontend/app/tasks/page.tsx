import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { api, type NodeGroup } from "@/lib/api";

const GROUP_TONE: Record<NodeGroup, string> = {
  documents: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  ai: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  rules: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  logic: "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300",
  output: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
};

export default async function TasksPage() {
  let tasks: Awaited<ReturnType<typeof api.tasks>> = [];
  let error: string | null = null;
  try {
    tasks = await api.tasks();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Tasks"
        description="Define what your AI nodes do. Adapters, datasets, and workflow nodes all reference a task by id."
      />
      <div className="px-8 pt-3 pb-2 flex justify-end max-w-3xl">
        <Link
          href="/tasks/new"
          className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90"
        >
          + New task
        </Link>
      </div>
      <section className="px-8 py-6 space-y-3 max-w-3xl">
        {error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
            Backend unreachable — start the FastAPI server on :8001. ({error})
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No tasks defined.</p>
        ) : (
          tasks.map((t) => (
            <Link
              key={t.id}
              href={`/tasks/${t.id}`}
              className="block rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="flex items-baseline gap-3">
                  <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
                    {t.name}
                  </h2>
                  <span className="font-mono text-xs text-zinc-500">{t.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${GROUP_TONE[t.nodeGroup]}`}
                  >
                    {t.nodeGroup}
                  </span>
                  {t.builtin ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      builtin
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t.description}
              </p>
              <p className="mt-2 text-xs text-zinc-500 truncate">
                base: <span className="font-mono">{t.defaultBaseModel}</span>
                {t.promptTemplate ? " · prompt template defined" : " · no prompt"}
              </p>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
