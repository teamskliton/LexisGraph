import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

function GraphViewportController({ revision, focusNodeId }) {
  const reactFlow = useReactFlow();

  useEffect(() => {
    reactFlow.fitView({ duration: 240, padding: 0.14, includeHiddenNodes: false });
  }, [reactFlow, revision]);

  useEffect(() => {
    if (!focusNodeId) {
      return;
    }
    const node = reactFlow.getNode(focusNodeId);
    if (!node?.positionAbsolute) {
      return;
    }
    reactFlow.setCenter(
      node.positionAbsolute.x + 80,
      node.positionAbsolute.y + 50,
      { duration: 220, zoom: Math.max(reactFlow.getZoom(), 0.95) }
    );
  }, [reactFlow, focusNodeId]);

  return null;
}

export default function KnowledgeGraph({
  nodes,
  edges,
  onNodeClick,
  onInit,
  nodeTypes,
  revision,
  focusNodeId,
}) {
  const containerRef = useRef(null);
  const [height, setHeight] = useState(620);
  const minimapStyle = useMemo(() => ({ backgroundColor: '#ffffff' }), []);
  const showMiniMap = nodes.length <= 120;

  useEffect(() => {
    const updateHeight = () => {
      const width = containerRef.current?.clientWidth || 1200;
      setHeight(width < 1024 ? 520 : 620);
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-[28px] border border-[var(--border-default)] bg-white"
      style={{
        height,
        boxShadow: '0 18px 50px rgba(15, 23, 42, 0.07)',
        background: 'radial-gradient(circle at 10% 10%, rgba(59, 130, 246, 0.06), transparent 18%), radial-gradient(circle at 92% 88%, rgba(16, 185, 129, 0.05), transparent 18%), #ffffff'
      }}
    >
      <ReactFlow
        onInit={onInit}
        nodes={nodes}
        edges={edges}
        onNodeClick={(_, node) => onNodeClick(node)}
        nodeTypes={nodeTypes}
        fitView={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        selectionOnDrag={false}
        zoomOnDoubleClick={false}
        panOnDrag
        onlyRenderVisibleElements
        elevateEdgesOnSelect={false}
        minZoom={0.45}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <GraphViewportController revision={revision} focusNodeId={focusNodeId} />
        <Background color="rgba(148, 163, 184, 0.16)" gap={28} />
        {showMiniMap ? <MiniMap style={minimapStyle} zoomable pannable /> : null}
        <Controls showInteractive={false} position="top-left" />
      </ReactFlow>
    </div>
  );
}
