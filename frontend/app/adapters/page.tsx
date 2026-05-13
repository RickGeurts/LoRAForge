import Link from "next/link";

import { DeleteRowButton } from "@/components/delete-row-button";
import { PageHeader } from "@/components/page-header";
import { TaskChip } from "@/components/task-chip";
import { api } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdaptersPage() {
  let adapters: Awaited<ReturnType<typeof api.adapters>> = [];
  let tasks: Awaited<ReturnType<typeof api.tasks>> = [];
  let error: string | null = null;
  try {
    [adapters, tasks] = await Promise.all([
      api.adapters(),
      api.tasks().catch(() => []),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const sorted = [...adapters].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Adapters"
        description="LoRA adapter registry. Adapters are governed, versioned artifacts bound to a base model and a target task."
      />
      <section className="px-8 py-6 max-w-5xl">
        {error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
            Backend unreachable — start the FastAPI server on :8001. ({error})
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Task</th>
                  <th className="px-4 py-2.5 font-medium">Base model</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 font-medium text-right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                  >
                    <td className="px-4 py-2.5 text-zinc-900 dark:text-zinc-50">
                      <Link
                        href={`/adapters/${a.id}`}
                        className="block hover:underline"
                      >
                        {a.name}
                      </Link>
                      <p className="text-xs font-mono text-zinc-500">
                        {a.id} · v{a.version}
                        {a.weightsPath ? " · LoRA weights on disk" : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <TaskChip
                        task={taskById.get(a.taskType) ?? null}
                        taskType={a.taskType}
                        showLabels
                      />
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                      {a.baseModel}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500 whitespace-nowrap">
                      {formatDate(a.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <DeleteRowButton
                        kind="adapter"
                        id={a.id}
                        label={a.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
