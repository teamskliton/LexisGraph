import { SOLUTION_STAGES } from "./landing-content";

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  primary: {
    bg: "var(--primary-subtle)",
    border: "var(--primary)",
    text: "var(--primary)",
    dot: "var(--primary)",
  },
  accent: {
    bg: "var(--accent-subtle)",
    border: "var(--accent)",
    text: "var(--accent)",
    dot: "var(--accent)",
  },
  warning: {
    bg: "var(--warning-subtle)",
    border: "var(--warning)",
    text: "var(--warning)",
    dot: "var(--warning)",
  },
  danger: {
    bg: "var(--danger-subtle)",
    border: "var(--danger)",
    text: "var(--danger)",
    dot: "var(--danger)",
  },
  info: {
    bg: "var(--info-subtle)",
    border: "var(--info)",
    text: "var(--info)",
    dot: "var(--info)",
  },
};

export default function SolutionFlow() {
  return (
    <section
      aria-labelledby="solution-flow-heading"
      className="landing-section"
      style={{ background: "var(--surface-muted)" }}
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="section-label justify-center">How LexisGraph Works</div>
          <h2
            id="solution-flow-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-3"
          >
            One connected platform, end to end.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed mx-auto" style={{ maxWidth: "540px" }}>
            LexisGraph structures the compliance journey as a graph — every stage linked to the next, every relationship traceable.
          </p>
        </div>

        {/* Flow — desktop horizontal, mobile vertical */}
        <div className="hidden md:flex items-center justify-between gap-0" role="list" aria-label="Compliance workflow stages">
          {SOLUTION_STAGES.map((stage, i) => {
            const c = COLOR_MAP[stage.color] ?? COLOR_MAP.primary;
            return (
              <div key={stage.label} className="flex items-center flex-1">
                {/* Stage node */}
                <div
                  role="listitem"
                  className="flex flex-col items-center text-center gap-2 flex-shrink-0 group cursor-default"
                  style={{ width: "88px" }}
                >
                  {/* Dot */}
                  <div
                    className="w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-200 group-hover:scale-110 group-hover:shadow-md"
                    style={{
                      background: c.bg,
                      borderColor: c.border,
                      color: c.text,
                    }}
                  >
                    {(i + 1).toString().padStart(2, "0")}
                  </div>
                  {/* Label */}
                  <span className="text-xs font-semibold text-foreground leading-tight">{stage.label}</span>
                  {/* Description tooltip on hover */}
                  <span className="text-xs text-muted-foreground leading-tight hidden group-hover:block absolute mt-14 px-2 py-1 rounded-md bg-popover border border-border shadow-lg w-36 z-10">
                    {stage.description}
                  </span>
                </div>

                {/* Connector arrow */}
                {i < SOLUTION_STAGES.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="flex-1 flex items-center"
                    style={{ minWidth: "8px" }}
                  >
                    <div className="flex-1 h-px" style={{ background: "var(--border-strong)" }} />
                    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6h8M7 3l3 3-3 3" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile vertical flow */}
        <ol className="md:hidden flex flex-col gap-0" aria-label="Compliance workflow stages">
          {SOLUTION_STAGES.map((stage, i) => {
            const c = COLOR_MAP[stage.color] ?? COLOR_MAP.primary;
            return (
              <li key={stage.label} className="relative flex gap-4">
                {/* Vertical connector */}
                {i < SOLUTION_STAGES.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="absolute left-5 top-10 bottom-0 w-px"
                    style={{ background: "var(--border)" }}
                  />
                )}

                {/* Dot */}
                <div
                  className="w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-xs flex-shrink-0 z-10"
                  style={{
                    background: c.bg,
                    borderColor: c.border,
                    color: c.text,
                  }}
                >
                  {(i + 1).toString().padStart(2, "0")}
                </div>

                {/* Content */}
                <div className="pb-8">
                  <h3 className="text-sm font-semibold text-foreground">{stage.label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{stage.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
