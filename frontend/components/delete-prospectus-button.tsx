"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";

export function DeleteProspectusButton({
  id,
  label,
  className,
}: {
  id: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete prospectus "${label}"? This can't be undone.`)) {
      return;
    }
    setSubmitting(true);
    try {
      await api.deleteProspectus(id);
      router.refresh();
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
      className={
        className ??
        "text-xs px-2 py-1 rounded-md text-zinc-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
      }
    >
      {submitting ? "Deleting…" : "Delete"}
    </button>
  );
}
