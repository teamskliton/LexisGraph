// Lazily-loaded by KnowledgeGraphShowcase via React.lazy
// Pure SVG, zero external dependencies

const NODES = [
  { id: "reg",     label: "Regulation",   x: 320, y: 60,  color: "primary" },
  { id: "req",     label: "Requirement",  x: 140, y: 160, color: "primary" },
  { id: "policy",  label: "Policy",       x: 500, y: 160, color: "accent"  },
  { id: "evidence",label: "Evidence",     x: 80,  y: 280, color: "info"    },
  { id: "finding", label: "Finding",      x: 560, y: 280, color: "warning" },
  { id: "remed",   label: "Remediation",  x: 320, y: 360, color: "danger"  },
] as const;

const EDGES = [
  { from: "reg",     to: "req"     },
  { from: "reg",     to: "policy"  },
  { from: "req",     to: "evidence"},
  { from: "policy",  to: "finding" },
  { from: "evidence",to: "finding" },
  { from: "finding", to: "remed"   },
] as const;

const COLOR_MAP: Record<string, { fill: string; stroke: string; text: string }> = {
  primary: { fill: "var(--primary-subtle)",  stroke: "var(--primary)",  text: "var(--primary)"  },
  accent:  { fill: "var(--accent-subtle)",   stroke: "var(--accent)",   text: "var(--accent)"   },
  info:    { fill: "var(--info-subtle)",     stroke: "var(--info)",     text: "var(--info)"     },
  warning: { fill: "var(--warning-subtle)",  stroke: "var(--warning)",  text: "var(--warning)"  },
  danger:  { fill: "var(--danger-subtle)",   stroke: "var(--danger)",   text: "var(--danger)"   },
};

function getNode(id: string) {
  return NODES.find((n) => n.id === id)!;
}

export default function KnowledgeGraphCanvas() {
  return (
    <div
      className="rounded-2xl border border-border overflow-hidden"
      style={{
        background: "var(--surface)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Chrome bar */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-surface-muted">
        <span className="w-3 h-3 rounded-full bg-danger opacity-60" aria-hidden="true" />
        <span className="w-3 h-3 rounded-full bg-warning opacity-60" aria-hidden="true" />
        <span className="w-3 h-3 rounded-full bg-success opacity-60" aria-hidden="true" />
        <span className="ml-3 text-xs text-subtle-foreground font-mono">Compliance Graph — Live Preview</span>
      </div>

      <div className="p-6">
        <svg
          viewBox="0 0 640 420"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full"
          aria-label="Knowledge graph showing compliance entities and their relationships"
          role="img"
        >
          {/* Edges */}
          <g opacity="0.5">
            {EDGES.map((edge, i) => {
              const from = getNode(edge.from);
              const to   = getNode(edge.to);
              return (
                <line
                  key={i}
                  x1={from.x} y1={from.y}
                  x2={to.x}   y2={to.y}
                  stroke="var(--border-strong)"
                  strokeWidth="1.5"
                  strokeDasharray="5,4"
                  className="graph-edge-animate"
                  style={{ animationDelay: `${i * 0.25}s` }}
                />
              );
            })}
          </g>

          {/* Nodes */}
          {NODES.map((node, i) => {
            const c = COLOR_MAP[node.color] ?? COLOR_MAP.primary;
            const labelWidth = node.label.length * 7.2 + 24;
            return (
              <g
                key={node.id}
                className="graph-node-animate"
                style={{ animationDelay: `${i * 0.3}s` }}
                role="img"
                aria-label={node.label}
              >
                <rect
                  x={node.x - labelWidth / 2}
                  y={node.y - 18}
                  width={labelWidth}
                  height={36}
                  rx={18}
                  fill={c.fill}
                  stroke={c.stroke}
                  strokeWidth="1.5"
                />
                <text
                  x={node.x}
                  y={node.y + 5}
                  textAnchor="middle"
                  fill={c.text}
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="inherit"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 justify-center" role="list" aria-label="Graph legend">
          {Object.entries({ Regulation: "primary", Policy: "accent", Evidence: "info", Finding: "warning", Remediation: "danger" }).map(
            ([label, color]) => {
              const c = COLOR_MAP[color];
              return (
                <div key={label} className="flex items-center gap-1.5" role="listitem">
                  <span
                    className="w-2.5 h-2.5 rounded-full border"
                    style={{ background: c.fill, borderColor: c.stroke }}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
