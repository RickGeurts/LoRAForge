import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { TaskForm } from "@/components/task-form";
import { api, type Task } from "@/lib/api";

export default async function EditTaskPage({
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
      <PageHeader
        title={`Edit ${task.name}`}
        description="Editing changes the prompt template every adapter and AI node referencing this task will see on the next run."
      />
      <div className="px-8 pt-3 pb-2">
        <Link
          href={`/tasks/${task.id}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Back to task
        </Link>
      </div>
      <section className="px-8 py-4 max-w-3xl">
        <TaskForm mode={{ kind: "edit", task }} />
      </section>
    </div>
  );
}
