import Button from '../ui/Button';

export default function GraphControls({ filters, setFilters, onBuildGraph, onBuildSimilarity, onTestNeo4j, controls }) {
  return (
    <aside className="card w-full space-y-4 p-4 lg:w-80">
      <div>
        <h3 className="text-lg font-semibold">Graph Controls</h3>
        <p className="text-sm text-textSecondary">Filter node and edge visibility.</p>
      </div>

      <div className="space-y-2 text-sm">
        {Object.keys(filters).map((key) => (
          <label key={key} className="flex items-center justify-between rounded-lg border border-borderColor p-2">
            <span>{key}</span>
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
      </div>

      <div className="space-y-2">
        <Button className="w-full" onClick={onBuildGraph}>Build Graph</Button>
        <Button className="w-full" variant="secondary" onClick={onBuildSimilarity}>Build Similarity</Button>
        <Button className="w-full" variant="secondary" onClick={onTestNeo4j}>Test Neo4j</Button>
      </div>
    </aside>
  );
}
