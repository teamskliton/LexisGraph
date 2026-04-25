import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import ProgressBar from '../ui/ProgressBar';
import { fmtPercent, truncate } from '../../utils/formatters';

export default function ComplianceCard({ item, index, onDetails }) {
  const [expanded, setExpanded] = useState(false);
  const confidence = Number(item.confidence || 0);
  const barColor = confidence > 0.8 ? 'var(--accent-secondary)' : confidence >= 0.65 ? 'var(--accent-warning)' : 'var(--accent-danger)';

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed">{index + 1}. {truncate(item.policy_clause || item.clause || '', 180)}</p>
        <Badge value={item.status || 'unknown'} />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-textMuted">
          <span>Confidence</span>
          <span className="mono">{fmtPercent(confidence)}</span>
        </div>
        <ProgressBar value={confidence * 100} color={barColor} />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-borderColor px-2 py-1">Vector: {(item.vector_score ?? 0).toFixed(3)}</span>
        <span className="rounded-full border border-borderColor px-2 py-1">Graph: {(item.graph_score ?? 0).toFixed(3)}</span>
      </div>

      <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-accentPrimary">
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Matched external clause
      </button>
      {expanded ? (
        <p className="rounded-lg border border-borderColor bg-bgSecondary p-3 text-sm text-textSecondary">
          {item.matched_clause || 'No matched clause returned'}
        </p>
      ) : null}

      <button onClick={() => onDetails(item)} className="text-xs font-semibold text-accentPrimary">
        Details
      </button>
    </Card>
  );
}
