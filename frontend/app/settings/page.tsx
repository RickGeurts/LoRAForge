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
              Backend unreachable — start the FastAPI server on :8001.
            </p>
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <dt className="text-zinc-500">Base URL</dt>
                <dd className="font-mono text-zinc-900 dark:text-zinc-50">
                  {status?.baseUrl}
                </dd>
                <dt className="text-zinc-500">Status</dt>
                <dd
                  className={
                    status?.reachable
                      ? "text-green-600 dark:text-green-400"
                      : "text-zinc-500"
                  }
                >
                  {status?.reachable
                    ? "reachable"
                    : `unreachable${status?.error ? ` (${status.error})` : ""}`}
                </dd>
                {status?.reachable && status?.version ? (
                  <>
                    <dt className="text-zinc-500">Version</dt>
                    <dd className="font-mono text-zinc-900 dark:text-zinc-50">
                      {status.version}
                    </dd>
                  </>
                ) : null}
                {status?.reachable && typeof status?.modelCount === "number" ? (
                  <>
                    <dt className="text-zinc-500">Installed models</dt>
                    <dd className="text-zinc-900 dark:text-zinc-50">
                      {status.modelCount}
                    </dd>
                  </>
                ) : null}
              </dl>
              <p className="mt-4 text-xs uppercase tracking-wide text-zinc-500">
                Models {!status?.reachable ? "(stubbed)" : ""}
              </p>
              {models.length === 0 ? (
                <p className="mt-1 text-sm text-zinc-500">
                  No models installed. Run{" "}
                  <code className="font-mono">ollama pull llama3.1:8b</code> to
                  add one.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {models.map((m) => (
                    <li
                      key={m.name}
                      className="text-sm text-zinc-700 dark:text-zinc-300"
                    >
                      <span className="font-mono">{m.name}</span>{" "}
                      <span className="text-zinc-500">
                        · {m.size} · {m.family}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!status?.reachable ? (
                <p className="mt-4 text-xs text-zinc-500">
                  Start Ollama locally (default{" "}
                  <code className="font-mono">localhost:11434</code>) and reload
                  this page to enable real inference. AI workflow nodes use a
                  deterministic fallback while Ollama is unreachable.
                </p>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
