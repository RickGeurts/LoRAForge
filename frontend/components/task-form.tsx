"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api, type NodeGroup, type Task } from "@/lib/api";

type Mode = { kind: "create" } | { kind: "edit"; task: Task };

const NODE_GROUPS: NodeGroup[] = ["documents", "ai", "rules", "logic", "output"];

export function TaskForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const initial = mode.kind === "edit" ? mode.task : null;

  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [nodeGroup, setNodeGroup] = useState<NodeGroup>(
    initial?.nodeGroup ?? "ai",
  );
  const [defaultBaseModel, setDefaultBaseModel] = useState(
    initial?.defaultBaseModel ?? "llama3.1:8b",
  );
  const [promptTemplate, setPromptTemplate] = useState(
    initial?.promptTemplate ?? "",
  );
  const [expectedOutput, setExpectedOutput] = useState(
    initial?.expectedOutput ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        promptTemplate,
        expectedOutput,
        nodeGroup,
        defaultBaseModel: defaultBaseModel.trim(),
      };
      const task =
        mode.kind === "create"
          ? await api.createTask({
              ...payload,
              id: id.trim() || undefined,
            })
          : await api.replaceTask(mode.task.id, payload);
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 space-y-4"
    >
      {mode.kind === "edit" && mode.task.builtin ? (
        <p className="text-xs text-zinc-500">
          Builtin task — id and existence are protected, but every other field
          is editable.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <label className="text-xs uppercase tracking-wide text-zinc-500 col-span-2">
          ID
          {mode.kind === "create" ? (
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="auto-derived from name if blank"
              pattern="^[a-z][a-z0-9_]*$"
              className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-mono text-zinc-900 dark:text-zinc-50"
            />
          ) : (
            <p className="mt-1 text-sm font-mono text-zinc-900 dark:text-zinc-50">
              {mode.task.id}
            </p>
          )}
          <span className="block mt-1 text-[11px] text-zinc-500 normal-case tracking-normal">
            Used by adapters, datasets, and AI nodes. Lowercase letters, digits,
            and underscores only.
          </span>
        </label>

        <label className="text-xs uppercase tracking-wide text-zinc-500 col-span-2">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. AT1 Trigger Detection"
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="text-xs uppercase tracking-wide text-zinc-500 col-span-2">
          Description
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="One paragraph: what this task decides or extracts."
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Node group
          <select
            value={nodeGroup}
            onChange={(e) => setNodeGroup(e.target.value as NodeGroup)}
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm"
          >
            {NODE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Default base model
          <input
            value={defaultBaseModel}
            onChange={(e) => setDefaultBaseModel(e.target.value)}
            placeholder="llama3.1:8b"
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-mono"
          />
        </label>

        <label className="text-xs uppercase tracking-wide text-zinc-500 col-span-2">
          Prompt template
          <textarea
            value={promptTemplate}
            onChange={(e) => setPromptTemplate(e.target.value)}
            rows={5}
            placeholder="Use {document}, {clause}, {context} as slots. Leave blank for non-AI tasks."
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-mono text-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="text-xs uppercase tracking-wide text-zinc-500 col-span-2">
          Expected output
          <textarea
            value={expectedOutput}
            onChange={(e) => setExpectedOutput(e.target.value)}
            rows={3}
            placeholder="Free-text spec for now (later: JSON schema)."
            className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50"
          />
        </label>
      </div>

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : null}

      <div className="flex justify-end gap-3">
        <Link
          href={mode.kind === "create" ? "/tasks" : `/tasks/${mode.task.id}`}
          className="text-sm px-3 py-1.5 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
        >
          {submitting
            ? "Saving…"
            : mode.kind === "create"
              ? "Create task"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}
