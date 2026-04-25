import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { testNeo4j, getHealth, testMongo } from '../api/endpoints';
import { getApiBaseUrl, setApiBaseUrl } from '../api/axios';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useTheme } from '../hooks/useTheme';

export default function SettingsPage() {
  const [backendUrl, setBackendUrl] = useState(() => getApiBaseUrl().replace(/\/api\/v1$/, ''));
  const [neo4jResult, setNeo4jResult] = useState('Not tested');
  const [mongoResult, setMongoResult] = useState('Not tested');
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  const healthMutation = useMutation({
    mutationFn: async () => {
      setApiBaseUrl(backendUrl);
      return getHealth();
    },
    onSuccess: () => setMongoResult('Backend connected')
  });

  const neo4jMutation = useMutation({
    mutationFn: testNeo4j,
    onSuccess: ({ data }) => setNeo4jResult(JSON.stringify(data))
  });

  const mongoMutation = useMutation({
    mutationFn: testMongo,
    onSuccess: ({ data }) => setMongoResult(JSON.stringify(data))
  });

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-xl font-semibold">Backend URL</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} className="min-h-11 flex-1 rounded-lg border border-borderColor bg-bgSecondary px-3" />
          <Button onClick={() => healthMutation.mutate()} loading={healthMutation.isPending}>Retest</Button>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="text-xl font-semibold">Theme</h3>
          <div className="mt-3 inline-flex overflow-hidden rounded-lg border border-borderColor">
            {['light', 'dark', 'system'].map((mode) => (
              <button key={mode} className={`min-h-11 px-4 text-sm font-semibold capitalize ${theme === mode ? 'bg-accentPrimary text-white' : ''}`} onClick={() => setTheme(mode)}>
                {mode}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-xl font-semibold">Graph Visualization</h3>
          <div className="mt-3 space-y-2 text-sm text-textSecondary">
            <p>Node size: Medium</p>
            <p>Edge visibility: Enabled</p>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="text-xl font-semibold">Compliance Threshold</h3>
        <p className="mt-2 text-sm text-textSecondary">Current threshold: <strong>0.65</strong> (read-only)</p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="text-xl font-semibold">Neo4j Connection</h3>
          <Button className="mt-3" onClick={() => neo4jMutation.mutate()} loading={neo4jMutation.isPending}>Test Neo4j</Button>
          <pre className="mt-3 overflow-auto rounded-lg bg-bgSecondary p-3 text-xs">{neo4jResult}</pre>
        </Card>

        <Card>
          <h3 className="text-xl font-semibold">MongoDB Connection</h3>
          <Button className="mt-3" onClick={() => mongoMutation.mutate()} loading={mongoMutation.isPending}>Test Mongo</Button>
          <pre className="mt-3 overflow-auto rounded-lg bg-bgSecondary p-3 text-xs">{mongoResult}</pre>
        </Card>
      </div>

      <Card>
        <h3 className="text-xl font-semibold">Cache Management</h3>
        <Button className="mt-3" variant="danger" onClick={() => queryClient.clear()}>Clear local cache</Button>
      </Card>
    </div>
  );
}
