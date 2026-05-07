import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { DatasetForm } from "@/components/dataset-form";
import { api } from "@/lib/api";

export default async function DatasetsPage() {
  let datasets: Awaited<ReturnType<typeof api.datasets>> = [];
  let error: string | null = null;
  try {
    datasets = await api.datasets();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Datasets"
        description="Training data sources for fine-tuning adapters. Each dataset is a versioned, governed artifact."
      />
      <section className="px-8 py-6 space-y-5 max-w-4xl">
        {error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
            Backend unreachable — start the FastAPI server on :8001. ({error})
          </div>
        ) : null}

        <DatasetForm />

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Task</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium tabular-nums">Rows</th>
              </tr>
            </thead>
            <tbody>
              {datasets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                    No datasets yet. Add one with the form above.
                  </td>
                </tr>
              ) : (
                datasets.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-zinc-200 dark:border-zinc-800 align-top hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/datasets/${d.id}`}
                        className="block text-zinc-900 dark:text-zinc-50 hover:underline"
                      >
                        {d.name}
                      </Link>
                      <p className="text-xs text-zinc-500 mt-0.5">{d.summary}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                      {d.taskType}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {d.sourceType}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 tabular-nums">
                      {d.rowCount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
