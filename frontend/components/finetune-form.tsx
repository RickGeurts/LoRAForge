"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api, type Dataset, type OllamaModel } from "@/lib/api";

// Bases that the backend's real_finetune.py knows how to load via
// HuggingFace + peft + bitsandbytes. Keep in sync with is_supported_base.
const HF_TRAINING_BASES = [
  {
    id: "Qwen/Qwen2.5-3B-Instruct",
    label: "Qwen/Qwen2.5-3B-Instruct (GPU QLoRA, ~6GB download)",
  },
];

export function FineTuneForm({
  datasets,
  models,
}: {
  datasets: Dataset[];
  models: OllamaModel[];
}) {
  const router = useRouter();
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const initialModel = useMemo(
    () => models.find((m) => !m.stub)?.name ?? models[0]?.name ?? "",
    [models],
  );
  const [baseModel, setBaseModel] = useState(initialModel);
  const [adapterName, setAdapterName] = useState("");
  const [epochs, setEpochs] = useState(3);
  const [learningRate, setLearningRate] = useState(0.0002);
  const [batchSize, setBatchSize] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDataset = datasets.find((d) => d.id === datasetId);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datasetId) {
      setError("Pick a dataset first.");
      return;
    }
    if (!adapterName.trim()) {
      setError("Adapter name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const run = await api.createFinetuneRun({
        datasetId,
        baseModel,
        adapterName: adapterName.trim(),
        hyperparams: { epochs, learningRate, batchSize },
      });
      router.push(`/finetune/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Training run failed.");
      setSubmitting(false);
    }
  };

  if (datasets.length === 0) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
        No datasets available. Add one on the{" "}
        <a href="/datasets" className="underline">
          Datasets
        </a>{" "}
        page before starting a training run.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 space-y-4"
    >
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
        Start a training run
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs uppercase tracking-wide text-zinc-500 col-span-2">
          Dataset
          <select
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.taskType} · {d.rowCount.toLocaleString()} rows
              </option>
            ))}
          </select>
          {selectedDataset ? (
            <span className="block mt-1 text-[11px] text-zinc-500 normal-case tracking-normal">
              {selectedDataset.summary}
            </span>
          ) : null}
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Base model
          <select
            value={baseModel}
            onChange={(e) => setBaseModel(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          >
            {models.length > 0 ? (
              <optgroup label="Ollama (mock training)">
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} {m.stub ? "(stubbed)" : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="HuggingFace (real GPU training)">
              {HF_TRAINING_BASES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </optgroup>
          </select>
          <span className="block mt-1 text-[11px] text-zinc-500 normal-case tracking-normal">
            HF bases run real QLoRA on the GPU. First run downloads weights —
            expect a few minutes.
          </span>
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Adapter name
          <input
            required
            value={adapterName}
            onChange={(e) => setAdapterName(e.target.value)}
            placeholder="MREL Classifier v2"
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Epochs
          <input
            type="number"
            min={1}
            max={100}
            value={epochs}
            onChange={(e) => setEpochs(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm tabular-nums"
          />
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Learning rate
          <input
            type="number"
            step={0.0001}
            min={0.00001}
            max={0.1}
            value={learningRate}
            onChange={(e) => setLearningRate(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm tabular-nums"
          />
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Batch size
          <input
            type="number"
            min={1}
            max={512}
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm tabular-nums"
          />
        </label>
      </div>
      <p className="text-[11px] text-zinc-500">
        Training is mocked: metrics and adapter weights are derived
        deterministically from the inputs above. No real GPU work happens.
      </p>
      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Training…" : "Start training run"}
        </button>
      </div>
    </form>
  );
}
