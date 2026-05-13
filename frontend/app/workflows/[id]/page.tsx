import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteWorkflowButton } from "@/components/delete-workflow-button";
import { PageHeader } from "@/components/page-header";
import { WorkflowEditor } from "@/components/workflow-editor";
import { api } from "@/lib/api";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let workflow: Awaited<ReturnType<typeof api.workflow>>;
  let adapters: Awaited<ReturnType<typeof api.adapters>> = [];
  let aiTasks: Awaited<ReturnType<typeof api.tasks>> = [];
  let prospectuses: Awaited<ReturnType<typeof api.prospectuses>> = [];
  try {
    [workflow, adapters, aiTasks, prospectuses] = await Promise.all([
      api.workflow(id),
      api.adapters().catch(() => []),
      api.tasks("ai").catch(() => []),
      api.prospectuses().catch(() => []),
    ]);
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) notFound();
    throw e;
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title={workflow.name}
        description={workflow.description ?? undefined}
      />
      <div className="px-8 pt-3 pb-2 flex items-center justify-between gap-3">
        <Link
          href="/workflows"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← All workflows
        </Link>
        <div className="flex items-center gap-4">
          <p className="text-xs text-zinc-500">
            v{workflow.version} · {workflow.nodes.length} nodes ·{" "}
            {workflow.edges.length} edges
          </p>
          <DeleteWorkflowButton
            workflowId={workflow.id}
            workflowName={workflow.name}
            redirectTo="/workflows"
            variant="danger"
          />
        </div>
      </div>
      <WorkflowEditor
        workflow={workflow}
        adapters={adapters}
        aiTasks={aiTasks}
        prospectuses={prospectuses}
      />
    </div>
  );
}
