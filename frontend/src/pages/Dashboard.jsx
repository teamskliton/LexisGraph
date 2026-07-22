import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Activity, AlignLeft, FileText, Globe, Network, RefreshCcw, ShieldCheck, UploadCloud } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';

import {
  getStats,
  getUserDocuments,
  getExternalDocuments,
  runComplianceCheck,
  triggerFetch,
  buildGraph
} from '../api/endpoints';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { fmtDate } from '../utils/formatters';

function useAnimatedCounter(target, duration = 1500) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const targetNum = Number(target) || 0;
    let start = 0;
    const increment = targetNum / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= targetNum) {
        setCount(targetNum);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [target, duration]);

  return count;
}

function AnimatedCounter({ value, style }) {
  const counter = useAnimatedCounter(value);
  return <span style={style}>{counter}</span>;
}

function StatCard({ icon: Icon, label, value, color, glowColor, trend = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 16,
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
        transition: 'all var(--transition-base)',
        boxShadow: 'var(--shadow-card)'
      }}
      onHoverStart={(e) => {
        e.currentTarget.style.borderColor = glowColor;
        e.currentTarget.style.boxShadow = `var(--shadow-card), 0 0 30px ${glowColor}`;
      }}
      onHoverEnd={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.boxShadow = 'var(--shadow-card)';
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
          opacity: 0.15,
          pointerEvents: 'none'
        }}
      />

      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `${glowColor}20`,
          border: `1px solid ${glowColor}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16
        }}
      >
        <Icon size={18} color={color} strokeWidth={2} />
      </div>

      <AnimatedCounter
        value={value}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 36,
          fontWeight: 600,
          color: 'var(--text-primary)',
          lineHeight: 1,
          marginBottom: 6,
          display: 'block'
        }}
      />

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</div>

      <div
        style={{
          marginTop: 12,
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: trend > 0 ? 'var(--accent-compliant)' : 'var(--accent-gap)'
        }}
      >
        {trend > 0 ? '+' : '-'}{Math.abs(trend)} since last build
      </div>
    </motion.div>
  );
}

function PipelineStatus() {
  const layers = [
    { label: 'Layer 1', sublabel: 'Data Ingestion', icon: Globe, color: 'var(--accent-blue)' },
    { label: 'Layer 2', sublabel: 'Graph Intelligence', icon: Network, color: 'var(--accent-graph-node)' },
    { label: 'Layer 3', sublabel: 'Compliance Scoring', icon: ShieldCheck, color: 'var(--accent-teal)' }
  ];

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 16,
        padding: 24,
        boxShadow: 'var(--shadow-card)'
      }}
    >
      <div className="section-header">Pipeline Status</div>
      {layers.map((layer, i) => (
        <div key={layer.label}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 10,
              background: `${layer.color}10`,
              border: `1px solid ${layer.color}25`
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: `${layer.color}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <layer.icon size={14} color={layer.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {layer.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{layer.sublabel}</div>
            </div>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: layer.color,
                boxShadow: `0 0 8px ${layer.color}`,
                animation: 'breathe 2s ease-in-out infinite'
              }}
            />
          </div>
          {i < layers.length - 1 ? (
            <div
              style={{
                width: 1,
                height: 16,
                marginLeft: 27,
                background: `linear-gradient(180deg, ${layer.color}, transparent)`,
                borderLeft: `1px dashed ${layer.color}50`
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 24 }}>
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--bg-card)',
            borderRadius: 16,
            padding: 24,
            border: '1px solid var(--border-default)'
          }}
        >
          <Skeleton width={40} height={40} borderRadius={10} style={{ marginBottom: 16 }} />
          <Skeleton width="60%" height={36} style={{ marginBottom: 8 }} />
          <Skeleton width="80%" height={14} />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const statsQuery = useQuery({ queryKey: ['stats'], queryFn: async () => (await getStats()).data });
  const userDocsQuery = useQuery({ queryKey: ['user-docs'], queryFn: async () => (await getUserDocuments()).data });
  const extDocsQuery = useQuery({ queryKey: ['ext-docs'], queryFn: async () => (await getExternalDocuments()).data });
  const complianceQuery = useQuery({
    queryKey: ['dashboard-compliance'],
    queryFn: async () => (await runComplianceCheck()).data,
    retry: false
  });

  const quickMutation = useMutation({
    mutationFn: async (action) => {
      if (action === 'fetch') return triggerFetch(5);
      if (action === 'graph') return buildGraph();
      if (action === 'compliance') return runComplianceCheck();
      return null;
    },
    onSuccess: () => {
      toast.success('Action completed');
      queryClient.invalidateQueries();
    },
    onError: (error, action) => {
      if (action !== 'graph') return;
      const detail = String(error?.response?.data?.detail || '');
      if (detail.includes('7687') || detail.toLowerCase().includes('couldn\'t connect')) {
        toast.error('Graph build failed: Neo4j is not reachable. Check Neo4j server and env vars.', {
          duration: 6000
        });
      }
    }
  });

  const activity = useMemo(() => {
    const users = (userDocsQuery.data?.documents || []).map((d) => ({ ...d, type: 'user' }));
    const exts = (extDocsQuery.data?.documents || []).map((d) => ({ ...d, type: 'external' }));
    return [...users, ...exts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
  }, [userDocsQuery.data, extDocsQuery.data]);

  const complianceData = useMemo(() => {
    const rows = Array.isArray(complianceQuery.data?.results) ? complianceQuery.data.results : [];
    if (!rows.length) return [];
    const compliant = rows.filter((item) => String(item.status || '').toLowerCase() === 'compliant').length;
    const gaps = rows.length - compliant;
    return [
      { name: 'Compliant', value: compliant },
      { name: 'Gap', value: gaps }
    ];
  }, [complianceQuery.data]);

  const cards = [
    {
      label: 'Total User Documents',
      value: statsQuery.data?.user_documents_count ?? 0,
      icon: FileText,
      color: 'var(--accent-blue)',
      glowColor: 'rgba(59,130,246,0.5)',
      trend: 6
    },
    {
      label: 'Total External Documents',
      value: statsQuery.data?.external_documents_count ?? 0,
      icon: Globe,
      color: 'var(--accent-teal)',
      glowColor: 'rgba(20,184,166,0.5)',
      trend: 11
    },
    {
      label: 'Total Clauses Processed',
      value: statsQuery.data?.total_documents ?? 0,
      icon: AlignLeft,
      color: 'var(--accent-graph-node)',
      glowColor: 'rgba(129,140,248,0.5)',
      trend: 9
    },
    {
      label: 'System Health',
      value: statsQuery.isError ? 0 : 100,
      icon: Activity,
      color: statsQuery.isError ? 'var(--accent-gap)' : 'var(--accent-compliant)',
      glowColor: statsQuery.isError ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)',
      trend: statsQuery.isError ? -2 : 3
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="data-label">Overview</p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Dashboard</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
            Monitor uploaded policies, external regulations, compliance runs, and graph readiness from one workspace.
          </p>
        </div>
      </div>

      {statsQuery.isLoading ? (
        <DashboardSkeleton />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </section>
      )}

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
          <div className="mb-4 flex items-center justify-between">
            <h3 className="section-header mb-0">Recent Activity</h3>
            <Button
              variant="secondary"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['user-docs'] });
                queryClient.invalidateQueries({ queryKey: ['ext-docs'] });
              }}
            >
              <RefreshCcw size={14} /> Refresh
            </Button>
          </div>

          <div className="space-y-2">
            {userDocsQuery.isLoading || extDocsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton height={48} borderRadius={10} />
                <Skeleton height={48} borderRadius={10} />
                <Skeleton height={48} borderRadius={10} />
              </div>
            ) : activity.length ? (
              activity.map((item) => (
                <div
                  key={item.id || item.hash}
                  style={{
                    border: '1px solid var(--border-default)',
                    borderLeft: `3px solid ${item.type === 'user' ? 'var(--accent-blue)' : 'var(--accent-teal)'}`,
                    borderRadius: 10,
                    padding: 14,
                    background: 'var(--bg-surface)'
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[var(--text-primary)]">{item.title || 'Untitled'}</p>
                    <span className="data-label">{item.type}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {fmtDate(item.created_at)} | Clauses: {item.clause_count ?? 0}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState
                icon={Activity}
                title="No Activity Yet"
                description="Upload internal policies and fetch regulations to generate your first intelligence trace."
                action={() => navigate('/upload')}
                actionLabel="Go to Upload"
              />
            )}
          </div>
        </div>

        <div
          className="xl:col-span-2"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 16,
            padding: 24,
            boxShadow: 'var(--shadow-card)'
          }}
        >
          <h3 className="section-header mb-0">Compliance Overview</h3>
          <div className="mt-4 h-60">
            {complianceData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={complianceData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={90}>
                    <Cell fill="var(--accent-compliant)" />
                    <Cell fill="var(--accent-gap)" />
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: 'var(--accent-blue-glow)',
                    border: '1px solid var(--border-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--glow-blue)',
                    marginBottom: 18
                  }}
                >
                  <ShieldCheck size={30} color="var(--accent-blue)" strokeWidth={1.6} />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: 10
                  }}
                >
                  Compliance Map Pending
                </div>
                <div className="max-w-[320px] text-sm leading-6 text-[var(--text-secondary)]">
                  Run compliance once to render vector and graph-assisted risk visualization.
                </div>
                <button
                  onClick={() => quickMutation.mutate('compliance')}
                  className="mt-5 rounded-xl border border-[var(--border-accent)] bg-[var(--accent-blue-glow)] px-4 py-2 text-sm font-semibold text-[var(--accent-blue)] transition hover:-translate-y-[1px]"
                >
                  Run Compliance Check
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <PipelineStatus />
        </div>

        <div
          className="xl:col-span-2"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 16,
            padding: 24,
            boxShadow: 'var(--shadow-card)'
          }}
        >
          <h3 className="section-header mb-0">Quick Actions</h3>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => navigate('/upload')}>
              <UploadCloud size={14} /> Upload
            </Button>
            <Button variant="secondary" onClick={() => quickMutation.mutate('fetch')} loading={quickMutation.isPending}>
              <Globe size={14} /> Fetch
            </Button>
            <Button variant="secondary" onClick={() => quickMutation.mutate('graph')} loading={quickMutation.isPending}>
              <Network size={14} /> Build Graph
            </Button>
            <Button variant="secondary" onClick={() => quickMutation.mutate('compliance')} loading={quickMutation.isPending}>
              <ShieldCheck size={14} /> Compliance
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
