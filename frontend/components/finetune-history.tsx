"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { DeleteRowButton } from "@/components/delete-row-button";
import { api, type FineTuneRun } from "@/lib/api";

const STATUS_TONE: Record<FineTuneRun["status"], string> = {
  queued: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m - h * 60}m`;
}

function etaFor(run: FineTuneRun, now: number): number | null {
  if (run.status !== "running" || run.progress <= 0 || run.progress >= 1) {
    return null;
  }
  const startedMs = new Date(run.startedAt).getTime();
  const elapsedSec = (now - startedMs) / 1000;
  if (elapsedSec <= 0) return null;
  return elapsedSec * (1 / run.progress - 1);
}

export function FineTuneHistory({
  initialRuns,
}: {
  initialRuns: FineTuneRun[];
}) {
  const [runs, setRuns] = useState<FineTuneRun[]>(initialRuns);
  const [now, setNow] = useState<number>(() => Date.now());

  // Poll while any run is in flight; stop once everything's terminal.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await api.finetuneRuns();
        if (!cancelled) setRuns(next);
      } catch {
        // Ignore transient errors — next tick will retry.
      }
    };
    const inFlight = runs.some(
      (r) => r.status === "queued" || r.status === "running",
    );
    if (!inFlight) return undefined;
    const interval = setInterval(() => {
      tick();
      setNow(Date.now());
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runs]);

  const sorted = [...runs].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
      <header className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-baseline justify-between">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
          Training history
        </h2>
        <span className="text-xs text-zinc-500">
          {runs.length} run{runs.length === 1 ? "" : "s"}
        </span>
      </header>
      {sorted.length === 0 ? (
        <p className="px-5 py-8 text-sm text-zinc-500 text-center">
          No training runs yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {sorted.map((r) => (
            <li key={r.id} className="relative">
              <Link
                href={`/finetune/${r.id}`}
                className="block px-5 py-3 pr-20 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <div className="flex items-baseline gap-3 flex-wrap">
                  <p className="text-sm text-zinc-900 dark:text-zinc-50">
                    {r.adapterName}{" "}
                    <span className="text-zinc-500 font-mono text-xs">
                      {r.id}
                    </span>
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${STATUS_TONE[r.status]}`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {r.taskType} · base {r.baseModel} · {r.hyperparams.epochs}{" "}
                  epochs · {formatDateTime(r.startedAt)}
                </p>

                {r.status === "running" || r.status === "queued" ? (
                  <ProgressRow run={r} now={now} />
                ) : null}

                {r.status === "failed" && r.error ? (
                  <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                    {r.error}
                  </p>
                ) : null}

                {r.status === "completed" && r.metrics ? (
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                    accuracy {r.metrics.accuracy?.toFixed(2) ?? "—"} · f1{" "}
                    {r.metrics.f1?.toFixed(2) ?? "—"} · eval_loss{" "}
                    {r.metrics.evalLoss?.toFixed(3) ?? "—"}
                  </p>
                ) : null}
              </Link>
              <div className="absolute top-3 right-3">
                <DeleteRowButton
                  kind="finetune"
                  id={r.id}
                  label={r.adapterName}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProgressRow({ run, now }: { run: FineTuneRun; now: number }) {
  const pct = Math.round(Math.min(100, Math.max(0, run.progress * 100)));
  const eta = etaFor(run, now);
  const stepLabel =
    run.totalSteps > 0
      ? `step ${run.currentStep}/${run.totalSteps}`
      : "starting…";
  const epochLabel =
    run.currentEpoch > 0
      ? ` · epoch ${run.currentEpoch}/${run.hyperparams.epochs}`
      : "";

  return (
    <div className="mt-2">
      <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-sky-500 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-zinc-500 tabular-nums">
        {pct}% · {stepLabel}
        {epochLabel}
        {eta !== null ? ` · ETA ${formatDuration(eta)}` : ""}
      </p>
    </div>
  );
}
