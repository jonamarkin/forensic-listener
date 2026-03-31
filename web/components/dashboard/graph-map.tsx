import Link from "next/link";

import type { AddressGraph, GraphNode } from "@/lib/types";
import { cn, formatAddress, riskTone } from "@/lib/utils";

function nodeColors(node: GraphNode) {
  if (node.is_hub) {
    return {
      fill: "rgba(14, 165, 233, 0.88)",
      ring: "rgba(56, 189, 248, 0.35)",
      text: "white",
    };
  }
  if (node.risk_level?.toLowerCase() === "high") {
    return {
      fill: "rgba(244, 63, 94, 0.88)",
      ring: "rgba(251, 113, 133, 0.3)",
      text: "white",
    };
  }
  if (node.is_contract) {
    return {
      fill: "rgba(99, 102, 241, 0.88)",
      ring: "rgba(129, 140, 248, 0.28)",
      text: "white",
    };
  }
  return {
    fill: "rgba(34, 197, 94, 0.88)",
    ring: "rgba(74, 222, 128, 0.24)",
    text: "white",
  };
}

function nodePriority(node: GraphNode, centerId: string) {
  if (node.id === centerId) {
    return 1000;
  }
  let priority = node.degree;
  if (node.is_hub) {
    priority += 120;
  }
  if (node.risk_level?.toLowerCase() === "high") {
    priority += 90;
  }
  if (node.is_contract) {
    priority += 24;
  }
  return priority;
}

export function GraphMap({
  graph,
  depth,
}: {
  graph: AddressGraph | null;
  depth: number;
}) {
  if (!graph || !graph.nodes.length) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[28px] border border-dashed border-white/12 bg-black/20 px-5 text-center text-sm text-slate-300/70 sm:min-h-[420px]">
        Select an address to render a multi-hop flow canvas.
      </div>
    );
  }

  const width = 980;
  const height = 620;
  const centerX = width / 2;
  const centerY = height / 2;
  const centerNode = graph.nodes.find((node) => node.id === graph.center) || graph.nodes[0];
  const orbitNodes = [...graph.nodes]
    .filter((node) => node.id !== centerNode.id)
    .sort((left, right) => {
      return nodePriority(right, centerNode.id) - nodePriority(left, centerNode.id);
    });
  const positions = new Map<string, { x: number; y: number; radius: number; node: GraphNode }>();

  positions.set(centerNode.id, {
    x: centerX,
    y: centerY,
    radius: 38,
    node: centerNode,
  });

  let cursor = 0;
  for (let ringIndex = 1; cursor < orbitNodes.length; ringIndex += 1) {
    const ringCapacity = 6 + (ringIndex - 1) * 4;
    const ringNodes = orbitNodes.slice(cursor, cursor + ringCapacity);
    const angleOffset = -Math.PI / 2 + (ringIndex % 2 === 0 ? Math.PI / ringNodes.length : 0);
    const ringSize = 138 + (ringIndex - 1) * 92;

    ringNodes.forEach((node, index) => {
      const angle = angleOffset + (index / ringNodes.length) * Math.PI * 2;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * ringSize,
        y: centerY + Math.sin(angle) * ringSize * 0.76,
        radius: node.is_hub ? 24 : node.is_contract ? 20 : 18,
        node,
      });
    });

    cursor += ringCapacity;
  }

  const labelBudget = graph.nodes.length <= 10 ? graph.nodes.length : 9;
  const labeledNodeIds = new Set(
    [...graph.nodes]
      .sort((left, right) => nodePriority(right, centerNode.id) - nodePriority(left, centerNode.id))
      .slice(0, labelBudget)
      .map((node) => node.id),
  );
  const hiddenLabelCount = Math.max(graph.nodes.length - labeledNodeIds.size, 0);

  return (
    <div className="overflow-hidden rounded-[30px] border border-white/8 bg-[radial-gradient(circle_at_center,rgba(8,47,73,0.46),rgba(2,6,23,0.92))]">
      <div className="border-b border-white/8 px-4 py-4 sm:px-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-cyan-200/78">
          Flow Topology
        </p>
        <p className="mt-2 text-sm text-slate-300/80">
          Centered on {centerNode.entity_name || formatAddress(centerNode.id)} with{" "}
          {graph.nodes.length} nodes and {graph.edges.length} directional edges.
        </p>
        {hiddenLabelCount ? (
          <p className="mt-2 text-xs text-slate-400">
            Labels are prioritized to keep the map readable. Every node is still clickable.
          </p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[360px] min-w-[720px] w-full sm:h-[460px] lg:h-[580px]"
          role="img"
          aria-label="Transaction flow graph"
        >
          {[1, 2, 3, 4].map((ring) => (
            <ellipse
              key={ring}
              cx={centerX}
              cy={centerY}
              rx={ring * 138}
              ry={ring * 104}
              fill="none"
              stroke="rgba(148, 163, 184, 0.08)"
              strokeDasharray="6 12"
            />
          ))}
          {graph.edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) {
              return null;
            }
            return (
              <line
                key={`${edge.hash}:${edge.from}:${edge.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={
                  edge.from === centerNode.id || edge.to === centerNode.id
                    ? "rgba(56, 189, 248, 0.34)"
                    : "rgba(56, 189, 248, 0.18)"
                }
                strokeWidth={edge.from === centerNode.id || edge.to === centerNode.id ? 2.2 : 1.1}
              />
            );
          })}

          {Array.from(positions.values()).map(({ x, y, radius, node }) => {
            const colors = nodeColors(node);
            const label = node.entity_name || formatAddress(node.id, 5);
            const isCenter = node.id === centerNode.id;
            const href = `/accounts/${encodeURIComponent(node.id)}`;
            const showLabel = labeledNodeIds.has(node.id);

            return (
              <g key={node.id}>
                <a href={href} aria-label={`Open dossier for ${node.id}`}>
                  <title>
                    {label} · {node.entity_type || (node.is_contract ? "contract" : "wallet")}
                  </title>
                  <circle cx={x} cy={y} r={radius + 8} fill={colors.ring} />
                  <circle cx={x} cy={y} r={radius} fill={colors.fill} />
                </a>
                {showLabel ? (
                  <foreignObject
                    x={x - (isCenter ? 92 : 76)}
                    y={y + radius + 12}
                    width={isCenter ? 184 : 152}
                    height="48"
                  >
                    <Link
                      href={href}
                      className={cn(
                        "block rounded-2xl border bg-slate-950/80 px-3 py-2 text-center text-xs shadow-lg backdrop-blur",
                        riskTone(node.risk_level),
                      )}
                    >
                      <div className="truncate font-semibold text-white">{label}</div>
                      <div className="truncate text-[11px] uppercase tracking-[0.14em] text-slate-200/80">
                        {node.entity_type || (node.is_contract ? "contract" : "wallet")}
                      </div>
                    </Link>
                  </foreignObject>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
