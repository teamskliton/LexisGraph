import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Cpu, GraduationCap, HeartPulse } from 'lucide-react';

import { uploadDomainDoc, getDomainStatus, listDomainDocs } from '../api/endpoints';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import FileDropzone from '../components/upload/FileDropzone';
import ProgressBar from '../components/ui/ProgressBar';

const domains = [
  { key: 'IT', title: 'IT', icon: Cpu, desc: 'Technology, privacy, cybersecurity compliance.' },
  { key: 'HEALTHCARE', title: 'Healthcare', icon: HeartPulse, desc: 'Medical policy and safety regulations.' },
  { key: 'EDUCATION', title: 'Education', icon: GraduationCap, desc: 'Institutional compliance frameworks.' }
];

const stageMap = [
  'File Received',
  'Text Extraction',
  'Clause Processing',
  'Embedding Generation',
  'Graph Integration',
  'Complete'
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
    }
  });

  const listMutation = useMutation({
    mutationFn: async () => (await listDomainDocs(selectedDomain)).data,
    onSuccess: (data) => setDocs(data.files || [])
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
    <div className="space-y-4">
      <Card>
        <h3 className="text-2xl font-semibold">Domain Pipeline</h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {domains.map((domain) => {
            const Icon = domain.icon;
            const active = selectedDomain === domain.key;
            return (
              <button key={domain.key} onClick={() => setSelectedDomain(domain.key)} className={`min-h-11 rounded-xl border p-3 text-left transition ${active ? 'border-accentPrimary bg-blue-500/10' : 'border-borderColor'}`}>
                <div className="flex items-center gap-2 font-semibold"><Icon size={16} /> {domain.title}</div>
                <p className="mt-1 text-xs text-textSecondary">{domain.desc}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h4 className="text-lg font-semibold">Upload for {selectedDomain}</h4>
        <div className="mt-3">
          <FileDropzone files={files} setFiles={setFiles} accept={{ 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }} />
        </div>
        <Button className="mt-3" onClick={() => uploadMutation.mutate()} loading={uploadMutation.isPending}>
          Upload to Domain Pipeline
        </Button>
      </Card>

      {status ? (
        <Card>
          <h4 className="text-lg font-semibold">Status Tracking</h4>
          <p className="text-sm text-textSecondary">{status.step}</p>
          <div className="mt-2"><ProgressBar value={status.progress || 0} /></div>
          <div className="mt-4 space-y-2">
            {stageMap.map((stage, idx) => {
              const done = (status.progress || 0) >= ((idx + 1) / stageMap.length) * 100;
              return (
                <div key={stage} className="flex items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${done ? 'bg-accentSecondary' : 'bg-slate-400'}`} />
                  <span>{stage}</span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold">Domain Documents</h4>
          <Button variant="secondary" onClick={() => listMutation.mutate()} loading={listMutation.isPending}>View Documents</Button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-borderColor text-left">
                <th className="p-2">Filename</th>
                <th className="p-2">Title</th>
                <th className="p-2">Clauses</th>
                <th className="p-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.filename} className="border-b border-borderColor/60">
                  <td className="p-2">{doc.filename}</td>
                  <td className="p-2">{doc.title || '-'}</td>
                  <td className="p-2">{doc.clauses_count ?? 0}</td>
                  <td className="p-2">{doc.created_at || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
