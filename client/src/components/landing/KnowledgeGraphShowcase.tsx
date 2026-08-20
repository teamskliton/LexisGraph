"use client";

import { Suspense, lazy } from "react";

// Lazily loaded graph — no impact on initial page load
const GraphCanvas = lazy(() => import("./KnowledgeGraphCanvas"));

function GraphFallback() {
  return (
    <div
      className="w-full rounded-2xl border border-border bg-surface-muted animate-pulse"
      style={{ minHeight: "340px" }}
      aria-label="Loading knowledge graph visualization"
    />
  );
}

export default function KnowledgeGraphShowcase() {
  return (
    <section
      aria-labelledby="kg-heading"
      className="landing-section bg-background"
    >
      <div className="landing-container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left — copy */}
          <div className="flex flex-col gap-5">
            <div className="section-label">Knowledge Graph</div>
            <h2
              id="kg-heading"
              className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground"
            >
              See compliance as a connected graph, not isolated documents.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              LexisGraph maps every entity — regulation, requirement, policy, evidence, finding, and remediation — as a node in a queryable graph. Instead of opening five files to understand one relationship, you traverse one graph.
            </p>
            <ul className="flex flex-col gap-3 mt-2" role="list">
              {[
                "Trace any finding back to its originating regulation",
                "Understand policy coverage gaps visually",
                "Filter the graph by entity type, status, or owner",
                "Export relationships for audit documentation",
              ].map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span
                    className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — graph canvas */}
          <div className="relative">
            <Suspense fallback={<GraphFallback />}>
              <GraphCanvas />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}
