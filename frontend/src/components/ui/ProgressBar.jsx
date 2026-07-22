export default function ProgressBar({ value = 0, color = 'var(--accent-blue)' }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}
