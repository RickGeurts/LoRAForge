import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { TaskForm } from "@/components/task-form";

export default function NewTaskPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="New task"
        description="Define a task that adapters, datasets, and AI nodes can reference by id."
      />
      <div className="px-8 pt-3 pb-2">
        <Link
          href="/tasks"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← All tasks
        </Link>
      </div>
      <section className="px-8 py-4 max-w-3xl">
        <TaskForm mode={{ kind: "create" }} />
      </section>
    </div>
  );
}
