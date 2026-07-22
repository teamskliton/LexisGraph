import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, PlugZap, Server, Settings as SettingsIcon, ShieldCheck, Trash2 } from 'lucide-react';

import { testNeo4j, getHealth, testMongo } from '../api/endpoints';
import { getApiBaseUrl, setApiBaseUrl } from '../api/axios';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

function ResultPanel({ value }) {
  return (
    <pre className="mt-3 max-h-48 overflow-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-card-hover)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
      {value}
    </pre>
  );
}

export default function SettingsPage() {
  const [backendUrl, setBackendUrl] = useState(() => getApiBaseUrl().replace(/\/api\/v1$/, ''));
  const [backendResult, setBackendResult] = useState('Not tested');
  const [neo4jResult, setNeo4jResult] = useState('Not tested');
  const [mongoResult, setMongoResult] = useState('Not tested');
  const queryClient = useQueryClient();

  const healthMutation = useMutation({
    mutationFn: async () => {
      setApiBaseUrl(backendUrl);
      return getHealth();
    },
    onSuccess: ({ data }) => setBackendResult(JSON.stringify(data, null, 2)),
    onError: (error) => setBackendResult(error?.message || 'Backend connection failed'),
  });

  const neo4jMutation = useMutation({
    mutationFn: testNeo4j,
    onSuccess: ({ data }) => setNeo4jResult(JSON.stringify(data, null, 2)),
    onError: (error) => setNeo4jResult(error?.message || 'Neo4j connection failed'),
  });

  const mongoMutation = useMutation({
    mutationFn: testMongo,
    onSuccess: ({ data }) => setMongoResult(JSON.stringify(data, null, 2)),
    onError: (error) => setMongoResult(error?.message || 'MongoDB connection failed'),
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="data-label">Workspace</p>
        <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Settings</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
          Manage local frontend connection settings and verify backend services used by LexisGraph.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card className="p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[var(--accent-blue)]">
                <Server size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Backend Connection</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Set the API host used by the frontend session.</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} className="form-input min-w-0 flex-1" />
                  <Button onClick={() => healthMutation.mutate()} loading={healthMutation.isPending}>Retest</Button>
                </div>
                <ResultPanel value={backendResult} />
              </div>
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-600">
                  <Database size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Neo4j AuraDB</h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">Verify graph database connectivity.</p>
                  <Button className="mt-4" onClick={() => neo4jMutation.mutate()} loading={neo4jMutation.isPending}>Test Neo4j</Button>
                  <ResultPanel value={neo4jResult} />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <PlugZap size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">MongoDB</h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">Verify document storage connectivity.</p>
                  <Button className="mt-4" onClick={() => mongoMutation.mutate()} loading={mongoMutation.isPending}>Test MongoDB</Button>
                  <ResultPanel value={mongoResult} />
                </div>
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-5">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                  <SettingsIcon size={18} />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Appearance</h3>
                  <p className="text-sm text-[var(--text-secondary)]">Light theme</p>
                </div>
              </div>
              <Badge value="Locked" tone="success" />
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
              LexisGraph uses a consistent light interface optimized for document review, graph exploration, and compliance workflows.
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
                <ShieldCheck size={18} />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Compliance Threshold</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Current threshold: <strong>0.65</strong></p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">Read-only. The frontend does not modify backend scoring logic.</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Local Cache</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Clear cached frontend query data for this browser session.</p>
            <Button className="mt-4" variant="danger" onClick={() => queryClient.clear()}>
              <Trash2 size={16} /> Clear local cache
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
