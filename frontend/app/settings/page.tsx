import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";

export default async function SettingsPage() {
  let status: Awaited<ReturnType<typeof api.ollamaStatus>> | null = null;
  let models: Awaited<ReturnType<typeof api.ollamaModels>> = [];
  let error: string | null = null;
  try {
    [status, models] = await Promise.all([
      api.ollamaStatus(),
      api.ollamaModels(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Settings"
        description="Local runtime configuration. LoRA Forge is local-first — no external APIs."
      />
      <section className="px-8 py-6 space-y-4 max-w-2xl">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
            Ollama
          </h2>
          {error ? (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              Backend unreachable — start the FastAPI server on :8000.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Base URL:{" "}
                <span className="font-mono text-zinc-900 dark:text-zinc-50">
                  {status?.baseUrl}
                </span>
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Status:{" "}
                <span
                  className={
                    status?.reachable
                      ? "text-green-600 dark:text-green-400"
                      : "text-zinc-500"
                  }
                >
                  {status?.reachable ? "reachable" : "unreachable (stubbed)"}
                </span>
              </p>
              <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">
                Models
              </p>
              <ul className="mt-1 space-y-1">
                {models.map((m) => (
                  <li
                    key={m.name}
                    className="text-sm text-zinc-700 dark:text-zinc-300"
                  >
                    <span className="font-mono">{m.name}</span>{" "}
                    <span className="text-zinc-500">· {m.size}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
