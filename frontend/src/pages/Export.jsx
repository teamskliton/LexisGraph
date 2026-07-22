import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

import { getStats, exportData } from '../api/endpoints';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { handleDownloadBlob } from '../utils/formatters';

function ExportBlock({ title, type, count, clauses, description }) {
  const [format, setFormat] = useState('pdf');
  const Icon = format === 'pdf' ? FileText : FileSpreadsheet;

  const handleDownload = async () => {
    const response = await exportData(type, format);
    handleDownloadBlob(response.data, type, format);
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="data-label">{type} export</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[var(--accent-blue)]">
          <Icon size={20} />
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card-hover)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Documents</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{count}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card-hover)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Records</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{clauses}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-[var(--border-default)] bg-white p-1">
          {['pdf', 'excel'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFormat(item)}
              className={`h-9 rounded-full px-4 text-sm font-semibold uppercase transition ${
                format === item ? 'bg-[var(--accent-blue)] text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <Button onClick={handleDownload}>
          <Download size={16} /> Download
        </Button>
      </div>
    </Card>
  );
}

export default function ExportPage() {
  const statsQuery = useQuery({ queryKey: ['export-stats'], queryFn: async () => (await getStats()).data });
  const stats = statsQuery.data || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="data-label">Reporting</p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Export & Reports</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
            Generate downloadable reports from processed user policies and external regulation documents.
          </p>
        </div>
        <Badge value={statsQuery.isFetching ? 'Syncing' : 'Ready'} tone={statsQuery.isFetching ? 'warning' : 'success'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ExportBlock
          title="User Documents Export"
          type="user"
          count={stats.user_documents_count ?? 0}
          clauses={stats.total_documents ?? 0}
          description="Download uploaded policy document records and processed clause data."
        />
        <ExportBlock
          title="External Documents Export"
          type="external"
          count={stats.external_documents_count ?? 0}
          clauses={stats.total_documents ?? 0}
          description="Download fetched regulation data and domain corpus records."
        />
      </div>
    </div>
  );
}
