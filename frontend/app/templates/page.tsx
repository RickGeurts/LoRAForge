import { PageHeader } from "@/components/page-header";
import { UseTemplateButton } from "@/components/use-template-button";
import { api } from "@/lib/api";

export default async function TemplatesPage() {
  let templates: Awaited<ReturnType<typeof api.templates>> = [];
  let error: string | null = null;
  try {
    templates = await api.templates();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Templates"
        description="Pre-built regulatory workflows. Clone a template to start a new workflow."
      />
      <section className="px-8 py-6 space-y-3 max-w-3xl">
        {error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
            Backend unreachable — start the FastAPI server on :8001. ({error})
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-zinc-500">No templates available.</p>
        ) : (
          templates.map((t) => (
            <div
              key={t.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
                  {t.name}
                </h2>
                <span className="text-xs text-zinc-500">
                  {t.nodeCount} nodes · {t.edgeCount} edges
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t.description}
              </p>
              <div className="mt-4">
                <UseTemplateButton templateId={t.id} />
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
