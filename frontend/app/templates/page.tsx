import { PageHeader } from "@/components/page-header";

const TEMPLATES = [
  {
    name: "MREL Eligibility Assessment",
    description:
      "Classify an instrument as MREL-eligible based on prospectus clauses, subordination, and maturity.",
  },
  {
    name: "Prospectus Clause Extraction",
    description:
      "Extract relevant clauses (subordination, ranking, maturity, governing law) from a prospectus PDF.",
  },
  {
    name: "Instrument Classification",
    description:
      "Classify a financial instrument by type, ranking, and regulatory bucket.",
  },
];

export default function TemplatesPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Templates"
        description="Pre-built regulatory workflows. Clone a template to start a new workflow."
      />
      <section className="px-8 py-6 space-y-3 max-w-3xl">
        {TEMPLATES.map((t) => (
          <div
            key={t.name}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950"
          >
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
              {t.name}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {t.description}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
