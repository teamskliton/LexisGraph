import { X, Check } from "lucide-react";
import { DIFFERENTIATION } from "./landing-content";

export default function DifferentiationSection() {
  return (
    <section
      aria-labelledby="diff-heading"
      className="landing-section"
      style={{ background: "var(--surface-muted)" }}
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="section-label justify-center">The Difference</div>
          <h2
            id="diff-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-3"
          >
            More than a document repository.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed mx-auto" style={{ maxWidth: "520px" }}>
            Traditional approaches to compliance create information debt. LexisGraph creates information assets.
          </p>
        </div>

        {/* Comparison table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Traditional */}
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-surface-muted">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Traditional Approach</h3>
            </div>
            <ul className="p-4 flex flex-col gap-1" role="list">
              {DIFFERENTIATION.traditional.map((point) => (
                <li key={point} className="comparison-cell">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}
                    aria-hidden="true"
                  >
                    <X className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-muted-foreground">{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* LexisGraph */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ borderColor: "var(--primary)", background: "var(--primary-subtle)" }}
          >
            <div
              className="px-6 py-4 border-b"
              style={{ borderColor: "var(--primary-muted)", background: "var(--primary-muted)" }}
            >
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--primary)" }}>LexisGraph</h3>
            </div>
            <ul className="p-4 flex flex-col gap-1" role="list">
              {DIFFERENTIATION.lexisgraph.map((point) => (
                <li key={point} className="comparison-cell">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                    aria-hidden="true"
                  >
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-foreground font-medium">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
