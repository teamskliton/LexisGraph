import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Activity, AlignLeft, FileText, Globe, Network, RefreshCcw, ShieldCheck, UploadCloud } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';

import {
  getStats,
  getUserDocuments,
  getExternalDocuments,
  runComplianceCheck,
  triggerFetch,
  buildGraph
} from '../api/endpoints';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import { fmtDate } from '../utils/formatters';

const containerVariants = {
  animate: { transition: { staggerChildren: 0.08 } }
};

const itemVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 }
};

function StatCard({ title, value, icon: Icon, accent }) {
  return (
    <motion.div variants={itemVariants} className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-textSecondary">{title}</p>
        <Icon size={18} style={{ color: accent }} />
      </div>
      <p className="mt-3 text-3xl font-bold mono">{value}</p>
    </motion.div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();

  const statsQuery = useQuery({ queryKey: ['stats'], queryFn: async () => (await getStats()).data });
  const userDocsQuery = useQuery({ queryKey: ['user-docs'], queryFn: async () => (await getUserDocuments()).data });
  const extDocsQuery = useQuery({ queryKey: ['ext-docs'], queryFn: async () => (await getExternalDocuments()).data });

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
    const rows = [];
    const source = [];
    source.forEach((item) => rows.push(item));
    return rows;
  }, []);

  const cards = [
    { title: 'Total User Documents', value: statsQuery.data?.user_documents_count ?? '-', icon: FileText, accent: 'var(--accent-primary)' },
    { title: 'Total External Documents', value: statsQuery.data?.external_documents_count ?? '-', icon: Globe, accent: 'var(--accent-secondary)' },
    { title: 'Total Clauses Processed', value: statsQuery.data?.total_documents ?? '-', icon: AlignLeft, accent: 'var(--accent-graph)' },
    { title: 'System Health', value: statsQuery.isError ? 'Offline' : 'Online', icon: Activity, accent: statsQuery.isError ? 'var(--accent-danger)' : 'var(--accent-secondary)' }
  ];

  return (
    <div className="space-y-6">
      <motion.section variants={containerVariants} initial="initial" animate="animate" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </motion.section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xl font-semibold">Recent Activity</h3>
            <Button variant="secondary" onClick={() => { queryClient.invalidateQueries({ queryKey: ['user-docs'] }); queryClient.invalidateQueries({ queryKey: ['ext-docs'] }); }}>
              <RefreshCcw size={14} /> Refresh
            </Button>
          </div>
          <div className="space-y-2">
            {userDocsQuery.isLoading || extDocsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : activity.length ? (
              activity.map((item) => (
                <div key={item.id || item.hash} className={`rounded-lg border-l-4 border border-borderColor p-3 ${item.type === 'user' ? 'border-l-blue-500' : 'border-l-teal-500'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{item.title || 'Untitled'}</p>
                    <span className="text-xs uppercase text-textMuted">{item.type}</span>
                  </div>
                  <p className="mt-1 text-xs text-textSecondary">{fmtDate(item.created_at)} | Clauses: {item.clause_count ?? 0}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-textSecondary">No activity yet.</p>
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <h3 className="text-xl font-semibold">Compliance Overview</h3>
          <div className="mt-4 h-60">
            {complianceData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={complianceData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={90}>
                    <Cell fill="var(--accent-secondary)" />
                    <Cell fill="var(--accent-danger)" />
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-textSecondary">
                <p>Run compliance check to visualize clause gaps.</p>
                <Button onClick={() => quickMutation.mutate('compliance')} loading={quickMutation.isPending}>Run Compliance Check</Button>
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <h3 className="text-xl font-semibold">Pipeline Status</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-borderColor p-3">
              <p className="text-sm font-semibold">Layer 1 Ingestion</p>
              <p className="text-xs text-textSecondary">Ready</p>
            </div>
            <div className="rounded-lg border border-borderColor p-3">
              <p className="text-sm font-semibold">Layer 2 Graph Build</p>
              <p className="text-xs text-textSecondary">On-demand</p>
            </div>
            <div className="rounded-lg border border-borderColor p-3">
              <p className="text-sm font-semibold">Layer 3 Compliance</p>
              <p className="text-xs text-textSecondary">On-demand</p>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <h3 className="text-xl font-semibold">Quick Actions</h3>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => window.location.assign('/upload')}><UploadCloud size={14} /> Upload</Button>
            <Button variant="secondary" onClick={() => quickMutation.mutate('fetch')} loading={quickMutation.isPending}><Globe size={14} /> Fetch</Button>
            <Button variant="secondary" onClick={() => quickMutation.mutate('graph')} loading={quickMutation.isPending}><Network size={14} /> Build Graph</Button>
            <Button variant="secondary" onClick={() => quickMutation.mutate('compliance')} loading={quickMutation.isPending}><ShieldCheck size={14} /> Compliance</Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
