import { statusTone } from '../../utils/formatters';

export default function Badge({ value, tone }) {
  const semantic = tone || statusTone(value);
  const map = {
    success: 'border-l-4 border-accentSecondary bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    danger: 'border-l-4 border-accentDanger bg-red-500/10 text-red-600 dark:text-red-400',
    warning: 'border-l-4 border-accentWarning bg-amber-500/10 text-amber-700 dark:text-amber-400'
  };
  const pulse = semantic === 'danger' ? 'animate-[gapPulse_1.4s_ease-in-out_infinite]' : '';
  return (
    <span className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-bold uppercase tracking-wide ${map[semantic]} ${pulse}`}>
      {value}
    </span>
  );
}
