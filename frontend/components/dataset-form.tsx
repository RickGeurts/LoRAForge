"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api, type DatasetSource } from "@/lib/api";

const TASK_TYPES = [
  { value: "mrel_classifier", label: "MREL classifier" },
  { value: "instrument_classifier", label: "Instrument classifier" },
  { value: "clause_extractor", label: "Clause extractor" },
  { value: "validator", label: "Validator" },
  { value: "other", label: "Other" },
] as const;

const SOURCE_TYPES: Array<{ value: DatasetSource; label: string }> = [
  { value: "mock", label: "Mock / synthetic" },
  { value: "file", label: "File upload (placeholder)" },
  { value: "text", label: "Pasted text" },
  { value: "external", label: "External system" },
];

export function DatasetForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState<typeof TASK_TYPES[number]["value"]>(
    "mrel_classifier",
  );
  const [sourceType, setSourceType] = useState<DatasetSource>("mock");
  const [summary, setSummary] = useState("");
  const [rowCount, setRowCount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createDataset({
        name: name.trim(),
        taskType,
        sourceType,
        summary: summary.trim(),
        rowCount,
      });
      setName("");
      setSummary("");
      setRowCount(0);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 space-y-3"
    >
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
        New dataset
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs uppercase tracking-wide text-zinc-500 col-span-2">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. MREL prospectus corpus v2"
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Task type
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as typeof taskType)}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          >
            {TASK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Source
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as DatasetSource)}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          >
            {SOURCE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500 col-span-2">
          Summary
          <input
            required
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Short description of the data and its annotations"
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Row count
          <input
            type="number"
            min={0}
            value={rowCount}
            onChange={(e) => setRowCount(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          />
        </label>
      </div>
      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create dataset"}
        </button>
      </div>
    </form>
  );
}
