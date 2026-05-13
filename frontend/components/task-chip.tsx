import Link from "next/link";

import type { Task } from "@/lib/api";

type Props = {
  task: Task | null;
  // Fallback when the task isn't in the registry anymore (deleted, etc.).
  taskType?: string;
  // When true, show classifier labels (or label count) inline.
  showLabels?: boolean;
  // When true, the whole chip links to /tasks/[id]. Defaults true if task is set.
  asLink?: boolean;
  className?: string;
};

export function TaskChip({
  task,
  taskType,
  showLabels = false,
  asLink,
  className,
}: Props) {
  const slug = task?.id ?? taskType ?? "unknown";
  const label = task?.name ?? slug;
  const kind = task?.kind ?? "generator";
  const labels = task?.labels ?? [];
  const isLink = asLink ?? Boolean(task);

  const body = (
    <span
      className={[
        "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border",
        kind === "classifier"
          ? "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300"
          : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
        className ?? "",
      ].join(" ")}
      title={task?.description}
    >
      <span>{label}</span>
      <span
        className={
          kind === "classifier"
            ? "text-[10px] uppercase tracking-wide text-indigo-600 dark:text-indigo-400"
            : "text-[10px] uppercase tracking-wide text-zinc-500"
        }
      >
        {kind}
      </span>
      {showLabels && kind === "classifier" && labels.length > 0 ? (
        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 tabular-nums">
          · {labels.length}
        </span>
      ) : null}
    </span>
  );

  if (!isLink) return body;
  return (
    <Link href={`/tasks/${slug}`} className="hover:opacity-80">
      {body}
    </Link>
  );
}
