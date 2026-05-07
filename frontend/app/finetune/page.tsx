import { FineTuneHistory } from "@/components/finetune-history";
import { FineTunePipeline } from "@/components/finetune-pipeline";
import { FineTuneForm } from "@/components/finetune-form";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";

export default async function FineTunePage() {
  let datasets: Awaited<ReturnType<typeof api.datasets>> = [];
  let models: Awaited<ReturnType<typeof api.ollamaModels>> = [];
  let runs: Awaited<ReturnType<typeof api.finetuneRuns>> = [];
  let error: string | null = null;
  try {
    [datasets, models, runs] = await Promise.all([
      api.datasets(),
      api.ollamaModels().catch(() => []),
      api.finetuneRuns(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Fine-tune"
        description="Produce a versioned LoRA adapter from a dataset. Real QLoRA training runs in the background — the page polls for live progress."
      />
      <section className="px-8 py-6 space-y-5 max-w-4xl">
        {error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
            Backend unreachable — start the FastAPI server on :8001. ({error})
          </div>
        ) : null}

        <FineTunePipeline />
        <FineTuneForm datasets={datasets} models={models} />
        <FineTuneHistory initialRuns={runs} />
      </section>
    </div>
  );
}
