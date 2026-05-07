"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";

export function DeleteWorkflowButton({
  workflowId,
  workflowName,
  redirectTo,
  variant = "subtle",
}: {
  workflowId: string;
  workflowName: string;
  redirectTo?: string;
  variant?: "subtle" | "danger";
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const onClick = async () => {
    if (!window.confirm(`Delete workflow "${workflowName}"? This can't be undone.`)) {
      return;
    }
    setSubmitting(true);
    try {
      await api.deleteWorkflow(workflowId);
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      window.alert(
        err instanceof Error ? `Delete failed: ${err.message}` : "Delete failed.",
      );
      setSubmitting(false);
    }
  };

  const styles =
    variant === "danger"
      ? "text-sm px-3 py-1.5 rounded-md border border-red-300 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
      : "text-xs px-2 py-1 rounded-md text-zinc-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={submitting}
      className={`${styles} disabled:opacity-50 transition-colors`}
    >
      {submitting ? "Deleting…" : variant === "danger" ? "Delete workflow" : "Delete"}
    </button>
  );
}
