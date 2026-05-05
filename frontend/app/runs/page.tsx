import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";

export default async function RunsPage() {
  let runs: Awaited<ReturnType<typeof api.runs>> = [];
  let error: string | null = null;
  try {
    runs = await api.runs();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Runs"
        description="Auditable execution history. Each run records workflow version, adapter version, decision, confidence, sources, and timestamp."
      />
      <section className="px-8 py-6 space-y-3 max-w-3xl">
        {error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
            Backend unreachable — start the FastAPI server on :8001. ({error})
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-zinc-500">No runs yet.</p>
        ) : (
          runs.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-xs text-zinc-500">{r.id}</span>
                <span className="text-xs text-zinc-500">{r.status}</span>
              </div>
              {r.output ? (
                <>
                  <p className="mt-2 text-sm text-zinc-900 dark:text-zinc-50">
                    {r.output.decision}{" "}
                    <span className="text-zinc-500">
                      ({Math.round(r.output.confidence * 100)}% confidence)
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {r.output.explanation}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    Sources: {r.output.sources.join(", ") || "—"}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No output yet.</p>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
