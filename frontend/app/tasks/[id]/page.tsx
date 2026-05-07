import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteTaskButton } from "@/components/delete-task-button";
import { PageHeader } from "@/components/page-header";
import { api, type NodeGroup, type Task } from "@/lib/api";

const GROUP_TONE: Record<NodeGroup, string> = {
  documents: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  ai: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  rules: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  logic: "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300",
  output: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
};

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let task: Task;
  try {
    task = await api.task(id);
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) notFound();
    throw e;
  }

  return (
    <div className="flex flex-col">
      <PageHeader title={task.name} description={task.description} />
      <div className="px-8 pt-3 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/tasks"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← All tasks
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-zinc-500">{task.id}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${GROUP_TONE[task.nodeGroup]}`}
          >
            {task.nodeGroup}
          </span>
          {task.builtin ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              builtin
            </span>
          ) : null}
          <Link
            href={`/tasks/${task.id}/edit`}
            className="text-sm px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Edit
          </Link>
          {task.builtin ? null : (
            <DeleteTaskButton taskId={task.id} taskName={task.name} />
          )}
        </div>
      </div>

      <section className="px-8 py-4 max-w-4xl space-y-5">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">
            Prompt template
          </h2>
          {task.promptTemplate ? (
            <pre className="mt-2 text-sm font-mono whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-900 p-3 rounded border border-zinc-200 dark:border-zinc-800">
              {task.promptTemplate}
            </pre>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">
              None — this task isn&apos;t consumed by an AI node.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">
            Expected output
          </h2>
          {task.expectedOutput ? (
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
              {task.expectedOutput}
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Not specified.</p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              Default base model
            </dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">
              {task.defaultBaseModel}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              Updated
            </dt>
            <dd className="text-zinc-700 dark:text-zinc-300">
              {new Date(task.updatedAt).toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
