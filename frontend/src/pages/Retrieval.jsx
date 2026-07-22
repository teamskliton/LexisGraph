import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Clock, Search, Sparkles } from 'lucide-react';

import { retrieveQuery } from '../api/endpoints';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import { truncate } from '../utils/formatters';

const examples = [
  'data privacy obligations',
  'employee termination policy',
  'GDPR compliance requirements',
];

const HISTORY_KEY = 'lexisgraph-search-history';

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function Retrieval() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState(loadHistory);

  const retrievalMutation = useMutation({
    mutationFn: async (q) => {
      const { data } = await retrieveQuery(q);
      return data;
    },
    onSuccess: (_, q) => {
      const updated = [q, ...history.filter((item) => item !== q)].slice(0, 10);
      setHistory(updated);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    },
  });

  useEffect(() => {
    const incoming = searchParams.get('q');
    if (!incoming || incoming === query) return;
    setQuery(incoming);
    retrievalMutation.mutate(incoming);
  }, [searchParams]);

  const payload = retrievalMutation.data || {};
  const results = Array.isArray(payload.results) ? payload.results : [];
  const primary = results[0] || null;
  const related = Array.isArray(primary?.related_clauses) ? primary.related_clauses : [];
  const canSearch = query.trim().length >= 3;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="data-label">GraphRAG retrieval</p>
              <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Semantic Retrieval</h2>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
                Search across processed policy and regulation clauses using the existing retrieval endpoint.
              </p>
            </div>
            <Badge value={retrievalMutation.isPending ? 'Searching' : 'Ready'} tone={retrievalMutation.isPending ? 'warning' : 'success'} />
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-[20px] border border-[var(--border-default)] bg-white px-5 shadow-sm transition focus-within:border-[var(--border-accent)] focus-within:shadow-[0_0_0_4px_var(--accent-blue-glow)]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--text-muted)]">
                <Search size={18} />
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canSearch) retrievalMutation.mutate(query);
                }}
                placeholder="Search legal obligation, policy requirement, or regulation clause"
                className="h-16 min-w-0 flex-1 border-0 bg-transparent pr-1 text-lg text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>
            <Button className="h-16 rounded-[20px] px-6 text-base" disabled={!canSearch} onClick={() => retrievalMutation.mutate(query)} loading={retrievalMutation.isPending}>
              <Sparkles size={16} /> Search
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className="rounded-full border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]"
              >
                {example}
              </button>
            ))}
          </div>
        </Card>

        {primary?.query_match ? (
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="data-label">Top result</p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Closest Clause Match</h3>
              </div>
              <Badge value="Top Match" tone="success" />
            </div>
            <p className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card-hover)] p-4 text-sm leading-7 text-[var(--text-primary)]">
              {primary.query_match}
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <span>Similarity score</span>
                <span>{Math.round(Number(primary.similarity_score || 0) * 100)}%</span>
              </div>
              <ProgressBar value={Number(primary.similarity_score || 0) * 100} color="var(--accent-blue)" />
            </div>
          </Card>
        ) : (
          <Card className="grid min-h-[220px] place-items-center text-center text-[var(--text-secondary)]">
            <div>
              <Search className="mx-auto mb-3 text-[var(--text-muted)]" size={30} />
              <p className="font-semibold text-[var(--text-primary)]">No retrieval run yet</p>
              <p className="mt-1 text-sm">Run a semantic search to view the top match and related clauses.</p>
            </div>
          </Card>
        )}

        {!!related.length && (
          <Card className="p-6">
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">Related Clauses</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {related.map((item, index) => (
                <article key={`${index}-${item}`} className="rounded-2xl border border-[var(--border-default)] bg-white p-4 text-sm leading-6">
                  <p>{truncate(item || '-', 160)}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">SIMILAR_TO neighbor</p>
                </article>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Card className="h-fit p-6">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-[var(--text-muted)]" />
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Search History</h3>
        </div>
        <div className="mt-4 space-y-2">
          {history.length ? history.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setQuery(item);
                retrievalMutation.mutate(item);
              }}
              className="w-full rounded-xl border border-[var(--border-default)] bg-white px-3 py-2.5 text-left text-sm text-[var(--text-secondary)] transition hover:border-[var(--border-accent)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              {item}
            </button>
          )) : (
            <p className="text-sm text-[var(--text-muted)]">Previous semantic searches will appear here.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
