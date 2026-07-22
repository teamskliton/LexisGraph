import { statusTone } from '../../utils/formatters';

export default function Badge({ value, tone }) {
  const semantic = tone || statusTone(value);
  const map = {
    success: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    danger: 'border border-red-200 bg-red-50 text-red-700',
    warning: 'border border-amber-200 bg-amber-50 text-amber-700'
  };
  const pulse = semantic === 'danger' ? 'animate-[gapPulse_1.4s_ease-in-out_infinite]' : '';
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${map[semantic]} ${pulse}`}>
      {value}
    </span>
  );
}
