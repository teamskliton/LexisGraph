import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getStats, exportData } from '../api/endpoints';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { handleDownloadBlob } from '../utils/formatters';

function ExportBlock({ title, type, count, clauses }) {
  const [format, setFormat] = useState('pdf');

  const handleDownload = async () => {
    const response = await exportData(type, format);
    handleDownloadBlob(response.data, type, format);
  };

  return (
    <Card>
      <h3 className="text-xl font-semibold">{title}</h3>
      <div className="mt-3 inline-flex overflow-hidden rounded-lg border border-borderColor">
        {['pdf', 'excel'].map((item) => (
          <button
            key={item}
            onClick={() => setFormat(item)}
            className={`min-h-11 px-4 text-sm font-semibold uppercase ${format === item ? 'bg-accentPrimary text-white' : 'bg-bgSecondary'}`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-borderColor p-3 text-sm text-textSecondary">
        <p>Document count: {count}</p>
        <p>Total records: {clauses}</p>
      </div>
      <Button className="mt-3 w-full" onClick={handleDownload}>Download</Button>
    </Card>
  );
}

export default function ExportPage() {
  const statsQuery = useQuery({ queryKey: ['export-stats'], queryFn: async () => (await getStats()).data });
  const stats = statsQuery.data || {};

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ExportBlock
        title="User Documents Export"
        type="user"
        count={stats.user_documents_count ?? 0}
        clauses={stats.total_documents ?? 0}
      />
      <ExportBlock
        title="External Documents Export"
        type="external"
        count={stats.external_documents_count ?? 0}
        clauses={stats.total_documents ?? 0}
      />
    </div>
  );
}
