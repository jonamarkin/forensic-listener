import type { AddressGraph, AddressTrace, GraphEdge, GraphNode } from "@/lib/types";
import { formatAddress } from "@/lib/utils";

/**
 * The neighbourhood is budget-limited, so a traced path may leave it. Add the trace's
 * own hops so the highlighted route is always drawn end to end.
 */
function withTrace(graph: AddressGraph, trace?: AddressTrace | null): AddressGraph {
  if (!trace?.edges.length) {
    return graph;
  }
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const edge of trace.edges) {
    if (!edges.some((e) => e.hash === edge.hash && e.from === edge.from && e.to === edge.to)) {
      edges.push(edge);
    }
    for (const id of [edge.from, edge.to]) {
      if (!nodeIds.has(id)) {
        nodeIds.add(id);
        nodes.push({ id, label: id, is_contract: false, entity_type: "wallet", entity_name: "", risk_level: "none", is_hub: false, degree: 1 });
      }
    }
  }
  return { ...graph, nodes, edges };
}

const WIDTH = 980;
const HEIGHT = 640;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;

type Placed = { node: GraphNode; x: number; y: number; r: number; hop: number };

/** Breadth-first hop distance from the centre, ignoring edge direction. */
function hopDistances(graph: AddressGraph) {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  }
  const distance = new Map<string, number>([[graph.center, 0]]);
  const queue = [graph.center];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!distance.has(next)) {
        distance.set(next, distance.get(current)! + 1);
        queue.push(next);
      }
    }
  }
  return distance;
}

function priority(node: GraphNode) {
  const risk = { high: 300, medium: 200, low: 50, none: 0 }[node.risk_level] ?? 0;
  return risk + (node.entity_name ? 80 : 0) + node.degree;
}

function nodeFill(node: GraphNode, isCenter: boolean) {
  if (isCenter) return "#17361d";
  if (node.risk_level === "high") return "#b3423a";
  if (node.risk_level === "medium") return "#c08a2e";
  if (node.is_contract) return "#46537d";
  return "#3f7d45";
}

const EDGE_STYLE = {
  eth: { stroke: "rgba(74, 96, 80, 0.5)", marker: "arrow-eth" },
  token: { stroke: "rgba(122, 95, 176, 0.62)", marker: "arrow-token" },
  trace: { stroke: "#d9771f", marker: "arrow-trace" },
} as const;

/**
 * Neighbourhood map. Rings are real hop distance from the centre; arrows show the
 * direction value moved; ETH and token flows are coloured separately; parallel
 * transfers are merged into one thicker edge.
 */
export function GraphMap({ graph: base, trace }: { graph: AddressGraph; trace?: AddressTrace | null }) {
  const graph = withTrace(base, trace);
  const highlightHashes = new Set(trace?.transaction_hashes ?? []);
  const distance = hopDistances(graph);
  const maxHop = Math.max(1, ...graph.nodes.map((n) => distance.get(n.id) ?? 1));

  const rings = new Map<number, GraphNode[]>();
  for (const node of graph.nodes) {
    const hop = node.id === graph.center ? 0 : (distance.get(node.id) ?? maxHop);
    rings.set(hop, [...(rings.get(hop) ?? []), node]);
  }

  const placed = new Map<string, Placed>();
  const rx = (hop: number) => (hop * (WIDTH / 2 - 90)) / maxHop;
  const ry = (hop: number) => (hop * (HEIGHT / 2 - 70)) / maxHop;

  for (const [hop, nodes] of rings) {
    if (hop === 0) {
      for (const node of nodes) placed.set(node.id, { node, x: CX, y: CY, r: 24, hop });
      continue;
    }
    const sorted = [...nodes].sort((a, b) => priority(b) - priority(a));
    const circumference = 2 * Math.PI * Math.sqrt((rx(hop) ** 2 + ry(hop) ** 2) / 2);
    const staggered = sorted.length > circumference / 34;
    sorted.forEach((node, index) => {
      const angle = -Math.PI / 2 + hop * 0.45 + (index / sorted.length) * Math.PI * 2;
      const scale = staggered && index % 2 === 1 ? 0.86 : 1;
      placed.set(node.id, {
        node,
        x: CX + Math.cos(angle) * rx(hop) * scale,
        y: CY + Math.sin(angle) * ry(hop) * scale,
        r: 8 + Math.min(8, node.degree * 1.4),
        hop,
      });
    });
  }

  type Group = { from: string; to: string; kind: GraphEdge["kind"]; count: number; traced: boolean };
  const groups = new Map<string, Group>();
  for (const edge of graph.edges) {
    const key = `${edge.from}|${edge.to}|${edge.kind}`;
    const group = groups.get(key) ?? { from: edge.from, to: edge.to, kind: edge.kind, count: 0, traced: false };
    group.count += 1;
    group.traced ||= highlightHashes?.has(edge.hash) ?? false;
    groups.set(key, group);
  }

  const labelled = new Set(
    [...graph.nodes]
      .sort((a, b) => priority(b) - priority(a))
      .slice(0, 14)
      .map((n) => n.id)
      .concat(graph.center),
  );

  const tokenEdges = graph.edges.filter((e) => e.kind === "token").length;

  return (
    <div className="overflow-hidden rounded-[28px] border border-[#e8ebe4] bg-[radial-gradient(circle_at_center,rgba(180,218,167,0.18),rgba(251,252,248,1)_70%)]">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full min-w-[720px]" role="img" aria-label={`Transaction graph around ${graph.center}: ${graph.nodes.length} addresses, ${graph.edges.length} transfers`}>
          <defs>
            {(Object.keys(EDGE_STYLE) as (keyof typeof EDGE_STYLE)[]).map((kind) => (
              <marker key={kind} id={EDGE_STYLE[kind].marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={EDGE_STYLE[kind].stroke} />
              </marker>
            ))}
          </defs>

          {Array.from({ length: maxHop }, (_, i) => i + 1).map((hop) => (
            <g key={hop}>
              <ellipse cx={CX} cy={CY} rx={rx(hop)} ry={ry(hop)} fill="none" stroke="rgba(93,110,93,0.16)" strokeDasharray="5 9" />
              <text x={CX + rx(hop) - 4} y={CY - 6} textAnchor="end" fontSize="11" fill="#9aa59b">
                {hop} hop{hop > 1 ? "s" : ""}
              </text>
            </g>
          ))}

          {[...groups.values()].map((group) => {
            const a = placed.get(group.from);
            const b = placed.get(group.to);
            if (!a || !b || a === b) return null;
            const style = group.traced ? EDGE_STYLE.trace : EDGE_STYLE[group.kind];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const length = Math.hypot(dx, dy) || 1;
            const ux = dx / length;
            const uy = dy / length;
            const reverse = groups.has(`${group.to}|${group.from}|${group.kind}`);
            const bend = reverse ? (group.from < group.to ? 16 : -16) : 0;
            const sx = a.x + ux * (a.r + 3);
            const sy = a.y + uy * (a.r + 3);
            const ex = b.x - ux * (b.r + 5);
            const ey = b.y - uy * (b.r + 5);
            const mx = (sx + ex) / 2 - uy * bend;
            const my = (sy + ey) / 2 + ux * bend;
            const noun = group.kind === "eth" ? "ETH transaction" : "token transfer";
            return (
              <path
                key={`${group.from}|${group.to}|${group.kind}`}
                d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`}
                fill="none"
                stroke={style.stroke}
                strokeWidth={group.traced ? 3.2 : 1.2 + Math.log2(group.count)}
                markerEnd={`url(#${style.marker})`}
              >
                <title>{`${group.count} ${noun}${group.count > 1 ? "s" : ""}: ${formatAddress(group.from, 4)} → ${formatAddress(group.to, 4)}`}</title>
              </path>
            );
          })}

          {[...placed.values()].map(({ node, x, y, r }) => {
            const isCenter = node.id === graph.center;
            const label = node.entity_name || formatAddress(node.id, 4);
            return (
              <a key={node.id} href={`/accounts/${node.id}`} aria-label={`Open ${label}`}>
                <title>{`${label} · ${node.entity_type} · ${node.risk_level === "none" ? "no risk signals" : `${node.risk_level} risk`} · ${node.degree} transfers shown`}</title>
                {node.is_hub ? <circle cx={x} cy={y} r={r + 6} fill="none" stroke="#1b7467" strokeWidth="2" strokeDasharray="3 3" /> : null}
                <circle cx={x} cy={y} r={r} fill={nodeFill(node, isCenter)} stroke={isCenter ? "#b4daa7" : "#ffffff"} strokeWidth={isCenter ? 5 : 2} />
                {labelled.has(node.id) ? (
                  <text
                    x={x}
                    y={y + r + 14}
                    textAnchor="middle"
                    fontSize={isCenter ? 13 : 11}
                    fontWeight={isCenter ? 600 : 500}
                    fill="#1c2a1d"
                    stroke="#fbfcf8"
                    strokeWidth="4"
                    paintOrder="stroke"
                  >
                    {label}
                  </text>
                ) : null}
              </a>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#e8ebe4] px-5 py-3 text-xs text-[#5d6a60]">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#3f7d45]" />wallet</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#46537d]" />contract</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#c08a2e]" />medium risk</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#b3423a]" />high risk</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-full border-2 border-dashed border-[#1b7467]" />labelled hub</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-[rgba(74,96,80,0.6)]" />ETH ({graph.edges.length - tokenEdges})</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-[rgba(122,95,176,0.7)]" />token ({tokenEdges})</span>
        {highlightHashes?.size ? <span className="flex items-center gap-1.5"><span className="h-1 w-5 bg-[#d9771f]" />traced path</span> : null}
        <span className="text-[#8a948b]">Rings show hop distance. Node size shows transfers in view. Click any node to open it.</span>
      </div>
    </div>
  );
}
