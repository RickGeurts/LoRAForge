import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { api, type Prospectus } from "@/lib/api";

export default async function ProspectusDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let prospectus: Prospectus;
  try {
    prospectus = await api.prospectus(id);
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) notFound();
    throw e;
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
        <pre className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap font-mono leading-relaxed">
          {prospectus.text}
        </pre>
      </section>
    </div>
  );
}
