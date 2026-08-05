/**
 * KnowledgeGraphOverview
 *
 * A compact, reusable dashboard widget that surfaces the health and structural
 * status of the LexisGraph compliance knowledge graph.
 *
 * Design rules followed:
 *  - Uses existing CSS design tokens only (var(--*)); no new colours introduced.
 *  - Enterprise-minimal: no gradients, no glass, no heavy animations.
 *  - Relationship diagram is pure CSS/HTML; zero external graph libraries.
 *  - No additional data-fetching; receives derived props from the parent.
 *
 * Props
 * ─────
 *  stats          object | null   Raw response from GET /debug/stats
 *  graphJobData   object | null   Raw response from GET /graph-jobs/latest (optional)
 *  onExplore      () => void      Called when "Explore Knowledge Graph" is clicked
 */

const EMPTY = '—';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(value) {
  if (value === null || value === undefined) return EMPTY;
  const n = Number(value);
  return Number.isNaN(n) ? EMPTY : n.toLocaleString();
}

function fmtDate(value) {
  if (!value) return EMPTY;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? EMPTY : d.toLocaleString();
}

// ─── MetricRow ────────────────────────────────────────────────────────────────

function MetricRow({ label, value, mono = false }) {
  const isEmpty = value === EMPTY;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        padding: '7px 0',
        borderBottom: '1px solid var(--border-subtle)'
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: mono ? 13 : 12,
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
          fontWeight: 600,
          color: isEmpty ? 'var(--text-muted)' : 'var(--text-primary)',
          letterSpacing: mono ? '0.02em' : 0
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── RelationshipDiagram ──────────────────────────────────────────────────────
// Pure CSS — DOC → POL → REG — no SVG or graph library.

function RelationshipDiagram() {
  const nodes = [
    { label: 'Document',   abbr: 'DOC', color: 'var(--accent-blue)' },
    { label: 'Policy',     abbr: 'POL', color: 'var(--accent-graph-node)' },
    { label: 'Regulation', abbr: 'REG', color: 'var(--accent-teal)' }
  ];

  return (
    <div
      role="img"
      aria-label="Relationship flow: Document → Policy → Regulation"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 0 4px'
      }}
    >
      {nodes.map((node, i) => (
        <div key={node.label} style={{ display: 'flex', alignItems: 'center' }}>
          {/* Node */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `1.5px solid ${node.color}`,
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                color: node.color,
                letterSpacing: '0.03em'
              }}
            >
              {node.abbr}
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
              {node.label}
            </span>
          </div>

          {/* Arrow connector */}
          {i < nodes.length - 1 && (
            <div
              aria-hidden="true"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 4px',
                marginBottom: 14
              }}
            >
              <div style={{ width: 22, height: 1, background: 'var(--border-strong)' }} />
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderTop: '4px solid transparent',
                  borderBottom: '4px solid transparent',
                  borderLeft: '5px solid var(--border-strong)'
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── StatusRow ────────────────────────────────────────────────────────────────

function StatusRow({ label, ok }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          color: ok ? 'var(--accent-compliant)' : 'var(--text-muted)',
          width: 12,
          textAlign: 'center',
          flexShrink: 0
        }}
      >
        {ok ? '✓' : '○'}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
        {label}
      </span>
    </div>
  );
}

// ─── MappingStatusBadge ───────────────────────────────────────────────────────

function MappingStatusBadge({ active }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        border: `1px solid ${active ? 'var(--accent-compliant)' : 'var(--border-strong)'}`,
        color: active ? 'var(--accent-compliant)' : 'var(--text-muted)',
        background: active ? 'var(--accent-compliant-glow)' : 'transparent',
        whiteSpace: 'nowrap',
        flexShrink: 0
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: active ? 'var(--accent-compliant)' : 'var(--text-muted)',
          display: 'inline-block'
        }}
      />
      {active ? 'Indexed' : 'Pending'}
    </span>
  );
}

// ─── KnowledgeGraphOverview ───────────────────────────────────────────────────

export default function KnowledgeGraphOverview({ stats = null, graphJobData = null, onExplore }) {
  const userDocs = stats?.user_documents_count;
  const extDocs  = stats?.external_documents_count;
  const total    = stats?.total_documents;

  const hasData = stats != null && (
    (userDocs != null && userDocs > 0) ||
    (extDocs  != null && extDocs  > 0) ||
    (total    != null && total    > 0)
  );

  const indexedDocuments   = fmt(userDocs != null && extDocs != null ? userDocs + extDocs : (userDocs ?? extDocs));
  const indexedRegulations = fmt(extDocs);
  const internalPolicies   = fmt(userDocs);
  const connectedEntities  = fmt(total);
  const mappingStatus      = hasData ? 'Indexed' : 'Pending';
  const lastUpdate         = fmtDate(graphJobData?.completed_at);

  const graphHealthy         = hasData;
  const relationshipsIndexed = hasData && connectedEntities !== EMPTY;
  const readyForRetrieval    = graphHealthy && relationshipsIndexed;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div
        style={{
          padding: '16px 20px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12
        }}
      >
        <div>
          <p className="data-label" style={{ marginBottom: 4 }}>
            Graph Intelligence
          </p>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1.3
            }}
          >
            Knowledge Graph Overview
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
            Document relationships and regulatory mapping.
          </p>
        </div>
        <MappingStatusBadge active={hasData} />
      </div>

      {/* ── Body ───────────────────────────────────────── */}
      <div style={{ padding: '14px 20px', flex: 1 }}>

        {/* Metrics — or graceful empty state */}
        {!hasData ? (
          <div
            style={{
              padding: '14px 0 6px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
              lineHeight: 1.7,
              textAlign: 'center'
            }}
          >
            Data will appear after additional document ingestion.
          </div>
        ) : (
          <div>
            <MetricRow label="Indexed Documents"   value={indexedDocuments}   mono />
            <MetricRow label="Indexed Regulations" value={indexedRegulations} mono />
            <MetricRow label="Internal Policies"   value={internalPolicies}   mono />
            <MetricRow label="Connected Entities"  value={connectedEntities}  mono />
            <MetricRow label="Mapping Status"      value={mappingStatus} />
            <MetricRow label="Last Graph Update"   value={lastUpdate} />
          </div>
        )}

        {/* Relationship diagram */}
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px 8px',
            borderRadius: 10,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)'
          }}
        >
          <p className="data-label" style={{ marginBottom: 4 }}>
            Relationship Flow
          </p>
          <RelationshipDiagram />
        </div>

        {/* Status section */}
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)'
          }}
        >
          <p className="data-label" style={{ marginBottom: 6 }}>
            System Status
          </p>
          <StatusRow label="Graph Healthy"          ok={graphHealthy} />
          <StatusRow label="Relationships Indexed"  ok={relationshipsIndexed} />
          <StatusRow label="Ready for AI Retrieval" ok={readyForRetrieval} />
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────── */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        <button
          onClick={onExplore}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            padding: '9px 16px',
            borderRadius: 10,
            border: '1px solid var(--border-accent)',
            background: 'var(--accent-blue-glow)',
            color: 'var(--accent-blue)',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
            cursor: 'pointer',
            transition: 'background var(--transition-fast), border-color var(--transition-fast)',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(37,99,235,0.18)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--accent-blue-glow)';
          }}
        >
          Explore Knowledge Graph
        </button>
        <p
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            margin: 0,
            lineHeight: 1.5
          }}
        >
          Used by GraphRAG during AI compliance analysis.
        </p>
      </div>
    </div>
  );
}
