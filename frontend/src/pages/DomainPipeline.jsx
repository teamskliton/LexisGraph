import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Cpu, GraduationCap, HeartPulse, ListChecks } from 'lucide-react';

import { uploadDomainDoc, getDomainStatus, listDomainDocs } from '../api/endpoints';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import FileDropzone from '../components/upload/FileDropzone';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';

const domains = [
  { key: 'IT', title: 'IT', icon: Cpu, desc: 'Technology, privacy, cybersecurity compliance.' },
  { key: 'HEALTHCARE', title: 'Healthcare', icon: HeartPulse, desc: 'Medical policy and safety regulations.' },
  { key: 'EDUCATION', title: 'Education', icon: GraduationCap, desc: 'Institutional compliance frameworks.' },
];

const stageMap = [
  'File Received',
  'Text Extraction',
  'Clause Processing',
  'Embedding Generation',
  'Graph Integration',
  'Complete',
];

export default function DomainPipeline() {
  const [selectedDomain, setSelectedDomain] = useState('IT');
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState(null);
  const [docs, setDocs] = useState([]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!files.length) throw new Error('Select a file');
      const formData = new FormData();
      formData.append('file', files[0]);
      const { data } = await uploadDomainDoc(selectedDomain, formData);
      return data;
    },
    onSuccess: (data) => {
      setStatus({ hash: data.file_hash, progress: 1, step: 'Upload started', status: 'processing' });
      setFiles([]);
    },
  });

  const listMutation = useMutation({
    mutationFn: async () => (await listDomainDocs(selectedDomain)).data,
    onSuccess: (data) => setDocs(data.files || []),
  });

  useEffect(() => {
    if (!status?.hash) return undefined;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const { data } = await getDomainStatus(status.hash);
        if (!active) return;
        setStatus(data);
      } catch {
        if (!active) return;
      }
    }, 3000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [status?.hash]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="data-label">Domain corpus</p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Domain Pipeline</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
            Upload and track regulation documents that become selectable domain evidence for the graph.
          </p>
        </div>
        <Badge value={status?.status || 'Idle'} tone={status?.status === 'complete' ? 'success' : status ? 'warning' : 'success'} />
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Select Domain</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {domains.map((domain) => {
            const Icon = domain.icon;
            const active = selectedDomain === domain.key;
            return (
              <button
                key={domain.key}
                type="button"
                onClick={() => setSelectedDomain(domain.key)}
                className={`rounded-2xl border p-4 text-left transition ${
                  active ? 'border-[var(--border-accent)] bg-blue-50 shadow-sm' : 'border-[var(--border-default)] bg-white hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-center gap-3 font-semibold text-[var(--text-primary)]">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${active ? 'bg-[var(--accent-blue)] text-white' : 'bg-[var(--bg-card-hover)] text-[var(--text-secondary)]'}`}>
                    <Icon size={17} />
                  </span>
                  {domain.title}
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{domain.desc}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Upload for {selectedDomain}</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Accepted formats: PDF and DOCX.</p>
            </div>
            <ListChecks size={20} className="text-[var(--text-muted)]" />
          </div>
          <div className="mt-4">
            <FileDropzone files={files} setFiles={setFiles} accept={{ 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }} />
          </div>
          <Button className="mt-4" onClick={() => uploadMutation.mutate()} loading={uploadMutation.isPending}>
            Upload to Domain Pipeline
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Status Tracking</h3>
          {status ? (
            <>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{status.step}</p>
              <div className="mt-4"><ProgressBar value={status.progress || 0} /></div>
              <div className="mt-5 space-y-3">
                {stageMap.map((stage, index) => {
                  const done = (status.progress || 0) >= ((index + 1) / stageMap.length) * 100;
                  return (
                    <div key={stage} className="flex items-center gap-3 text-sm">
                      <span className={`grid h-6 w-6 place-items-center rounded-full ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-[var(--bg-card-hover)] text-[var(--text-muted)]'}`}>
                        <CheckCircle2 size={14} />
                      </span>
                      <span className={done ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>{stage}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Upload a domain document to see extraction, processing, embeddings, and graph integration progress.</p>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Domain Documents</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">List documents stored for the selected domain.</p>
          </div>
          <Button variant="secondary" onClick={() => listMutation.mutate()} loading={listMutation.isPending}>View Documents</Button>
        </div>
        <div className="table-shell mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-card-hover)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <th className="p-3">Filename</th>
                <th className="p-3">Title</th>
                <th className="p-3">Clauses</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {docs.length ? docs.map((doc) => (
                <tr key={doc.filename} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="p-3">{doc.filename}</td>
                  <td className="p-3">{doc.title || '-'}</td>
                  <td className="p-3">{doc.clauses_count ?? 0}</td>
                  <td className="p-3">{doc.created_at || '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-[var(--text-muted)]">No documents loaded for this domain yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
