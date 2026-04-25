import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { retrieveQuery } from '../api/endpoints';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import { truncate } from '../utils/formatters';

const examples = [
  'data privacy obligations',
  'employee termination policy',
  'GDPR compliance requirements'
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
    }
  });

  const payload = retrievalMutation.data || {};
  const primary = payload.top_match || payload.primary_match || payload;
  const related = payload.related_clauses || payload.related || [];

  const canSearch = query.trim().length >= 3;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card>
          <h3 className="text-2xl font-semibold">Semantic Retrieval</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search legal obligation, policy requirement, or regulation clause"
              className="min-h-11 flex-1 rounded-full border border-borderColor bg-bgSecondary px-4"
            />
            <Button disabled={!canSearch} onClick={() => retrievalMutation.mutate(query)} loading={retrievalMutation.isPending}>
              Search
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button key={ex} onClick={() => setQuery(ex)} className="rounded-full border border-borderColor px-3 py-1 text-xs text-textSecondary">
                {ex}
              </button>
            ))}
          </div>
        </Card>

        {primary?.text || primary?.clause ? (
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-lg font-semibold">Top Match</h4>
              <Badge value="Top Match" tone="success" />
            </div>
            <p className="text-sm">{primary.text || primary.clause}</p>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-textMuted">Similarity score</p>
              <ProgressBar value={(primary.similarity || primary.score || 0) * 100} color="var(--accent-primary)" />
            </div>
          </Card>
        ) : (
          <Card className="text-center text-textSecondary">
            <p>Run a semantic search to view top match and related clauses.</p>
          </Card>
        )}

        {!!related.length && (
          <Card>
            <h4 className="text-lg font-semibold">Related Clauses</h4>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {related.map((item, idx) => (
                <article key={`${idx}-${item.text || item.clause}`} className="rounded-lg border border-borderColor p-3 text-sm">
                  <p>{truncate(item.text || item.clause || '-', 140)}</p>
                  <p className="mt-2 text-xs text-textMuted">SIMILAR_TO | Score {(item.similarity || item.score || 0).toFixed(3)}</p>
                </article>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Card>
        <h4 className="text-lg font-semibold">Search History</h4>
        <ul className="mt-3 space-y-2">
          {history.map((item) => (
            <li key={item}>
              <button onClick={() => { setQuery(item); retrievalMutation.mutate(item); }} className="w-full rounded-lg border border-borderColor px-3 py-2 text-left text-sm hover:bg-bgSecondary">
                {item}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
