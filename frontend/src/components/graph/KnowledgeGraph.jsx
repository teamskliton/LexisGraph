import { useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export default function KnowledgeGraph({ initialNodes, initialEdges, onNodeClick, onInit }) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const minimapStyle = useMemo(() => ({
    backgroundColor: '#020617'
  }), []);

  return (
    <div className="h-[72vh] w-full overflow-hidden rounded-xl border border-borderColor bg-slate-950">
      <ReactFlow
        onInit={onInit}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onNodeClick(node)}
        fitView
      >
        <Background color="#334155" gap={18} />
        <MiniMap style={minimapStyle} zoomable pannable />
        <Controls />
      </ReactFlow>
    </div>
  );
}
