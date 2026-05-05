import { PageHeader } from "@/components/page-header";

const TILES = [
  {
    title: "Templates",
    body: "Curated workflows for MREL eligibility, prospectus extraction, and instrument classification.",
  },
  {
    title: "Adapters",
    body: "Versioned LoRA adapters with base-model compatibility and evaluation metrics.",
  },
  {
    title: "Runs",
    body: "Auditable workflow executions with traceable reasoning and source references.",
  },
  {
    title: "Ollama",
    body: "Local-first runtime status and pulled models — no external APIs.",
  },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Dashboard"
        description="Local-first regulatory AI workflow builder. Auditable, traceable, and human-reviewable."
      />
      <section className="px-8 py-6 grid gap-4 sm:grid-cols-2 max-w-4xl">
        {TILES.map((tile) => (
          <div
            key={tile.title}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950"
          >
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
              {tile.title}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {tile.body}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
