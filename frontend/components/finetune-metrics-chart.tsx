import type { FineTuneStep } from "@/lib/api";

type Series = { key: "accuracy" | "f1" | "evalLoss"; label: string; color: string };

const SERIES: Series[] = [
  { key: "accuracy", label: "accuracy", color: "#10b981" }, // emerald-500
  { key: "f1", label: "f1", color: "#6366f1" }, // indigo-500
  { key: "evalLoss", label: "eval_loss", color: "#ef4444" }, // red-500
];

const PAD = { top: 16, right: 12, bottom: 24, left: 32 };
const W = 560;
const H = 220;
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function pathFor(values: number[], yMin: number, yMax: number): string {
  if (values.length === 0) return "";
  const xStep =
    values.length === 1 ? 0 : PLOT_W / (values.length - 1);
  const yRange = yMax - yMin || 1;
  return values
    .map((v, i) => {
      const x = PAD.left + i * xStep;
      const y = PAD.top + PLOT_H - ((v - yMin) / yRange) * PLOT_H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function FineTuneMetricsChart({ history }: { history: FineTuneStep[] }) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No per-epoch history recorded for this run.
      </p>
    );
  }

  // Two y-axes: accuracy/f1 in [0, 1] (left), eval_loss in [0, max(loss)] (right).
  const accValues = history.map((s) => s.accuracy);
  const f1Values = history.map((s) => s.f1);
  const lossValues = history.map((s) => s.evalLoss);
  const lossMax = Math.max(0.5, ...lossValues) * 1.1;

  const accPath = pathFor(accValues, 0, 1);
  const f1Path = pathFor(f1Values, 0, 1);
  const lossPath = pathFor(lossValues, 0, lossMax);

  // Gridlines at 0, 0.25, 0.5, 0.75, 1.0 (left axis).
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  // X axis ticks — show first, last, plus a couple of inner steps when long.
  const xTicks =
    history.length <= 8
      ? history.map((s) => s.epoch)
      : [history[0].epoch, history[Math.floor(history.length / 2)].epoch, history[history.length - 1].epoch];

  const xFor = (epoch: number) => {
    const i = history.findIndex((s) => s.epoch === epoch);
    const xStep = history.length === 1 ? 0 : PLOT_W / (history.length - 1);
    return PAD.left + i * xStep;
  };

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-xl text-zinc-500"
        role="img"
        aria-label="Training metrics over epochs"
      >
        {/* gridlines */}
        {yTicks.map((t) => {
          const y = PAD.top + PLOT_H - t * PLOT_H;
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + PLOT_W}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={t === 0 ? 0.4 : 0.12}
                strokeDasharray={t === 0 ? "" : "2 3"}
              />
              <text
                x={PAD.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                fill="currentColor"
              >
                {t.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* x axis */}
        <line
          x1={PAD.left}
          x2={PAD.left + PLOT_W}
          y1={PAD.top + PLOT_H}
          y2={PAD.top + PLOT_H}
          stroke="currentColor"
          strokeOpacity={0.4}
        />
        {xTicks.map((epoch) => (
          <text
            key={epoch}
            x={xFor(epoch)}
            y={PAD.top + PLOT_H + 14}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
          >
            ep{epoch}
          </text>
        ))}

        {/* series */}
        <path d={accPath} fill="none" stroke={SERIES[0].color} strokeWidth={1.8} />
        <path d={f1Path} fill="none" stroke={SERIES[1].color} strokeWidth={1.8} />
        <path
          d={lossPath}
          fill="none"
          stroke={SERIES[2].color}
          strokeWidth={1.8}
          strokeDasharray="4 3"
        />

        {/* end-point dots so single-epoch runs render visibly */}
        {history.length === 1 ? (
          <>
            <circle cx={xFor(history[0].epoch)} cy={PAD.top + PLOT_H - history[0].accuracy * PLOT_H} r={3} fill={SERIES[0].color} />
            <circle cx={xFor(history[0].epoch)} cy={PAD.top + PLOT_H - history[0].f1 * PLOT_H} r={3} fill={SERIES[1].color} />
            <circle cx={xFor(history[0].epoch)} cy={PAD.top + PLOT_H - (history[0].evalLoss / lossMax) * PLOT_H} r={3} fill={SERIES[2].color} />
          </>
        ) : null}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width={16} height={6} aria-hidden>
              <line
                x1={0}
                x2={16}
                y1={3}
                y2={3}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.key === "evalLoss" ? "3 2" : ""}
              />
            </svg>
            <span className="font-mono">{s.label}</span>
          </span>
        ))}
        <span className="ml-auto text-zinc-500">
          left axis 0–1 · loss scaled to 0–{lossMax.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
