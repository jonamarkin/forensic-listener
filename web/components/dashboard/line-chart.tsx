import type { AccountVelocityPoint } from "@/lib/types";
import { formatExact } from "@/lib/utils";

/**
 * Hourly activity bars on a real time axis (the API zero-fills empty hours), with
 * the scale maximum labelled so bar heights can be read.
 */
export function HourlyBars({ points, height = 140 }: { points: AccountVelocityPoint[]; height?: number }) {
  const width = 640;
  const padTop = 18;
  const padBottom = 22;
  const max = Math.max(1, ...points.map((p) => p.total_count));
  const plotHeight = height - padTop - padBottom;
  const slot = points.length ? width / points.length : width;
  const barWidth = Math.max(1, slot * 0.72);

  const hourLabel = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(new Date(iso));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Hourly transactions, peak ${max} per hour`}>
      <line x1="0" x2={width} y1={padTop} y2={padTop} stroke="#e3e8df" strokeDasharray="3 5" />
      <line x1="0" x2={width} y1={height - padBottom} y2={height - padBottom} stroke="#d5ddd1" />
      <text x="2" y={padTop - 5} fontSize="11" fill="#8a948b">
        {formatExact(max)} / h
      </text>
      {points.map((point, index) => {
        const barHeight = (point.total_count / max) * plotHeight;
        const sentHeight = (point.sent_count / max) * plotHeight;
        const x = index * slot + (slot - barWidth) / 2;
        const baseY = height - padBottom;
        return (
          <g key={point.bucket}>
            <title>{`${hourLabel(point.bucket)} UTC: ${point.sent_count} sent, ${point.received_count} received`}</title>
            <rect x={x} y={baseY - barHeight} width={barWidth} height={barHeight} fill="#b9d8ae" />
            <rect x={x} y={baseY - sentHeight} width={barWidth} height={sentHeight} fill="#2b6631" />
          </g>
        );
      })}
      <text x="2" y={height - 6} fontSize="11" fill="#8a948b">
        {points.length ? `${points.length} h ago` : ""}
      </text>
      <text x={width - 2} y={height - 6} fontSize="11" fill="#8a948b" textAnchor="end">
        now
      </text>
    </svg>
  );
}
