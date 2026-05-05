const STAGES = [
  { id: "stage_dataset", label: "Dataset", tone: "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40" },
  { id: "stage_preprocess", label: "Preprocess", tone: "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40" },
  { id: "stage_base_model", label: "Base Model", tone: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" },
  { id: "stage_trainer", label: "LoRA Trainer", tone: "border-pink-300 bg-pink-50 dark:border-pink-800 dark:bg-pink-950/40" },
  { id: "stage_evaluation", label: "Evaluation", tone: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40" },
] as const;

export function FineTunePipeline({
  highlightedStage,
}: {
  highlightedStage?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
        Fine-tune pipeline
      </p>
      <div className="flex items-center gap-2 overflow-x-auto">
        {STAGES.map((stage, i) => (
          <div key={stage.id} className="flex items-center gap-2 shrink-0">
            <div
              className={[
                "rounded-md border px-3 py-2 min-w-[110px] text-center text-sm",
                stage.tone,
                highlightedStage === stage.id
                  ? "ring-2 ring-zinc-900 dark:ring-zinc-100"
                  : "",
              ].join(" ")}
            >
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {stage.label}
              </p>
            </div>
            {i < STAGES.length - 1 ? (
              <span className="text-zinc-400 dark:text-zinc-600">→</span>
            ) : null}
          </div>
        ))}
        <span className="text-zinc-400 dark:text-zinc-600 shrink-0">→</span>
        <div className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm shrink-0 min-w-[110px] text-center">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            Adapter Registry
          </p>
        </div>
      </div>
    </div>
  );
}
