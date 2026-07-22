import { memo, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Handle } from '@xyflow/react';
import toast from 'react-hot-toast';
import {
  BookCopy,
  CircleDot,
  Database,
  FileText,
  History,
  LocateFixed,
  Maximize,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

import {
  activateKnowledgeGraph,
  buildKnowledgeGraph,
  deleteKnowledgeGraph,
  getGraphClauseView,
  getGraphDocumentView,
  getGraphDocuments,
  getGraphRegulationView,
  getGraphRoot,
  getKnowledgeGraphHistory,
} from '../api/endpoints';
import KnowledgeGraph from '../components/graph/KnowledgeGraph';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';

const EMPTY_ROOT = {
  status: 'ok',
  nodes: [],
  edges: [],
  metadata: {
    build_id: null,
    created_at: null,
    active: false,
    user_document: null,
    domain_documents: [],
    graph_summary: {
      total_nodes: 0,
      total_relationships: 0,
      policy_clauses: 0,
      regulation_clauses: 0,
      domain_documents: 0,
      entities: 0,
      user_documents: 0,
      matches: 0,
      partial_matches: 0,
      missing: 0,
    },
    limits: {
      policy_clauses: 30,
      regulation_matches_per_clause: 3,
      entities: 5,
    },
  },
};

const edgePalette = {
  HAS_CLAUSE: { stroke: '#2e9e44', width: 1.8, dash: undefined, label: 'HAS_CLAUSE' },
  MATCH: { stroke: '#16a34a', width: 2.1, dash: '5,4', label: 'MATCH' },
  PARTIAL_MATCH: { stroke: '#f59e0b', width: 2.1, dash: '5,4', label: 'PARTIAL_MATCH' },
  MISSING: { stroke: '#ef4444', width: 2.1, dash: '5,4', label: 'MISSING' },
  BELONGS_TO: { stroke: '#64748b', width: 1.8, dash: undefined, label: 'BELONGS_TO' },
  HAS_ENTITY: { stroke: '#7c3aed', width: 1.8, dash: '4,4', label: 'HAS_ENTITY' },
};

const nodePalette = {
  UserDocument: {
    border: '#45a65f',
    bg: '#effcf3',
    label: '#1f7a35',
    iconBg: '#2f9e44',
    icon: FileText,
    size: 140,
  },
  PolicyClause: {
    border: '#63b96f',
    bg: '#f2fbf4',
    label: '#226c34',
    iconBg: '#2f9e44',
    icon: FileText,
    size: 112,
  },
  RegulationClause: {
    border: '#4f8df7',
    bg: '#f3f8ff',
    label: '#1f57c3',
    iconBg: '#2563eb',
    icon: BookCopy,
    size: 112,
  },
  DomainDocument: {
    border: '#b58bf3',
    bg: '#f7f1ff',
    label: '#7e4fd3',
    iconBg: '#8b5cf6',
    icon: Database,
    size: 116,
  },
  Entity: {
    border: '#f4a737',
    bg: '#fff7eb',
    label: '#b25f00',
    iconBg: '#f59e0b',
    icon: CircleDot,
    size: 98,
  },
};

function formatTimestamp(value) {
  if (!value) {
    return 'No build selected';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function relationStatusLabel(kind) {
  if (kind === 'MATCH') return 'Match';
  if (kind === 'PARTIAL_MATCH') return 'Partial Match';
  if (kind === 'MISSING') return 'Missing';
  return kind;
}

function normalizePayload(payload) {
  const nodesById = {};
  const edgesById = {};
  (payload.nodes || []).forEach((node) => {
    nodesById[node.id] = node;
  });
  (payload.edges || []).forEach((edge) => {
    edgesById[edge.id] = edge;
  });
  return { nodesById, edgesById, metadata: payload.metadata || EMPTY_ROOT.metadata };
}

function mergePayload(current, payload) {
  const nextNodes = { ...current.nodesById };
  const nextEdges = { ...current.edgesById };
  (payload.nodes || []).forEach((node) => {
    nextNodes[node.id] = node;
  });
  (payload.edges || []).forEach((edge) => {
    nextEdges[edge.id] = edge;
  });
  return {
    nodesById: nextNodes,
    edgesById: nextEdges,
    metadata: payload.metadata || current.metadata,
  };
}

function computeOffsets(count, gap = 58) {
  if (count <= 1) return [0];
  const center = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => (index - center) * gap);
}

function withMinGap(items, minimumGap = 110) {
  if (!items.length) return {};
  const sorted = [...items].sort((left, right) => left.y - right.y);
  const positions = {};
  let currentY = sorted[0].y;
  positions[sorted[0].id] = currentY;
  for (let index = 1; index < sorted.length; index += 1) {
    currentY = Math.max(sorted[index].y, currentY + minimumGap);
    positions[sorted[index].id] = currentY;
  }
  return positions;
}

function average(values, fallback = 240) {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildLayeredLayout(nodes, edges) {
  const edgeLookupByTarget = edges.reduce((accumulator, edge) => {
    accumulator[edge.target] = accumulator[edge.target] || [];
    accumulator[edge.target].push(edge);
    return accumulator;
  }, {});
  const edgeLookupBySource = edges.reduce((accumulator, edge) => {
    accumulator[edge.source] = accumulator[edge.source] || [];
    accumulator[edge.source].push(edge);
    return accumulator;
  }, {});
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const positions = {};

  const userDocs = nodes.filter((node) => node.data.kind === 'UserDocument');
  const policyClauses = nodes
    .filter((node) => node.data.kind === 'PolicyClause')
    .sort((left, right) => (left.data.source_id || left.data.short_label || left.id).localeCompare(right.data.source_id || right.data.short_label || right.id));
  const regulationClauses = nodes.filter((node) => node.data.kind === 'RegulationClause');
  const domainDocs = nodes.filter((node) => node.data.kind === 'DomainDocument');
  const entities = nodes.filter((node) => node.data.kind === 'Entity');

  const baseTop = 90;
  const policyGap = 128;
  policyClauses.forEach((node, index) => {
    positions[node.id] = { x: 360, y: baseTop + index * policyGap };
  });

  userDocs.forEach((node) => {
    positions[node.id] = { x: 86, y: average(policyClauses.map((policy) => positions[policy.id].y), 260) };
  });

  const regulationAnchors = {};
  policyClauses.forEach((policyNode) => {
    const outgoing = (edgeLookupBySource[policyNode.id] || [])
      .filter((edge) => ['MATCH', 'PARTIAL_MATCH', 'MISSING'].includes(edge.kind))
      .sort((left, right) => (left.rank || 99) - (right.rank || 99));
    const offsets = computeOffsets(outgoing.length, 52);
    outgoing.forEach((edge, index) => {
      regulationAnchors[edge.target] = regulationAnchors[edge.target] || [];
      regulationAnchors[edge.target].push(positions[policyNode.id].y + offsets[index]);
    });
    if (!outgoing.length) {
      regulationAnchors[policyNode.id] = regulationAnchors[policyNode.id] || [];
    }
  });
  const regulationY = withMinGap(
    regulationClauses.map((node) => ({
      id: node.id,
      y: average(regulationAnchors[node.id] || [], 240),
    })),
    96
  );
  regulationClauses.forEach((node) => {
    positions[node.id] = { x: 655, y: regulationY[node.id] ?? 240 };
  });

  const domainY = withMinGap(
    domainDocs.map((node) => {
      const incoming = (edgeLookupByTarget[node.id] || [])
        .filter((edge) => edge.kind === 'BELONGS_TO')
        .map((edge) => positions[edge.source]?.y)
        .filter((value) => typeof value === 'number');
      return { id: node.id, y: average(incoming, 260) };
    }),
    126
  );
  domainDocs.forEach((node) => {
    positions[node.id] = { x: 960, y: domainY[node.id] ?? 260 };
  });

  const entityY = withMinGap(
    entities.map((node) => {
      const incoming = (edgeLookupByTarget[node.id] || [])
        .filter((edge) => edge.kind === 'HAS_ENTITY')
        .map((edge) => positions[edge.source]?.y)
        .filter((value) => typeof value === 'number');
      return { id: node.id, y: average(incoming, 260) };
    }),
    112
  );
  entities.forEach((node) => {
    positions[node.id] = { x: 1235, y: entityY[node.id] ?? 260 };
  });

  return nodes.map((node) => {
    const palette = nodePalette[node.data.kind] || nodePalette.Entity;
    const x = positions[node.id]?.x ?? 240;
    const y = positions[node.id]?.y ?? 240;
    return {
      ...node,
      position: { x, y },
      data: { ...node.data, size: palette.size },
    };
  });
}

const graphNodeTypes = {
  graphNode: memo(function GraphNode({ data }) {
    const palette = nodePalette[data.kind] || nodePalette.Entity;
    const Icon = palette.icon;
    const isSelected = Boolean(data.isSelected);
    const size = data.size || palette.size;
    const ring = isSelected ? '0 0 0 4px rgba(37, 99, 235, 0.18), 0 16px 32px rgba(15, 23, 42, 0.12)' : '0 10px 24px rgba(15, 23, 42, 0.08)';

    return (
      <div
        style={{
          width: size,
          minHeight: size,
          borderRadius: 999,
          border: `1.5px solid ${isSelected ? '#2563eb' : palette.border}`,
          background: palette.bg,
          boxShadow: ring,
          padding: size > 120 ? '18px 16px' : '14px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <Handle type="target" position="left" style={{ width: 8, height: 8, background: palette.border, border: 'none' }} />
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: palette.iconBg,
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
          }}
        >
          <Icon size={14} />
        </div>
        <div style={{ color: palette.label, fontSize: 11, fontWeight: 700, lineHeight: 1.15 }}>
          {data.short_label || data.source_id || data.label}
        </div>
        <div style={{ color: '#0f1729', fontSize: 10.5, fontWeight: 500, lineHeight: 1.28, marginTop: 5, maxWidth: size - 28 }}>
          {data.label}
        </div>
        <Handle type="source" position="right" style={{ width: 8, height: 8, background: palette.border, border: 'none' }} />
      </div>
    );
  }),
};

export default function GraphExplorer() {
  const queryClient = useQueryClient();
  const [userDocumentId, setUserDocumentId] = useState(() => sessionStorage.getItem('kg-user-document-id') || '');
  const [domainDocumentIds, setDomainDocumentIds] = useState(() => JSON.parse(sessionStorage.getItem('kg-domain-document-ids') || '[]'));
  const [viewBuildId, setViewBuildId] = useState(null);
  const [graphRevision, setGraphRevision] = useState(0);
  const [graphState, setGraphState] = useState(() => normalizePayload(EMPTY_ROOT));
  const [expandedDocuments, setExpandedDocuments] = useState({});
  const [expandedClauses, setExpandedClauses] = useState({});
  const [expandedRegulations, setExpandedRegulations] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedClauseDetails, setSelectedClauseDetails] = useState(null);
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [flow, setFlow] = useState(null);
  const [graphStatus, setGraphStatus] = useState('');
  const [expandingAll, setExpandingAll] = useState(false);

  const documentsQuery = useQuery({
    queryKey: ['graph-documents'],
    queryFn: async () => (await getGraphDocuments()).data,
  });
  const historyQuery = useQuery({
    queryKey: ['knowledge-graph-history'],
    queryFn: async () => (await getKnowledgeGraphHistory()).data,
  });
  const rootQuery = useQuery({
    queryKey: ['graph-root', viewBuildId],
    retry: false,
    queryFn: async () => {
      try {
        return (await getGraphRoot(viewBuildId ? { build_id: viewBuildId } : {})).data;
      } catch (error) {
        if (error?.response?.status === 404) {
          return EMPTY_ROOT;
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    if (!rootQuery.data) return;
    setGraphState(normalizePayload(rootQuery.data));
    setExpandedDocuments({});
    setExpandedClauses({});
    setExpandedRegulations({});
    setSelectedNode(null);
    setSelectedClauseDetails(null);
    setFocusNodeId(null);
    setGraphRevision((current) => current + 1);
  }, [rootQuery.data]);

  const buildMutation = useMutation({
    mutationFn: buildKnowledgeGraph,
    onSuccess: async (response) => {
      sessionStorage.setItem('kg-user-document-id', userDocumentId);
      sessionStorage.setItem('kg-domain-document-ids', JSON.stringify(domainDocumentIds));
      setViewBuildId(response.data.metadata?.build_id || null);
      setGraphStatus('Graph generated successfully');
      toast.success('Knowledge graph generated');
      await queryClient.invalidateQueries({ queryKey: ['knowledge-graph-history'] });
      await queryClient.invalidateQueries({ queryKey: ['graph-root'] });
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Could not build the knowledge graph'),
  });

  const activateMutation = useMutation({
    mutationFn: activateKnowledgeGraph,
    onSuccess: async (_, buildId) => {
      setViewBuildId(buildId);
      setGraphStatus('Saved graph restored');
      toast.success('Saved graph opened');
      await queryClient.invalidateQueries({ queryKey: ['knowledge-graph-history'] });
      await queryClient.invalidateQueries({ queryKey: ['graph-root'] });
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Could not open the saved graph'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKnowledgeGraph,
    onSuccess: async (_, buildId) => {
      if (viewBuildId === buildId) {
        setViewBuildId(null);
      }
      toast.success('Saved graph deleted');
      await queryClient.invalidateQueries({ queryKey: ['knowledge-graph-history'] });
      await queryClient.invalidateQueries({ queryKey: ['graph-root'] });
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Could not delete the saved graph'),
  });

  const userDocuments = documentsQuery.data?.user_documents || [];
  const domainDocuments = documentsQuery.data?.domain_documents || [];
  const historyBuilds = historyQuery.data?.builds || [];
  const activeBuild = historyBuilds.find((build) => build.build_id === graphState.metadata.build_id) || null;
  const canBuild = Boolean(userDocumentId) && domainDocumentIds.length > 0 && !buildMutation.isPending;

  const visibleNodes = useMemo(() => Object.values(graphState.nodesById), [graphState.nodesById]);
  const visibleEdges = useMemo(() => Object.values(graphState.edgesById), [graphState.edgesById]);

  const visibleStats = useMemo(() => {
    const documents = visibleNodes.filter((node) => node.kind === 'UserDocument' || node.kind === 'DomainDocument').length;
    const visibleClauses = visibleNodes.filter((node) => node.kind === 'PolicyClause' || node.kind === 'RegulationClause').length;
    const visibleRelationships = visibleEdges.length;
    const matches = visibleEdges.filter((edge) => edge.kind === 'MATCH').length;
    const partialMatches = visibleEdges.filter((edge) => edge.kind === 'PARTIAL_MATCH').length;
    const missing = visibleEdges.filter((edge) => edge.kind === 'MISSING').length;
    return { documents, visibleClauses, visibleRelationships, matches, partialMatches, missing };
  }, [visibleNodes, visibleEdges]);

  const flowGraph = useMemo(() => {
    const nodes = visibleNodes.map((node) => ({
      id: node.id,
      type: 'graphNode',
      data: {
        ...node,
        isSelected: selectedNode?.id === node.id,
      },
    }));
    const edges = visibleEdges.map((edge) => {
      const palette = edgePalette[edge.kind] || edgePalette.HAS_CLAUSE;
      const scoreLabel = edge.kind === 'MATCH' || edge.kind === 'PARTIAL_MATCH' ? ` (${(edge.score || 0).toFixed(2)})` : '';
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        label: `${palette.label}${scoreLabel}`,
        style: {
          stroke: palette.stroke,
          strokeWidth: palette.width,
          strokeDasharray: palette.dash,
        },
        labelStyle: {
          fill: palette.stroke,
          fontSize: 10,
          fontWeight: 700,
        },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
        labelBgPadding: [4, 2],
      };
    });
    return {
      nodes: buildLayeredLayout(nodes, edges),
      edges,
    };
  }, [visibleNodes, visibleEdges, selectedNode]);

  const mergeGraph = (payload) => {
    setGraphState((current) => mergePayload(current, payload));
    setGraphRevision((current) => current + 1);
    return payload;
  };

  const loadDocument = async (documentId) => {
    const payload = await queryClient.fetchQuery({
      queryKey: ['graph-document-view', graphState.metadata.build_id || 'active', documentId],
      queryFn: async () => (await getGraphDocumentView(documentId, { build_id: graphState.metadata.build_id || undefined })).data,
    });
    mergeGraph(payload);
    setExpandedDocuments((current) => ({ ...current, [documentId]: true }));
    return payload;
  };

  const loadClause = async (clauseId) => {
    const payload = await queryClient.fetchQuery({
      queryKey: ['graph-clause-view', graphState.metadata.build_id || 'active', clauseId],
      queryFn: async () => (await getGraphClauseView(clauseId, { build_id: graphState.metadata.build_id || undefined })).data,
    });
    mergeGraph(payload);
    setExpandedClauses((current) => ({ ...current, [clauseId]: true }));
    setSelectedClauseDetails(payload.details || null);
    return payload;
  };

  const loadRegulation = async (regulationId) => {
    const payload = await queryClient.fetchQuery({
      queryKey: ['graph-regulation-view', graphState.metadata.build_id || 'active', regulationId],
      queryFn: async () => (await getGraphRegulationView(regulationId, { build_id: graphState.metadata.build_id || undefined })).data,
    });
    mergeGraph(payload);
    setExpandedRegulations((current) => ({ ...current, [regulationId]: true }));
    return payload;
  };

  const handleNodeClick = async (node) => {
    setSelectedNode(node);
    setFocusNodeId(node.id);
    try {
      if (node.data.kind === 'UserDocument' && !expandedDocuments[node.id]) {
        await loadDocument(node.id);
      }
      if (node.data.kind === 'PolicyClause') {
        await loadClause(node.id);
      }
      if (node.data.kind === 'RegulationClause' && !expandedRegulations[node.id]) {
        await loadRegulation(node.id);
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not expand graph evidence');
    }
  };

  const expandAll = async () => {
    const userDocument = visibleNodes.find((node) => node.kind === 'UserDocument');
    if (!userDocument) return;
    setExpandingAll(true);
    try {
      const documentPayload = expandedDocuments[userDocument.id] ? null : await loadDocument(userDocument.id);
      const policyNodes = (documentPayload?.nodes || visibleNodes).filter((node) => node.kind === 'PolicyClause').slice(0, graphState.metadata.limits?.policy_clauses || 30);
      const clausePayloads = await Promise.all(policyNodes.map((node) => loadClause(node.id)));
      const regulationIds = [...new Set(clausePayloads.flatMap((payload) => payload.nodes || []).filter((node) => node.kind === 'RegulationClause').map((node) => node.id))];
      await Promise.all(regulationIds.map((regulationId) => loadRegulation(regulationId)));
      toast.success('Graph expanded');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not expand all graph evidence');
    } finally {
      setExpandingAll(false);
    }
  };

  const collapseAll = () => {
    setGraphState(normalizePayload(rootQuery.data || EMPTY_ROOT));
    setExpandedDocuments({});
    setExpandedClauses({});
    setExpandedRegulations({});
    setSelectedNode(null);
    setSelectedClauseDetails(null);
    setFocusNodeId(null);
    setGraphRevision((current) => current + 1);
  };

  const handleSearch = () => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return;
    const match = visibleNodes.find((node) => `${node.short_label} ${node.label}`.toLowerCase().includes(query));
    if (!match) {
      toast.error('No visible node matched your search');
      return;
    }
    setSelectedNode({ id: match.id, data: match });
    setFocusNodeId(match.id);
  };

  const refreshGraph = async () => {
    await queryClient.invalidateQueries({ queryKey: ['graph-root'] });
    await queryClient.invalidateQueries({ queryKey: ['knowledge-graph-history'] });
    setGraphStatus('Graph refreshed');
  };

  const selectedClausePanel = selectedClauseDetails?.best_match ? selectedClauseDetails : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[2rem] font-semibold leading-none text-[var(--text-primary)]">Graph Explorer</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Explore relationships between your policy and regulatory requirements.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Documents', visibleStats.documents, 'text-[var(--text-primary)]'],
          ['Clauses (Visible)', visibleStats.visibleClauses, 'text-[var(--text-primary)]'],
          ['Relationships (Visible)', visibleStats.visibleRelationships, 'text-[var(--text-primary)]'],
          ['Matches', visibleStats.matches, 'text-emerald-600'],
          ['Partial Matches', visibleStats.partialMatches, 'text-amber-500'],
          ['Missing', visibleStats.missing, 'text-red-500'],
        ].map(([label, value, textClass]) => (
          <Card key={label} className="rounded-3xl border border-[var(--border-subtle)] px-5 py-4">
            <p className="text-sm text-[var(--text-secondary)]">{label}</p>
            <p className={`mt-3 text-4xl font-semibold ${textClass}`}>{value}</p>
          </Card>
        ))}
      </div>

      <Card className="rounded-[28px] px-4 py-4 sm:px-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr_auto_auto] xl:items-end">
          <label className="block">
            <span className="text-sm font-semibold text-[var(--text-primary)]">User Policy Document</span>
            <select
              value={userDocumentId}
              onChange={(event) => setUserDocumentId(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-[var(--border-default)] bg-white px-4 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)]"
            >
              <option value="">Choose an uploaded policy...</option>
              {userDocuments.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
            </select>
          </label>
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">Domain Documents ({domainDocumentIds.length} selected)</div>
            <div className="mt-2 flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-default)] bg-white px-3 py-2">
              {domainDocuments.map((document) => {
                const selected = domainDocumentIds.includes(document.id);
                return (
                  <button
                    type="button"
                    key={document.id}
                    onClick={() => setDomainDocumentIds((current) => selected ? current.filter((value) => value !== document.id) : [...current, document.id])}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${selected ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:border-blue-200 hover:bg-slate-50'}`}
                  >
                    {document.title}
                  </button>
                );
              })}
            </div>
          </div>
          <Button loading={buildMutation.isPending} disabled={!canBuild} className="h-12 rounded-2xl px-6" onClick={() => buildMutation.mutate({ user_document_id: userDocumentId, domain_document_ids: domainDocumentIds })}>
            <Sparkles size={16} /> Build Graph
          </Button>
          <div className="flex h-12 items-center justify-end text-sm text-emerald-600">
            {graphStatus || (graphState.metadata.build_id ? 'Graph ready' : '')}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <Card className="rounded-[30px] p-4">
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => flow?.fitView({ duration: 220, padding: 0.14 })}><Maximize size={16} /> Fit to Screen</Button>
                <Button variant="secondary" onClick={() => setGraphRevision((current) => current + 1)}><RotateCcw size={16} /> Reset Layout</Button>
                <Button variant="secondary" onClick={() => {
                  if (focusNodeId) {
                    const match = flow?.getNode(focusNodeId);
                    if (match?.positionAbsolute) {
                      flow?.setCenter(match.positionAbsolute.x + 80, match.positionAbsolute.y + 50, { duration: 220, zoom: Math.max(flow.getZoom(), 0.95) });
                      return;
                    }
                  }
                  flow?.fitView({ duration: 220, padding: 0.14 });
                }}><LocateFixed size={16} /> Center Graph</Button>
                <Button variant="secondary" onClick={expandAll} loading={expandingAll}><PlusCircle size={16} /> Expand All</Button>
                <Button variant="secondary" onClick={collapseAll}><MinusCircle size={16} /> Collapse All</Button>
                <Button variant="secondary" onClick={refreshGraph}><RefreshCw size={16} /> Refresh</Button>
                <Button variant="secondary" onClick={() => setHistoryOpen(true)}><History size={16} /> History</Button>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card-hover)] px-3 py-2">
                <Search size={16} className="text-[var(--text-muted)]" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSearch();
                  }}
                  className="w-48 bg-transparent text-sm outline-none"
                  placeholder="Search visible nodes"
                />
                <button type="button" className="text-xs font-semibold text-[var(--text-accent)]" onClick={handleSearch}>Go</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => flow?.zoomIn?.({ duration: 180 })}><ZoomIn size={16} /> Zoom In</Button>
                <Button variant="secondary" onClick={() => flow?.zoomOut?.({ duration: 180 })}><ZoomOut size={16} /> Zoom Out</Button>
              </div>
            </div>
            </div>

            {flowGraph.nodes.length ? (
              <KnowledgeGraph
                nodes={flowGraph.nodes}
                edges={flowGraph.edges}
                onNodeClick={handleNodeClick}
                onInit={setFlow}
                nodeTypes={graphNodeTypes}
                revision={graphRevision}
                focusNodeId={focusNodeId}
              />
            ) : (
              <Card className="min-h-[520px] rounded-[28px] border border-dashed border-[var(--border-default)] bg-[var(--bg-card-hover)]">
                <EmptyState
                  icon={ShieldCheck}
                  title="Build a focused evidence graph"
                  description="Choose one uploaded user policy and one or more domain documents, then build the graph. The explorer only visualizes the evidence used for compliance reasoning."
                />
              </Card>
            )}
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="rounded-[26px] p-5">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Selected Policy Clause</p>
              {selectedClausePanel ? (
                <>
                  <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{selectedClausePanel.source_id} - {selectedClausePanel.clause_type || 'Policy Clause'}</p>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Clause Text</p>
                  <div className="mt-2 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card-hover)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
                    {selectedClausePanel.clause_text}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-[var(--text-secondary)]">Click a policy clause node to load its best regulatory evidence and recommendation.</p>
              )}
            </Card>

            <Card className="rounded-[26px] p-5">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Best Match</p>
              {selectedClausePanel?.best_match ? (
                <>
                  <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{selectedClausePanel.best_match.label}</p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{selectedClausePanel.best_match.document_title}</p>
                  <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">Similarity Score: <span className="text-amber-500">{selectedClausePanel.best_match.score.toFixed(2)} ({relationStatusLabel(selectedClausePanel.best_match.status)})</span></p>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Regulation Text</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{selectedClausePanel.best_match.regulation_text}</p>
                </>
              ) : (
                <p className="mt-3 text-sm text-[var(--text-secondary)]">The best regulatory clause appears here after you select a policy clause.</p>
              )}
            </Card>

            <Card className="rounded-[26px] p-5">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Gap / Recommendation</p>
              {selectedClausePanel?.best_match ? (
                <>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{selectedClausePanel.best_match.reasoning}</p>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Recommendation</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{selectedClausePanel.best_match.recommendation}</p>
                </>
              ) : (
                <p className="mt-3 text-sm text-[var(--text-secondary)]">Reasoning and remediation guidance appears here for the selected policy clause.</p>
              )}
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[26px] p-5">
            <p className="text-xl font-semibold text-[var(--text-primary)]">Legend</p>
            <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              {Object.entries(edgePalette).map(([kind, palette]) => (
                <div key={kind} className="flex items-center gap-3">
                  <span className="w-10" style={{ borderTop: palette.dash ? `2px dashed ${palette.stroke}` : `2px solid ${palette.stroke}` }} />
                  <span>{kind}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="rounded-[26px] p-5">
            <p className="text-xl font-semibold text-[var(--text-primary)]">Node Types</p>
            <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              {Object.entries(nodePalette).map(([kind, palette]) => (
                <div key={kind} className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: palette.iconBg }} />
                  <span>{kind === 'UserDocument' ? 'User Document' : kind === 'PolicyClause' ? 'Policy Clause (User)' : kind === 'RegulationClause' ? 'Regulation Clause (Domain)' : kind === 'DomainDocument' ? 'Domain Document' : 'Entity'}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="rounded-[26px] p-5">
            <p className="text-xl font-semibold text-[var(--text-primary)]">Graph Summary</p>
            <div className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
              <div className="flex justify-between"><span>Total Nodes</span><span>{graphState.metadata.graph_summary?.total_nodes || 0}</span></div>
              <div className="flex justify-between"><span>Total Relationships</span><span>{graphState.metadata.graph_summary?.total_relationships || 0}</span></div>
              <div className="flex justify-between"><span>Policy Clauses</span><span>{graphState.metadata.graph_summary?.policy_clauses || 0}</span></div>
              <div className="flex justify-between"><span>Regulation Clauses</span><span>{graphState.metadata.graph_summary?.regulation_clauses || 0}</span></div>
              <div className="flex justify-between"><span>Domain Documents</span><span>{graphState.metadata.graph_summary?.domain_documents || 0}</span></div>
              <div className="flex justify-between"><span>Entities</span><span>{graphState.metadata.graph_summary?.entities || 0}</span></div>
              <div className="flex justify-between text-emerald-600"><span>Matches</span><span>{graphState.metadata.graph_summary?.matches || 0}</span></div>
              <div className="flex justify-between text-amber-500"><span>Partial Matches</span><span>{graphState.metadata.graph_summary?.partial_matches || 0}</span></div>
              <div className="flex justify-between text-red-500"><span>Missing</span><span>{graphState.metadata.graph_summary?.missing || 0}</span></div>
            </div>
          </Card>

          <Card className="rounded-[26px] p-5">
            <p className="text-xl font-semibold text-[var(--text-primary)]">Selected Documents</p>
            <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">{graphState.metadata.user_document?.title || 'No active policy graph'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(graphState.metadata.domain_documents || []).map((document) => (
                <span key={document.id} className="rounded-full border border-[var(--border-default)] bg-[var(--bg-card-hover)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                  {document.title}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs text-[var(--text-muted)]">Built {formatTimestamp(graphState.metadata.created_at)}</p>
          </Card>
        </div>
      </div>

      <Modal open={historyOpen} title="Graph History" onClose={() => setHistoryOpen(false)}>
        <div className="space-y-3">
          {historyBuilds.length ? historyBuilds.map((build) => (
            <div key={build.build_id} className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-card-hover)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{build.user_document.title}</p>
                    {build.active ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Active</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{formatTimestamp(build.created_at)}</p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{build.nodes} nodes, {build.relationships} relationships, {build.domain_documents.length} domain documents</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => activateMutation.mutate(build.build_id)}>Open</Button>
                  <Button variant="danger" loading={deleteMutation.isPending && deleteMutation.variables === build.build_id} onClick={() => { if (window.confirm('Delete this saved graph build?')) deleteMutation.mutate(build.build_id); }}>
                    <Trash2 size={15} /> Delete
                  </Button>
                </div>
              </div>
            </div>
          )) : <p className="text-sm text-[var(--text-secondary)]">No saved graph builds yet.</p>}
        </div>
      </Modal>
    </div>
  );
}
