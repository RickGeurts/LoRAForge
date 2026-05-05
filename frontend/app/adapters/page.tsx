import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";

export default async function AdaptersPage() {
  let adapters: Awaited<ReturnType<typeof api.adapters>> = [];
  let error: string | null = null;
  try {
    adapters = await api.adapters();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Adapters"
        description="LoRA adapter registry. Adapters are governed, versioned artifacts bound to a base model."
      />
      <section className="px-8 py-6 max-w-4xl">
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
                  <th className="px-4 py-2.5 font-medium">Version</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {adapters.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <td className="px-4 py-2.5 text-zinc-900 dark:text-zinc-50">
                      {a.name}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                      {a.taskType}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                      {a.baseModel}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                      {a.version}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                        {a.status}
                      </span>
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
