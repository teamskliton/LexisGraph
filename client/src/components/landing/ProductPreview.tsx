export default function ProductPreview() {
  return (
    <section
      aria-labelledby="preview-heading"
      className="landing-section bg-background"
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="section-label justify-center">Product Preview</div>
          <h2
            id="preview-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-3"
          >
            What working in LexisGraph looks like.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed mx-auto" style={{ maxWidth: "520px" }}>
            Illustrative examples of the kinds of insights LexisGraph surfaces for compliance teams.
          </p>
          <p className="mt-2 text-xs text-subtle-foreground">
            All data shown is illustrative and for demonstration purposes only.
          </p>
        </div>

        {/* 3 preview cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Card 1 — Coverage Overview */}
          <div className="preview-card">
            <div className="preview-card-header">
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compliance Analysis</span>
                <h3 className="text-sm font-bold text-foreground mt-0.5">GDPR Coverage — Q3 2024</h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--warning-subtle)", color: "var(--warning)" }}>
                In Progress
              </span>
            </div>
            <div className="preview-card-body flex flex-col gap-5">
              {/* Coverage bars */}
              {[
                { label: "Covered",  count: 72, color: "var(--accent)",  bg: "var(--accent-subtle)"  },
                { label: "Partial",  count: 18, color: "var(--warning)", bg: "var(--warning-subtle)" },
                { label: "Gaps",     count: 7,  color: "var(--danger)",  bg: "var(--danger-subtle)"  },
              ].map(({ label, count, color, bg }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    <span className="text-xs font-bold" style={{ color }}>{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(count / 97) * 100}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">97 requirements analysed · 74.2% coverage</span>
              </div>
            </div>
          </div>

          {/* Card 2 — Finding */}
          <div className="preview-card">
            <div className="preview-card-header">
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Finding</span>
                <h3 className="text-sm font-bold text-foreground mt-0.5">F-104</h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}>
                High
              </span>
            </div>
            <div className="preview-card-body flex flex-col gap-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Data retention policy does not address the requirement for right to erasure under Art. 17. No documented procedure exists.
              </p>

              {/* Status */}
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "var(--primary-subtle)" }}>
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: "var(--primary)" }}
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold" style={{ color: "var(--primary)" }}>In Remediation</span>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-subtle-foreground">Regulation</span>
                  <p className="text-xs font-medium text-foreground mt-0.5">GDPR Art. 17</p>
                </div>
                <div>
                  <span className="text-xs text-subtle-foreground">Assigned to</span>
                  <p className="text-xs font-medium text-foreground mt-0.5">Compliance Analyst</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3 — Graph snippet */}
          <div className="preview-card">
            <div className="preview-card-header">
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Knowledge Graph</span>
                <h3 className="text-sm font-bold text-foreground mt-0.5">Relationship View</h3>
              </div>
            </div>
            <div className="preview-card-body">
              <svg
                viewBox="0 0 260 200"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full"
                aria-label="Mini graph showing Regulation to Requirement to Policy to Finding chain"
                role="img"
              >
                {/* Vertical chain */}
                <line x1="130" y1="40" x2="130" y2="80" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="4,3" />
                <line x1="130" y1="110" x2="130" y2="150" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="4,3" />
                <line x1="130" y1="178" x2="200" y2="195" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="4,3" />

                {/* Regulation */}
                <rect x="80" y="16" width="100" height="30" rx="15" fill="var(--primary-subtle)" stroke="var(--primary)" strokeWidth="1.5" />
                <text x="130" y="35" textAnchor="middle" fill="var(--primary)" fontSize="11" fontWeight="700">Regulation</text>

                {/* Requirement */}
                <rect x="75" y="80" width="110" height="30" rx="15" fill="var(--primary-subtle)" stroke="var(--primary)" strokeWidth="1.5" />
                <text x="130" y="99" textAnchor="middle" fill="var(--primary)" fontSize="11" fontWeight="700">Requirement</text>

                {/* Policy */}
                <rect x="85" y="148" width="90" height="30" rx="15" fill="var(--accent-subtle)" stroke="var(--accent)" strokeWidth="1.5" />
                <text x="130" y="167" textAnchor="middle" fill="var(--accent)" fontSize="11" fontWeight="700">Policy</text>

                {/* Finding */}
                <rect x="158" y="182" width="82" height="28" rx="14" fill="var(--warning-subtle)" stroke="var(--warning)" strokeWidth="1.5" />
                <text x="199" y="200" textAnchor="middle" fill="var(--warning)" fontSize="11" fontWeight="700">Finding</text>
              </svg>

              <p className="text-xs text-center text-subtle-foreground mt-3">
                Trace any finding back to its originating regulation
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
