import Button from '../ui/Button';

export default function GraphControls({
  filters,
  setFilters,
  onBuildGraph,
  onBuildSimilarity,
  onRefresh,
  onTestNeo4j,
  controls,
  latestJob
}) {
  return (
    <aside
      className="w-full space-y-4 p-4 lg:w-80"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-card)'
      }}
    >
      <div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Graph Controls</h3>
        <p className="text-sm text-[var(--text-secondary)]">Filter node and edge visibility.</p>
      </div>

      <div className="space-y-2 text-sm">
        {Object.keys(filters).map((key) => (
          <label
            key={key}
            className="flex items-center justify-between rounded-lg p-2"
            style={{
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)'
            }}
          >
            <span className="capitalize text-[var(--text-secondary)]">{key.replace(/([A-Z])/g, ' $1')}</span>
            <input
              type="checkbox"
              checked={filters[key]}
              onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.checked }))}
            />
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={controls.fitView}>Fit</Button>
        <Button variant="secondary" onClick={controls.zoomIn}>Zoom +</Button>
        <Button variant="secondary" onClick={controls.zoomOut}>Zoom -</Button>
        <Button variant="secondary" onClick={onRefresh}>Refresh</Button>
      </div>

      {latestJob ? (
        <div
          className="space-y-1 rounded-lg p-3 text-sm"
          style={{
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)'
          }}
        >
          <div className="font-semibold text-[var(--text-primary)]">{latestJob.kind}</div>
          <div className="text-[var(--text-secondary)]">{latestJob.step}</div>
          <div className="text-xs text-[var(--text-muted)]">
            {latestJob.status} | {latestJob.progress ?? 0}%
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Button className="w-full" onClick={onBuildGraph}>Build Graph</Button>
        <Button className="w-full" variant="secondary" onClick={onBuildSimilarity}>Build Similarity</Button>
        <Button className="w-full" variant="secondary" onClick={onTestNeo4j}>Test Neo4j</Button>
      </div>
    </aside>
  );
}
