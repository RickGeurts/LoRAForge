"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";

export function ProspectusForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [summary, setSummary] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError("Paste the prospectus text.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createProspectus({
        name: name.trim(),
        identifier: identifier.trim() || null,
        summary: summary.trim() || null,
        text,
      });
      setName("");
      setIdentifier("");
      setSummary("");
      setText("");
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
        New prospectus
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ResolutionCo 2031 Subordinated Notes"
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Identifier (ISIN, optional)
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="XS2031000001"
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50 font-mono"
          />
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500 col-span-2">
          Summary (optional)
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One-line description of the instrument"
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs uppercase tracking-wide text-zinc-500 col-span-2">
          Text
          <textarea
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={
              "PROSPECTUS — EUR ...\n\n§3 Status: ...\n\n§4.1 Maturity: ...\n\n§7 Governing Law: ..."
            }
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-50"
          />
          <span className="block mt-1 text-[11px] text-zinc-500 normal-case tracking-normal">
            Use <code className="font-mono">§&lt;number&gt; &lt;Title&gt;:</code>{" "}
            section headings — the clause extractor anchors decisions to those
            markers.
          </span>
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
          {submitting ? "Creating…" : "Create prospectus"}
        </button>
      </div>
    </form>
  );
}
