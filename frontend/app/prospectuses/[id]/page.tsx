import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { api, type Prospectus, type ProspectusClause } from "@/lib/api";

const TYPE_TONE: Record<string, string> = {
  subordination:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  maturity:
    "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  call_option:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  ranking:
    "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300",
  security:
    "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  governing_law:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  issuer:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
};

export default async function ProspectusDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let prospectus: Prospectus;
  let clauses: ProspectusClause[] = [];
  try {
    prospectus = await api.prospectus(id);
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) notFound();
    throw e;
  }
  try {
    clauses = await api.prospectusClauses(id);
  } catch {
    // Extraction is a preview — silently degrade if it errors.
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title={prospectus.name}
        description={prospectus.summary ?? "Stored prospectus text."}
      />
      <div className="px-8 pt-3 pb-2 flex items-center justify-between">
        <Link
          href="/prospectuses"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← All prospectuses
        </Link>
        <p className="text-xs text-zinc-500">
          {prospectus.identifier ? (
            <span className="font-mono">{prospectus.identifier} · </span>
          ) : null}
          {prospectus.source} · {prospectus.text.length.toLocaleString()} chars
        </p>
      </div>

      <section className="px-8 py-4">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
          Extracted clauses ({clauses.length})
        </h2>
        {clauses.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">
            No § sections detected — the extractor couldn&apos;t anchor any
            clauses in this text.
          </p>
        ) : (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium font-mono text-xs w-20">
                    Section
                  </th>
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Text</th>
                </tr>
              </thead>
              <tbody>
                {clauses.map((c) => {
                  const tone =
                    TYPE_TONE[c.type] ??
                    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
                  return (
                    <tr
                      key={c.section}
                      className="border-t border-zinc-200 dark:border-zinc-800 align-top"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                        {c.section}
                      </td>
                      <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50 whitespace-nowrap">
                        {c.title}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-mono ${tone}`}
                        >
                          {c.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {c.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="px-8 py-4">
        <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
          Raw text
        </h2>
        <pre className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap font-mono leading-relaxed">
          {prospectus.text}
        </pre>
      </section>
    </div>
  );
}
