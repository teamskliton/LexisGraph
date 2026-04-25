import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import dagre from 'dagre';
import toast from 'react-hot-toast';

import { getUserDocuments, getExternalDocuments, runComplianceCheck, buildGraph, buildSimilarity, testNeo4j } from '../api/endpoints';
import KnowledgeGraph from '../components/graph/KnowledgeGraph';
import GraphControls from '../components/graph/GraphControls';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';

function layoutGraph(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR' });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => g.setNode(node.id, { width: 180, height: 50 }));
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  dagre.layout(g);

  return nodes.map((node) => {
    const p = g.node(node.id);
    return { ...node, position: { x: p?.x || 0, y: p?.y || 0 } };
  });
}

export default function GraphExplorer() {
  const [filters, setFilters] = useState({
    userDocs: true,
    externalDocs: true,
    compliantClauses: true,
    gapClauses: true
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [neo4jResult, setNeo4jResult] = useState(null);
  const [rfInstance, setRfInstance] = useState(null);

  const userDocsQuery = useQuery({ queryKey: ['graph-user'], queryFn: async () => (await getUserDocuments()).data });
  const extDocsQuery = useQuery({ queryKey: ['graph-ext'], queryFn: async () => (await getExternalDocuments()).data });
  const complianceQuery = useQuery({ queryKey: ['graph-compliance'], queryFn: async () => (await runComplianceCheck()).data });

  const buildGraphMutation = useMutation({
    mutationFn: buildGraph,
    onSuccess: () => toast.success('Graph build started'),
    onError: (error) => {
      const detail = String(error?.response?.data?.detail || '');
      if (detail.includes('7687') || detail.toLowerCase().includes('couldn\'t connect')) {
        toast.error('Neo4j is unreachable. Start Neo4j or fix NEO4J_URI/credentials.', {
          duration: 6000
        });
      }
    }
  });
  const buildSimilarityMutation = useMutation({ mutationFn: buildSimilarity, onSuccess: () => toast.success('Similarity build started') });
  const neo4jMutation = useMutation({
    mutationFn: testNeo4j,
    onSuccess: ({ data }) => setNeo4jResult(data)
  });

  const graph = useMemo(() => {
    const userDocs = userDocsQuery.data?.documents || [];
    const extDocs = extDocsQuery.data?.documents || [];
    const compliance = Array.isArray(complianceQuery.data)
      ? complianceQuery.data
      : complianceQuery.data?.results || complianceQuery.data?.compliance_results || [];

    if (!userDocs.length && !extDocs.length) return { nodes: [], edges: [] };

    const nodes = [];
    const edges = [];

    userDocs.forEach((doc, idx) => {
      if (!filters.userDocs) return;
      const id = `user-${doc.id || idx}`;
      nodes.push({ id, data: { label: doc.title || 'User Document', ...doc, nodeType: 'document' }, style: { background: '#1A4FBA', color: '#fff', borderRadius: 10 } });
      (compliance || []).slice(0, 4).forEach((clause, cIdx) => {
        const status = String(clause.status || '').toLowerCase();
        if (status === 'compliant' && !filters.compliantClauses) return;
        if (status === 'gap' && !filters.gapClauses) return;
        const clauseId = `clause-${id}-${cIdx}`;
        nodes.push({ id: clauseId, data: { label: `Clause ${cIdx + 1}`, ...clause, nodeType: 'clause' }, style: { background: status === 'gap' ? '#DC2626' : '#0D9488', color: '#fff', borderRadius: 9999, width: 64, height: 64, display: 'grid', placeItems: 'center' } });
        edges.push({ id: `edge-${id}-${clauseId}`, source: id, target: clauseId, label: 'HAS_CLAUSE', style: { stroke: '#64748b' } });
      });
    });

    extDocs.forEach((doc, idx) => {
      if (!filters.externalDocs) return;
      const id = `external-${doc.id || idx}`;
      nodes.push({ id, data: { label: doc.title || 'External Document', ...doc, nodeType: 'document' }, style: { background: '#0D9488', color: '#fff', borderRadius: 10 } });
    });

    if (nodes.length >= 2) {
      for (let i = 0; i < Math.min(6, nodes.length - 1); i += 1) {
        edges.push({
          id: `sim-${i}`,
          source: nodes[i].id,
          target: nodes[i + 1].id,
          label: 'SIMILAR_TO',
          style: { strokeDasharray: '6 4', stroke: '#a78bfa' },
          animated: true
        });
      }
    }

    return { nodes: layoutGraph(nodes, edges), edges };
  }, [userDocsQuery.data, extDocsQuery.data, complianceQuery.data, filters]);

  const controls = {
    fitView: () => rfInstance?.fitView({ duration: 300 }),
    zoomIn: () => rfInstance?.zoomIn({ duration: 200 }),
    zoomOut: () => rfInstance?.zoomOut({ duration: 200 })
  };

  const isEmpty = !graph.nodes.length;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div>
        {isEmpty ? (
          <Card className="flex h-[72vh] items-center justify-center text-center text-textSecondary">
            <div>
              <h3 className="text-2xl font-semibold">No graph data yet</h3>
              <p className="mt-2">Upload documents and run Build Graph to populate Neo4j.</p>
            </div>
          </Card>
        ) : (
          <KnowledgeGraph
            initialNodes={graph.nodes}
            initialEdges={graph.edges}
            onNodeClick={setSelectedNode}
            onInit={setRfInstance}
          />
        )}
      </div>

      <GraphControls
        filters={filters}
        setFilters={setFilters}
        onBuildGraph={() => buildGraphMutation.mutate()}
        onBuildSimilarity={() => buildSimilarityMutation.mutate()}
        onTestNeo4j={() => neo4jMutation.mutate()}
        controls={controls}
      />

      <Modal open={Boolean(selectedNode)} title="Node Details" onClose={() => setSelectedNode(null)}>
        <pre className="overflow-auto rounded-lg bg-bgSecondary p-3 text-xs">{JSON.stringify(selectedNode?.data || {}, null, 2)}</pre>
      </Modal>

      <Modal open={Boolean(neo4jResult)} title="Neo4j Test Result" onClose={() => setNeo4jResult(null)}>
        <pre className="overflow-auto rounded-lg bg-bgSecondary p-3 text-xs">{JSON.stringify(neo4jResult || {}, null, 2)}</pre>
      </Modal>
    </div>
  );
}
