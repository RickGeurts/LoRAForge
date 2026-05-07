"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";

export function DeleteTaskButton({
  taskId,
  taskName,
}: {
  taskId: string;
  taskName: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const onClick = async () => {
    if (!window.confirm(`Delete task "${taskName}"? This can't be undone.`)) {
      return;
    }
    setSubmitting(true);
    try {
      await api.deleteTask(taskId);
      router.push("/tasks");
    } catch (err) {
      window.alert(
        err instanceof Error ? `Delete failed: ${err.message}` : "Delete failed.",
      );
      setSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={submitting}
      className="text-sm px-3 py-1.5 rounded-md border border-red-300 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
    >
      {submitting ? "Deleting…" : "Delete task"}
    </button>
  );
}
