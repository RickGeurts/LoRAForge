"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";

export function UseTemplateButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const workflow = await api.cloneTemplate(templateId);
      router.push(`/workflows/${workflow.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clone failed.");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={submitting}
        className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Use template →"}
      </button>
      {error ? (
        <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
      ) : null}
    </div>
  );
}
