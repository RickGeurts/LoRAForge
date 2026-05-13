"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api, type DatasetSource, type Task } from "@/lib/api";

const SOURCE_TYPES: Array<{ value: DatasetSource; label: string }> = [
  { value: "mock", label: "Mock / synthetic" },
  { value: "file", label: "File upload (placeholder)" },
  { value: "text", label: "Pasted text" },
  { value: "external", label: "External system" },
];

export function DatasetForm({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState<string>(tasks[0]?.id ?? "");
  const [sourceType, setSourceType] = useState<DatasetSource>("mock");
  const [summary, setSummary] = useState("");
  const [rowCount, setRowCount] = useState<number>(0);
  const [labelColumn, setLabelColumn] = useState("label");
  const [textColumn, setTextColumn] = useState("excerpt");
  const [rationaleColumn, setRationaleColumn] = useState("rationale");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTask = tasks.find((t) => t.id === taskType) ?? null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskType) {
      setError("Pick a task first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createDataset({
        name: name.trim(),
        taskType,
        sourceType,
        summary: summary.trim(),
        rowCount,
        labelColumn: labelColumn.trim() || "label",
        textColumn: textColumn.trim() || "excerpt",
        rationaleColumn: rationaleColumn.trim() || null,
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

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-900 dark:text-amber-200">
        No tasks defined yet. Define one on the{" "}
        <Link href="/tasks" className="underline">
          Tasks
        </Link>{" "}
        page before creating a dataset.
      </div>
    );
  }

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
          Task
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          >
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Link
            href="/tasks"
            className="block mt-1 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 normal-case tracking-normal"
          >
            None match? → Define a new task
          </Link>
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

      <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
          Column mapping
        </p>
        <p className="text-[11px] text-zinc-500 normal-case tracking-normal leading-relaxed">
          Which fields of each row hold the label, the source text, and the
          rationale. Used by fine-tune to materialise (prompt, completion)
          pairs.
          {selectedTask && selectedTask.kind === "classifier" ? (
            <>
              {" "}
              Classifier rows must carry a label from the task&apos;s set:{" "}
              <span className="font-mono">
                {selectedTask.labels.join(", ") || "(none defined)"}
              </span>
              .
            </>
          ) : null}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-[11px] uppercase tracking-wide text-zinc-500">
            Label column
            <input
              value={labelColumn}
              onChange={(e) => setLabelColumn(e.target.value)}
              placeholder="label"
              className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs font-mono"
            />
          </label>
          <label className="text-[11px] uppercase tracking-wide text-zinc-500">
            Text column
            <input
              value={textColumn}
              onChange={(e) => setTextColumn(e.target.value)}
              placeholder="excerpt"
              className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs font-mono"
            />
          </label>
          <label className="text-[11px] uppercase tracking-wide text-zinc-500">
            Rationale column
            <input
              value={rationaleColumn}
              onChange={(e) => setRationaleColumn(e.target.value)}
              placeholder="rationale (optional)"
              className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs font-mono"
            />
          </label>
        </div>
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
