import Link from "next/link";
import { HERO } from "./landing-content";

export default function HeroSection() {
  return (
    <section
      id="product"
      aria-labelledby="hero-headline"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{ paddingTop: "5rem", paddingBottom: "3rem" }}
    >
      {/* Background mesh gradient */}
      <div className="hero-mesh" aria-hidden="true" />

      {/* Subtle grid overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="landing-container relative z-10 flex flex-col items-center text-center gap-8">
        {/* Overline badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary-muted bg-primary-subtle text-primary text-xs font-semibold tracking-wider uppercase">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          Compliance Intelligence Platform
        </div>

        {/* Headline */}
        <h1
          id="hero-headline"
          className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-foreground leading-[1.05]"
          style={{ maxWidth: "900px" }}
        >
          Turn Regulatory Complexity
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--gradient-hero-from), var(--gradient-hero-via) 50%, var(--gradient-hero-to))",
            }}
          >
            Into Compliance Clarity.
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-lg sm:text-xl text-muted-foreground leading-relaxed"
          style={{ maxWidth: "640px" }}
        >
          {HERO.subheadline}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <Link
            href={HERO.ctaPrimary.href}
            id="hero-cta-primary"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary-hover active:bg-primary-active transition-colors duration-150 shadow-lg hover:shadow-xl"
            style={{
              boxShadow: "0 4px 20px rgba(37,99,235,0.35)",
            }}
          >
            {HERO.ctaPrimary.label}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <a
            href={HERO.ctaSecondary.href}
            id="hero-cta-secondary"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium text-foreground border border-border rounded-xl hover:border-primary hover:text-primary hover:bg-primary-subtle transition-all duration-150"
          >
            {HERO.ctaSecondary.label}
          </a>
        </div>

        {/* Trust line */}
        <p className="text-xs text-subtle-foreground mt-1">
          No credit card required · Role-based access control · Organization-scoped data
        </p>

        {/* Hero visual — SVG compliance graph */}
        <div
          aria-hidden="true"
          className="relative mt-8 w-full"
          style={{ maxWidth: "780px" }}
        >
          <div
            className="relative rounded-2xl border border-border shadow-xl overflow-hidden"
            style={{
              background: "var(--surface)",
              boxShadow: "0 8px 48px rgba(37,99,235,0.12), 0 1px 3px rgba(15,23,42,0.08)",
            }}
          >
            {/* Window chrome */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-surface-muted">
              <span className="w-3 h-3 rounded-full bg-danger opacity-60" />
              <span className="w-3 h-3 rounded-full bg-warning opacity-60" />
              <span className="w-3 h-3 rounded-full bg-success opacity-60" />
              <span className="ml-3 text-xs text-subtle-foreground font-mono">LexisGraph — Knowledge Graph</span>
            </div>

            {/* Graph visualization */}
            <div className="p-6 sm:p-10">
              <svg
                viewBox="0 0 700 280"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full"
                aria-label="Compliance knowledge graph showing connected nodes from Regulation to Resolution"
              >
                {/* Edges */}
                <g opacity="0.45">
                  <line x1="350" y1="40" x2="175" y2="120" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="4,3" className="graph-edge-animate" />
                  <line x1="350" y1="40" x2="525" y2="120" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="4,3" className="graph-edge-animate" />
                  <line x1="175" y1="120" x2="175" y2="200" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4,3" className="graph-edge-animate" />
                  <line x1="525" y1="120" x2="525" y2="200" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4,3" className="graph-edge-animate" />
                  <line x1="175" y1="200" x2="350" y2="260" stroke="var(--warning)" strokeWidth="1.5" strokeDasharray="4,3" className="graph-edge-animate" />
                  <line x1="525" y1="200" x2="350" y2="260" stroke="var(--warning)" strokeWidth="1.5" strokeDasharray="4,3" className="graph-edge-animate" />
                </g>

                {/* Nodes */}
                {/* Regulation — top center */}
                <g className="graph-node-animate" style={{ animationDelay: "0s" }}>
                  <rect x="295" y="16" width="110" height="36" rx="18" fill="var(--primary-subtle)" stroke="var(--primary)" strokeWidth="1.5" />
                  <text x="350" y="38" textAnchor="middle" fill="var(--primary)" fontSize="12" fontWeight="700">Regulation</text>
                </g>

                {/* Requirements — mid left */}
                <g className="graph-node-animate" style={{ animationDelay: "0.4s" }}>
                  <rect x="108" y="96" width="134" height="36" rx="18" fill="var(--primary-subtle)" stroke="var(--primary)" strokeWidth="1.5" />
                  <text x="175" y="118" textAnchor="middle" fill="var(--primary)" fontSize="12" fontWeight="700">Requirements</text>
                </g>

                {/* Policies — mid right */}
                <g className="graph-node-animate" style={{ animationDelay: "0.2s" }}>
                  <rect x="458" y="96" width="134" height="36" rx="18" fill="var(--accent-subtle)" stroke="var(--accent)" strokeWidth="1.5" />
                  <text x="525" y="118" textAnchor="middle" fill="var(--accent)" fontSize="12" fontWeight="700">Policies</text>
                </g>

                {/* Evidence — lower left */}
                <g className="graph-node-animate" style={{ animationDelay: "0.6s" }}>
                  <rect x="115" y="176" width="120" height="36" rx="18" fill="var(--info-subtle)" stroke="var(--info)" strokeWidth="1.5" />
                  <text x="175" y="198" textAnchor="middle" fill="var(--info)" fontSize="12" fontWeight="700">Evidence</text>
                </g>

                {/* Finding — lower right */}
                <g className="graph-node-animate" style={{ animationDelay: "0.8s" }}>
                  <rect x="465" y="176" width="120" height="36" rx="18" fill="var(--warning-subtle)" stroke="var(--warning)" strokeWidth="1.5" />
                  <text x="525" y="198" textAnchor="middle" fill="var(--warning)" fontSize="12" fontWeight="700">Finding</text>
                </g>

                {/* Resolution — bottom center */}
                <g className="graph-node-animate" style={{ animationDelay: "1s" }}>
                  <rect x="290" y="237" width="120" height="36" rx="18" fill="var(--accent-subtle)" stroke="var(--accent)" strokeWidth="1.5" />
                  <text x="350" y="259" textAnchor="middle" fill="var(--accent)" fontSize="12" fontWeight="700">Resolution</text>
                </g>
              </svg>
            </div>
          </div>

          {/* Glow under the card */}
          <div
            aria-hidden="true"
            className="absolute -inset-x-8 -bottom-8 h-24 blur-3xl opacity-30 pointer-events-none rounded-full"
            style={{ background: "linear-gradient(90deg, var(--primary), var(--accent))" }}
          />
        </div>
      </div>
    </section>
  );
}
