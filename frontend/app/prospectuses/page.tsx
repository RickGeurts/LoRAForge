import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { ProspectusForm } from "@/components/prospectus-form";
import { DeleteProspectusButton } from "@/components/delete-prospectus-button";
import { api } from "@/lib/api";

export default async function ProspectusesPage() {
  let prospectuses: Awaited<ReturnType<typeof api.prospectuses>> = [];
  let error: string | null = null;
  try {
    prospectuses = await api.prospectuses();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Prospectuses"
        description="Bond and note prospectuses used by the Prospectus Loader node. The clause extractor anchors decisions to § sections in this text."
      />
      <section className="px-8 py-6 space-y-5 max-w-4xl">
        {error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
            Backend unreachable — start the FastAPI server on :8001. ({error})
          </div>
        ) : null}

        <ProspectusForm />

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Identifier</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium tabular-nums">Size</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {prospectuses.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No prospectuses yet. Paste one with the form above.
                  </td>
                </tr>
              ) : (
                prospectuses.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-zinc-200 dark:border-zinc-800 align-top hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/prospectuses/${p.id}`}
                        className="block text-zinc-900 dark:text-zinc-50 hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.summary ? (
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {p.summary}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                      {p.identifier ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {p.source}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 tabular-nums">
                      {p.text.length.toLocaleString()} chars
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeleteProspectusButton id={p.id} label={p.name} />
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
