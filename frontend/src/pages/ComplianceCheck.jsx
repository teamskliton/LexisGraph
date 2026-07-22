import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, ChevronDown, FileSearch } from 'lucide-react';

import { runComplianceCheck, exportData } from '../api/endpoints';
import Button from '../components/ui/Button';
import ProgressBar from '../components/ui/ProgressBar';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge from '../components/ui/StatusBadge';
import { fmtPercent, handleDownloadBlob, truncate } from '../utils/formatters';

function ComplianceGauge({ score }) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? 'var(--accent-compliant)' : score >= 60 ? 'var(--accent-warning)' : 'var(--accent-gap)';

  return (
    <div
      style={{
        position: 'relative',
        width: 220,
        height: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <svg width="220" height="220" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="110" cy="110" r={radius} fill="none" stroke="var(--border-default)" strokeWidth="12" />
        <circle
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: `drop-shadow(0 0 8px ${color})`
          }}
        />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 42,
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1
          }}
        >
          {score}
          <span style={{ fontSize: 20, color: 'var(--text-muted)' }}>%</span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            marginTop: 4
          }}
        >
          COMPLIANCE
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, color }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{label}</span>
        <span style={{ fontSize: 10, color, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <div
        style={{
          height: 3,
          borderRadius: 2,
          background: 'var(--border-subtle)',
          overflow: 'hidden'
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
          style={{
            height: '100%',
            borderRadius: 2,
            background: color,
            boxShadow: `0 0 6px ${color}`
          }}
        />
      </div>
    </div>
  );
}

function ClauseResultCard({ clause, index }) {
  const [expanded, setExpanded] = useState(false);
  const normalizedStatus = String(clause.status || '').toLowerCase();
  const isCompliant = normalizedStatus === 'compliant';
  const isPartial = normalizedStatus === 'partial';
  const accentColor = isCompliant
    ? 'var(--accent-compliant)'
    : isPartial
      ? 'var(--accent-warning)'
      : 'var(--accent-gap)';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: '0 12px 12px 0',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all var(--transition-base)',
        boxShadow: 'var(--shadow-card)',
        marginBottom: 8
      }}
      onClick={() => setExpanded((v) => !v)}
      whileHover={{ boxShadow: `var(--shadow-card), -4px 0 20px ${accentColor}40` }}
    >
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${accentColor}15`,
            border: `1px solid ${accentColor}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 2
          }}
        >
          {isCompliant ? (
            <CheckCircle size={16} color="var(--accent-compliant)" />
          ) : (
            <AlertTriangle size={16} color={isPartial ? 'var(--accent-warning)' : 'var(--accent-gap)'} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
                letterSpacing: '0.05em'
              }}
            >
              CLAUSE #{String(index + 1).padStart(3, '0')}
            </span>

            <StatusBadge status={clause.status} />

            {!isCompliant ? (
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: isPartial ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.1)',
                  border: isPartial ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  color: isPartial ? 'var(--accent-warning)' : 'var(--accent-gap)',
                  fontFamily: 'var(--font-mono)',
                  animation: 'gapPulse 2s ease-in-out infinite'
                }}
              >
                {isPartial ? 'PARTIAL ALIGNMENT' : 'GAP DETECTED'}
              </span>
            ) : null}
          </div>

          <p
            style={{
              fontSize: 14,
              color: 'var(--text-primary)',
              lineHeight: 1.6,
              display: '-webkit-box',
              WebkitLineClamp: expanded ? 'none' : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              marginBottom: 12
            }}
          >
            {clause.policy_clause || clause.clause || '-'}
          </p>

          <div style={{ display: 'flex', gap: 20 }}>
            <ScoreBar label="Vector Score" value={Number(clause.vector_score || 0)} color="var(--accent-blue)" />
            <ScoreBar label="Graph Score" value={Number(clause.graph_score || 0)} color="var(--accent-graph-node)" />
            <ScoreBar label="Confidence" value={Number(clause.confidence || 0)} color={accentColor} />
          </div>
        </div>

        <motion.div animate={{ rotate: expanded ? 180 : 0 }} style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          <ChevronDown size={16} />
        </motion.div>
      </div>

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              borderTop: '1px solid var(--border-subtle)',
              padding: '16px 20px 16px 68px',
              background: 'var(--bg-surface)'
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                marginBottom: 8
              }}
            >
              MATCHED REGULATION CLAUSE
            </div>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
                padding: '12px 16px',
                background: 'var(--bg-card)',
                borderRadius: 8,
                border: '1px solid var(--border-subtle)',
                borderLeft: `3px solid ${accentColor}`
              }}
            >
              {clause.matched_clause || 'No match found'}
            </p>
            {clause.reasoning_summary ? (
              <>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.08em',
                    marginTop: 12,
                    marginBottom: 8
                  }}
                >
                  REASONING SUMMARY
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.7,
                    padding: '12px 16px',
                    background: 'var(--bg-card)',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  {clause.reasoning_summary}
                </p>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ComplianceCheck() {
  const [results, setResults] = useState([]);
  const [view, setView] = useState('cards');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('high');
  const [search, setSearch] = useState('');
  const [lastRun, setLastRun] = useState('');

  const complianceMutation = useMutation({
    mutationFn: async () => {
      const { data } = await runComplianceCheck();
      return data;
    },
    onSuccess: (data) => {
      const rows = Array.isArray(data?.results) ? data.results : [];
      setResults(rows);
      setLastRun(new Date().toISOString());
    }
  });

  const filtered = useMemo(() => {
    const f = results
      .filter((item) => (statusFilter === 'all' ? true : String(item.status || '').toLowerCase() === statusFilter))
      .filter((item) => (item.policy_clause || item.clause || '').toLowerCase().includes(search.toLowerCase()));
    f.sort((a, b) => (sortBy === 'high' ? (b.confidence || 0) - (a.confidence || 0) : (a.confidence || 0) - (b.confidence || 0)));
    return f;
  }, [results, statusFilter, sortBy, search]);

  const summary = useMemo(() => {
    const total = results.length;
    const compliant = results.filter((r) => String(r.status).toLowerCase() === 'compliant').length;
    const partial = results.filter((r) => String(r.status).toLowerCase() === 'partial').length;
    const gaps = results.filter((r) => String(r.status).toLowerCase() === 'gap').length;
    const avg = total ? results.reduce((sum, r) => sum + Number(r.confidence || 0), 0) / total : 0;
    return { total, compliant, partial, gaps, avg };
  }, [results]);

  const score = Math.round(summary.avg * 100);

  const exportFile = async (type, format) => {
    const res = await exportData(type, format);
    handleDownloadBlob(res.data, type, format);
  };

  return (
    <div className="space-y-4">
      <section
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 16,
          padding: 24,
          boxShadow: 'var(--shadow-card)'
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-header mb-0">Run Compliance Analysis</h3>
            <p className="text-sm text-[var(--text-secondary)]">Vector 0.8 + Graph 0.2 | Threshold 0.65</p>
          </div>
          <Button onClick={() => complianceMutation.mutate()} loading={complianceMutation.isPending}>
            Run Compliance Analysis
          </Button>
        </div>
        {complianceMutation.isPending ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">Extracting clauses, comparing embeddings, computing graph scores...</p>
            <ProgressBar value={70} color="var(--accent-warning)" />
          </div>
        ) : null}
        {lastRun ? <p className="mt-3 text-xs text-[var(--text-muted)]">Last run: {new Date(lastRun).toLocaleString()}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <div
          className="xl:col-span-3"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 16,
            padding: 24,
            boxShadow: 'var(--shadow-card)'
          }}
        >
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              Total: <strong>{summary.total}</strong>
            </div>
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              Compliant: <strong>{summary.compliant}</strong>
            </div>
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              Partial: <strong>{summary.partial}</strong>
            </div>
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              Gaps: <strong>{summary.gaps}</strong>
            </div>
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              Avg Confidence: <strong>{fmtPercent(summary.avg)}</strong>
            </div>
          </div>
        </div>

        <div
          className="xl:col-span-2"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 16,
            padding: 24,
            boxShadow: 'var(--shadow-card)',
            display: 'grid',
            placeItems: 'center'
          }}
        >
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Overall Score</h4>
          <div className="h-56">
            <ComplianceGauge score={score} />
          </div>
        </div>
      </section>

      <section
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 16,
          padding: 24,
          boxShadow: 'var(--shadow-card)'
        }}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            className="min-h-11 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="compliant">Compliant</option>
            <option value="partial">Partial</option>
            <option value="gap">Gap</option>
          </select>
          <select
            className="min-h-11 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="high">Confidence High to Low</option>
            <option value="low">Confidence Low to High</option>
          </select>
          <input
            className="min-h-11 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3"
            placeholder="Search clause text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant={view === 'cards' ? 'primary' : 'secondary'} onClick={() => setView('cards')}>Cards</Button>
          <Button variant={view === 'table' ? 'primary' : 'secondary'} onClick={() => setView('table')}>Table</Button>
        </div>

        {!filtered.length ? (
          <EmptyState
            icon={FileSearch}
            title="No Clause Results"
            description="Run the compliance pipeline to generate diagnostic clause-level intelligence."
            action={() => complianceMutation.mutate()}
            actionLabel="Run Analysis"
          />
        ) : view === 'cards' ? (
          <div className="space-y-3">
            {filtered.map((item, idx) => (
              <ClauseResultCard key={`${idx}-${item.policy_clause || item.clause}`} clause={item} index={idx} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-borderColor text-left">
                  <th className="p-2">#</th>
                  <th className="p-2">Policy Clause</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Confidence</th>
                  <th className="p-2">Vector</th>
                  <th className="p-2">Graph</th>
                  <th className="p-2">Matched Clause</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => (
                  <tr key={`${idx}-${row.policy_clause || row.clause}`} className="border-b border-[var(--border-subtle)]">
                    <td className="p-2">{idx + 1}</td>
                    <td className="p-2">{truncate(row.policy_clause || row.clause || '', 64)}</td>
                    <td className="p-2"><StatusBadge status={row.status} /></td>
                    <td className="p-2 mono">{fmtPercent(row.confidence || 0)}</td>
                    <td className="p-2 mono">{(row.vector_score || 0).toFixed(3)}</td>
                    <td className="p-2 mono">{(row.graph_score || 0).toFixed(3)}</td>
                    <td className="p-2">{truncate(row.matched_clause || '-', 56)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="flex flex-wrap gap-2"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 16,
          padding: 18,
          boxShadow: 'var(--shadow-card)'
        }}
      >
        <Button onClick={() => exportFile('user', 'pdf')}>Export PDF Report</Button>
        <Button variant="secondary" onClick={() => exportFile('external', 'excel')}>Export Excel</Button>
      </section>
    </div>
  );
}
