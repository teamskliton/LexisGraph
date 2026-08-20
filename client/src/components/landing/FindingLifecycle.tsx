import { FINDING_STAGES } from "./landing-content";

const COLOR_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  danger:  { bg: "var(--danger-subtle)",  border: "var(--danger)",  text: "var(--danger)",  dot: "var(--danger)"  },
  warning: { bg: "var(--warning-subtle)", border: "var(--warning)", text: "var(--warning)", dot: "var(--warning)" },
  primary: { bg: "var(--primary-subtle)", border: "var(--primary)", text: "var(--primary)", dot: "var(--primary)" },
  accent:  { bg: "var(--accent-subtle)",  border: "var(--accent)",  text: "var(--accent)",  dot: "var(--accent)"  },
};

export default function FindingLifecycle() {
  return (
    <section
      aria-labelledby="lifecycle-heading"
      className="landing-section"
      style={{ background: "var(--surface-muted)" }}
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="section-label justify-center">Finding Lifecycle</div>
          <h2
            id="lifecycle-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-3"
          >
            Every finding has a clear path to resolution.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed mx-auto" style={{ maxWidth: "520px" }}>
            LexisGraph moves findings through a structured lifecycle — from initial identification to verified resolution.
          </p>
        </div>

        {/* Lifecycle track — horizontal desktop */}
        <div className="hidden sm:flex items-start gap-0" role="list" aria-label="Finding lifecycle stages">
          {FINDING_STAGES.map((stage, i) => {
            const c = COLOR_STYLES[stage.color] ?? COLOR_STYLES.primary;
            return (
              <div key={stage.label} className="flex-1 flex flex-col items-center relative">
                {/* Track line */}
                {i < FINDING_STAGES.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="absolute top-4 left-1/2 right-0 h-0.5"
                    style={{ background: "var(--border)" }}
                  />
                )}

                {/* Dot */}
                <div
                  className="relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold mb-4"
                  style={{ background: c.bg, borderColor: c.border, color: c.text }}
                >
                  {i + 1}
                </div>

                {/* Card */}
                <div
                  className="mx-3 p-4 rounded-xl border text-center"
                  style={{ background: c.bg, borderColor: c.border }}
                >
                  <span className="text-sm font-semibold block" style={{ color: c.text }}>{stage.label}</span>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{stage.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile vertical lifecycle */}
        <ol className="sm:hidden flex flex-col gap-4" aria-label="Finding lifecycle stages">
          {FINDING_STAGES.map((stage, i) => {
            const c = COLOR_STYLES[stage.color] ?? COLOR_STYLES.primary;
            return (
              <li key={stage.label} className="flex gap-4 items-start">
                <div
                  className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: c.bg, borderColor: c.border, color: c.text }}
                >
                  {i + 1}
                </div>
                <div className="pt-0.5">
                  <h3 className="text-sm font-semibold" style={{ color: c.text }}>{stage.label}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{stage.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
