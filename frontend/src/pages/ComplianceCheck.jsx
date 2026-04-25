import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';

import { runComplianceCheck, exportData } from '../api/endpoints';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ComplianceCard from '../components/compliance/ComplianceCard';
import ClauseDetail from '../components/compliance/ClauseDetail';
import ProgressBar from '../components/ui/ProgressBar';
import { fmtPercent, handleDownloadBlob, truncate } from '../utils/formatters';

export default function ComplianceCheck() {
  const [results, setResults] = useState([]);
  const [detail, setDetail] = useState(null);
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
      const rows = Array.isArray(data) ? data : data.results || data.compliance_results || [];
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
    const gaps = total - compliant;
    const avg = total ? results.reduce((sum, r) => sum + Number(r.confidence || 0), 0) / total : 0;
    return { total, compliant, gaps, avg };
  }, [results]);

  const gaugeData = [{ name: 'score', value: Math.round(summary.avg * 100), fill: 'var(--accent-primary)' }];

  const exportFile = async (type, format) => {
    const res = await exportData(type, format);
    handleDownloadBlob(res.data, type, format);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-semibold">Run Compliance Analysis</h3>
            <p className="text-sm text-textSecondary">Vector 0.8 + Graph 0.2 | Threshold 0.65</p>
          </div>
          <Button onClick={() => complianceMutation.mutate()} loading={complianceMutation.isPending}>
            Run Compliance Analysis
          </Button>
        </div>
        {complianceMutation.isPending ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-textSecondary">Extracting clauses, comparing embeddings, computing graph scores...</p>
            <ProgressBar value={70} color="var(--accent-warning)" />
          </div>
        ) : null}
        {lastRun ? <p className="mt-3 text-xs text-textMuted">Last run: {new Date(lastRun).toLocaleString()}</p> : null}
      </Card>

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-borderColor p-3">Total: <strong>{summary.total}</strong></div>
            <div className="rounded-lg border border-borderColor p-3">Compliant: <strong>{summary.compliant}</strong></div>
            <div className="rounded-lg border border-borderColor p-3">Gaps: <strong>{summary.gaps}</strong></div>
            <div className="rounded-lg border border-borderColor p-3">Avg Confidence: <strong>{fmtPercent(summary.avg)}</strong></div>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <h4 className="font-semibold">Overall Compliance Score</h4>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart data={gaugeData} innerRadius="60%" outerRadius="100%" startAngle={180} endAngle={0}>
                <RadialBar minAngle={15} dataKey="value" cornerRadius={8} />
                <RTooltip />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <select className="min-h-11 rounded-lg border border-borderColor bg-bgSecondary px-3" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="compliant">Compliant</option>
            <option value="gap">Gap</option>
          </select>
          <select className="min-h-11 rounded-lg border border-borderColor bg-bgSecondary px-3" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="high">Confidence High to Low</option>
            <option value="low">Confidence Low to High</option>
          </select>
          <input className="min-h-11 flex-1 rounded-lg border border-borderColor bg-bgSecondary px-3" placeholder="Search clause text" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button variant={view === 'cards' ? 'primary' : 'secondary'} onClick={() => setView('cards')}>Cards</Button>
          <Button variant={view === 'table' ? 'primary' : 'secondary'} onClick={() => setView('table')}>Table</Button>
        </div>

        {view === 'cards' ? (
          <div className="space-y-3">
            {filtered.map((item, idx) => (
              <ComplianceCard key={`${idx}-${item.policy_clause || item.clause}`} item={item} index={idx} onDetails={setDetail} />
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
                  <tr key={`${idx}-${row.policy_clause || row.clause}`} className="border-b border-borderColor/60">
                    <td className="p-2">{idx + 1}</td>
                    <td className="p-2">{truncate(row.policy_clause || row.clause || '', 64)}</td>
                    <td className="p-2"><Badge value={row.status} /></td>
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
      </Card>

      <Card className="flex flex-wrap gap-2">
        <Button onClick={() => exportFile('user', 'pdf')}>Export PDF Report</Button>
        <Button variant="secondary" onClick={() => exportFile('external', 'excel')}>Export Excel</Button>
      </Card>

      <ClauseDetail open={Boolean(detail)} item={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
