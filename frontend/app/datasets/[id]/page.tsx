import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { api, type Dataset } from "@/lib/api";

const LABEL_TONE: Record<string, string> = {
  eligible:
    "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  not_eligible:
    "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};

const COLUMN_PRIORITY = [
  "rowId",
  "instrument",
  "clauseRef",
  "subordination",
  "maturityYears",
  "secured",
  "governingLaw",
  "label",
  "rationale",
  "excerpt",
];

function orderedColumns(rows: Dataset["rows"]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) seen.add(k);
  }
  const ranked = COLUMN_PRIORITY.filter((c) => seen.has(c));
  const extras = [...seen].filter((c) => !COLUMN_PRIORITY.includes(c)).sort();
  return [...ranked, ...extras];
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

export default async function DatasetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let dataset: Dataset;
  try {
    dataset = await api.dataset(id);
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) notFound();
    throw e;
  }

  const columns = orderedColumns(dataset.rows);

  return (
    <div className="flex flex-col">
      <PageHeader title={dataset.name} description={dataset.summary} />
      <div className="px-8 pt-3 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/datasets"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← All datasets
        </Link>
        <p className="text-xs text-zinc-500">
          <span className="font-mono">{dataset.taskType}</span> · {dataset.sourceType}{" "}
          · {dataset.rowCount.toLocaleString()} rows
        </p>
      </div>

      <div className="px-8 pb-2 text-[11px] text-zinc-500">
        Column mapping:{" "}
        <code className="font-mono text-zinc-700 dark:text-zinc-300">
          label={dataset.labelColumn}
        </code>{" "}
        ·{" "}
        <code className="font-mono text-zinc-700 dark:text-zinc-300">
          text={dataset.textColumn}
        </code>
        {dataset.rationaleColumn ? (
          <>
            {" "}·{" "}
            <code className="font-mono text-zinc-700 dark:text-zinc-300">
              rationale={dataset.rationaleColumn}
            </code>
          </>
        ) : null}
      </div>

      <section className="px-8 py-4">
        {dataset.rows.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 text-sm text-zinc-500">
            No rows stored on this dataset. Datasets created via the UI capture
            metadata only — seed datasets ship with example rows.
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="px-3 py-2 font-medium font-mono text-xs whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.rows.map((row, i) => (
                  <tr
                    key={(row.rowId as string | undefined) ?? i}
                    className="border-t border-zinc-200 dark:border-zinc-800 align-top"
                  >
                    {columns.map((c) => {
                      const v = row[c];
                      if (c === "label" && typeof v === "string") {
                        const tone = LABEL_TONE[v] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
                        return (
                          <td key={c} className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${tone}`}>
                              {v}
                            </span>
                          </td>
                        );
                      }
                      const formatted = formatCell(v);
                      const isLong = c === "excerpt" || c === "rationale";
                      return (
                        <td
                          key={c}
                          className={
                            isLong
                              ? "px-3 py-2.5 text-zinc-700 dark:text-zinc-300 min-w-[24rem]"
                              : "px-3 py-2.5 text-zinc-700 dark:text-zinc-300 whitespace-nowrap"
                          }
                        >
                          {formatted}
                        </td>
                      );
                    })}
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
