import Link from "next/link";

import { NewWorkflowForm } from "@/components/new-workflow-form";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";

export default async function WorkflowsPage() {
  let workflows: Awaited<ReturnType<typeof api.workflows>> = [];
  let error: string | null = null;
  try {
    workflows = await api.workflows();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Workflows"
        description="Visual, auditable workflow definitions. Open one to edit it on the drag-and-drop canvas."
      />
      <section className="px-8 py-6 space-y-5 max-w-3xl">
        {error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
            Backend unreachable — start the FastAPI server on :8001. ({error})
          </div>
        ) : null}

        <NewWorkflowForm />

        {error ? null : workflows.length === 0 ? (
          <p className="text-sm text-zinc-500">No workflows yet.</p>
        ) : (
          <div className="space-y-3">
            {workflows.map((w) => (
              <Link
                key={w.id}
                href={`/workflows/${w.id}`}
                className="block rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
                    {w.name}
                  </h2>
                  <span className="text-xs text-zinc-500">v{w.version}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {w.description}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  {w.nodes.length} nodes · {w.edges.length} edges · Open editor →
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
