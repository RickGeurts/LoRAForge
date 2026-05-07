"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";

export function NewWorkflowForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const workflow = await api.createBlankWorkflow(name.trim());
      router.push(`/workflows/${workflow.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 flex items-end gap-3"
    >
      <label className="flex-1 text-xs uppercase tracking-wide text-zinc-500">
        New workflow
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. AT1 Eligibility Assessment"
          className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create →"}
      </button>
      {error ? (
        <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
      ) : null}
    </form>
  );
}
