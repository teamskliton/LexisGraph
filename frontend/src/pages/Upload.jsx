import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Database, Files, Globe, RefreshCcw, UploadCloud } from 'lucide-react';

import { uploadDocument, triggerFetch, getUserDocuments } from '../api/endpoints';
import Button from '../components/ui/Button';
import ProgressBar from '../components/ui/ProgressBar';
import FileDropzone from '../components/upload/FileDropzone';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import { fmtDate, truncate } from '../utils/formatters';

export default function Upload() {
  const [files, setFiles] = useState([]);
  const [fetchItems, setFetchItems] = useState(5);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadsQuery = useQuery({
    queryKey: ['user-docs-table'],
    queryFn: async () => (await getUserDocuments()).data,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!files.length) throw new Error('Please select a file first');
      const file = files[0];
      const form = new FormData();
      form.append('file', file);
      return uploadDocument(form, (event) => {
        if (!event.total) return;
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      });
    },
    onSuccess: ({ data }) => {
      toast.success(`Uploaded. Clauses: ${data.clauses_count || 0}`);
      setFiles([]);
      setUploadProgress(0);
      uploadsQuery.refetch();
    },
    onError: (error) => toast.error(error?.message || 'Upload failed'),
  });

  const fetchMutation = useMutation({
    mutationFn: () => triggerFetch(Number(fetchItems) || 5),
    onSuccess: () => toast.success('External fetch triggered'),
  });

  const rows = useMemo(() => uploadsQuery.data?.documents || [], [uploadsQuery.data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="data-label">Document intake</p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Upload Documents</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
            Upload internal policy documents and trigger regulation ingestion for graph and compliance workflows.
          </p>
        </div>
        <Badge value={`${rows.length} stored`} tone="success" />
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="app-section p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">User Policy Upload</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Documents are processed for clause extraction and embeddings.</p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[var(--accent-blue)]">
              <UploadCloud size={20} />
            </span>
          </div>
          <div className="mt-5">
            <FileDropzone files={files} setFiles={setFiles} />
          </div>
          <div className="mt-5 space-y-3">
            <Button className="w-full" onClick={() => uploadMutation.mutate()} loading={uploadMutation.isPending}>Upload to Backend</Button>
            {uploadMutation.isPending ? <ProgressBar value={uploadProgress} /> : null}
          </div>
        </div>

        <div className="app-section p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Fetch Regulations</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Pull external regulation records through the existing fetch endpoint.</p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Globe size={20} />
            </span>
          </div>
          <div className="mt-5 space-y-3">
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              Max items
              <input
                value={fetchItems}
                onChange={(event) => setFetchItems(event.target.value)}
                type="number"
                min={1}
                className="form-input mt-2 w-full"
              />
            </label>
            <Button className="w-full" variant="secondary" onClick={() => fetchMutation.mutate()} loading={fetchMutation.isPending}>Fetch External Documents</Button>
          </div>
        </div>
      </section>

      <section className="app-section p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
              <Database size={18} />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Recent Uploads</h3>
              <p className="text-sm text-[var(--text-secondary)]">Processed user policy documents.</p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => uploadsQuery.refetch()}>
            <RefreshCcw size={15} /> Refresh
          </Button>
        </div>

        {rows.length ? (
          <div className="table-shell overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-card-hover)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="p-3">Filename</th>
                  <th className="p-3">Hash</th>
                  <th className="p-3">Clauses</th>
                  <th className="p-3">Upload Date</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id || row.hash} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)]">
                    <td className="p-3 font-medium text-[var(--text-primary)]">{truncate(row.title || row.filename || 'Untitled', 56)}</td>
                    <td className="p-3 mono text-xs text-[var(--text-secondary)]">{truncate(row.hash, 16)}</td>
                    <td className="p-3">{row.clause_count ?? 0}</td>
                    <td className="p-3">{fmtDate(row.created_at)}</td>
                    <td className="p-3"><Badge value="Stored" tone="success" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Files}
            title="No uploads yet"
            description="Uploaded documents will appear here with their processing status and clause footprint."
          />
        )}
      </section>
    </div>
  );
}
