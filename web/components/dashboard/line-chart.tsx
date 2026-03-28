import { cn } from "@/lib/utils";

export function LineChart({
  values,
  height = 180,
  className,
  stroke = "rgb(34 211 238)",
  fill = "rgba(34, 211, 238, 0.16)",
}: {
  values: number[];
  height?: number;
  className?: string;
  stroke?: string;
  fill?: string;
}) {
  const width = 640;
  const safeValues = values.length ? values : [0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = max - min || 1;

  const points = safeValues.map((value, index) => {
    const x =
      safeValues.length === 1
        ? width / 2
        : (index / (safeValues.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 20) - 10;
    return `${x},${y}`;
  });

  const area = [`0,${height}`, ...points, `${width},${height}`].join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-full w-full", className)}
      preserveAspectRatio="none"
      role="img"
      aria-label="Trend chart"
    >
      <defs>
        <linearGradient id="chart-grid" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor="rgba(8, 47, 73, 0)" />
        </linearGradient>
      </defs>
      {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
        <line
          key={ratio}
          x1="0"
          x2={width}
          y1={height * ratio}
          y2={height * ratio}
          stroke="rgba(148, 163, 184, 0.14)"
          strokeDasharray="4 8"
        />
      ))}
      <polygon points={area} fill="url(#chart-grid)" />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.slice(-1).map((point) => {
        const [x, y] = point.split(",");
        return (
          <g key={point}>
            <circle cx={x} cy={y} r="7" fill="rgba(34, 211, 238, 0.18)" />
            <circle cx={x} cy={y} r="3.5" fill={stroke} />
          </g>
        );
      })}
    </svg>
  );
}
