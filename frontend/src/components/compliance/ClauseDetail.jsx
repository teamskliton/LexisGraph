import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { fmtPercent } from '../../utils/formatters';

export default function ClauseDetail({ open, item, onClose }) {
  if (!item) return null;

  return (
    <Modal open={open} title="Clause Comparison" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold">Policy Clause</h4>
          <Badge value={item.status || 'unknown'} />
        </div>
        <p className="rounded-lg border border-borderColor p-3">{item.policy_clause || item.clause || '-'}</p>
        <h4 className="text-lg font-semibold">Matched External Clause</h4>
        <p className="rounded-lg border border-borderColor p-3">{item.matched_clause || '-'}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-borderColor p-3">Confidence: {fmtPercent(item.confidence || 0)}</div>
          <div className="rounded-lg border border-borderColor p-3">Vector: {(item.vector_score || 0).toFixed(4)}</div>
          <div className="rounded-lg border border-borderColor p-3">Graph: {(item.graph_score || 0).toFixed(4)}</div>
        </div>
      </div>
    </Modal>
  );
}
