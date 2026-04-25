import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { uploadDocument, triggerFetch, getUserDocuments } from '../api/endpoints';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ProgressBar from '../components/ui/ProgressBar';
import FileDropzone from '../components/upload/FileDropzone';
import { fmtDate, truncate } from '../utils/formatters';

export default function Upload() {
  const [files, setFiles] = useState([]);
  const [fetchItems, setFetchItems] = useState(5);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadsQuery = useQuery({
    queryKey: ['user-docs-table'],
    queryFn: async () => (await getUserDocuments()).data
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
    }
  });

  const fetchMutation = useMutation({
    mutationFn: () => triggerFetch(Number(fetchItems) || 5),
    onSuccess: () => toast.success('External fetch triggered')
  });

  const rows = useMemo(() => uploadsQuery.data?.documents || [], [uploadsQuery.data]);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="text-xl font-semibold">User Document Upload</h3>
          <p className="text-sm text-textSecondary">Upload internal policies for preprocessing and clause extraction.</p>
          <div className="mt-4">
            <FileDropzone files={files} setFiles={setFiles} />
          </div>
          <div className="mt-4 space-y-2">
            <Button className="w-full" onClick={() => uploadMutation.mutate()} loading={uploadMutation.isPending}>Upload to Backend</Button>
            {uploadMutation.isPending ? <ProgressBar value={uploadProgress} /> : null}
          </div>
        </Card>

        <Card>
          <h3 className="text-xl font-semibold">Fetch External Regulations</h3>
          <div className="mt-4 space-y-3">
            <label className="text-sm font-semibold">max_items</label>
            <input
              value={fetchItems}
              onChange={(e) => setFetchItems(e.target.value)}
              type="number"
              min={1}
              className="min-h-11 w-full rounded-lg border border-borderColor bg-bgSecondary px-3"
            />
            <Button className="w-full" onClick={() => fetchMutation.mutate()} loading={fetchMutation.isPending}>Fetch External Documents</Button>
          </div>
        </Card>
      </section>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-semibold">Recent Uploads</h3>
          <Button variant="secondary" onClick={() => uploadsQuery.refetch()}>Refresh</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-borderColor text-left text-textSecondary">
                <th className="p-2">Filename</th>
                <th className="p-2">Hash</th>
                <th className="p-2">Clause Count</th>
                <th className="p-2">Upload Date</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id || row.hash} className="border-b border-borderColor/60 hover:bg-bgSecondary">
                  <td className="p-2">{truncate(row.title || row.filename || 'Untitled', 48)}</td>
                  <td className="p-2 mono">{truncate(row.hash, 16)}</td>
                  <td className="p-2">{row.clause_count ?? 0}</td>
                  <td className="p-2">{fmtDate(row.created_at)}</td>
                  <td className="p-2">Stored</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
