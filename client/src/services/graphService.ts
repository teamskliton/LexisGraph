import { api } from "./api";

export interface GraphNode {
  id: string;
  kind: string;
  label: string;
  short_label?: string;
  source_type?: string;
  source_id?: string;
  clause_type?: string;
  clause_count?: number;
  document_title?: string;
  document_type?: string;
  organization_id?: string;
  domain?: string;
  text?: string;
  report_id?: string;
  policy_id?: string;
  regulation_id?: string;
  finding_id?: string;
  remediation_id?: string;
  overall_score?: number | null;
  similarity_score?: number | null;
  findings_count?: number;
  last_analyzed_at?: string | null;
  risk_level?: string;
  status?: string;
  lifecycle_status?: string;
  severity?: string;
  coverage_status?: "COVERED" | "PARTIALLY_COVERED" | "GAP" | "UNABLE_TO_DETERMINE" | string;
  confidence?: string | number;
  missing_aspects?: string[];
  conflicting_evidence?: boolean;
  created_at?: string | null;
  reasoning?: string;
  recommendation?: string;
  citation?: string;
  policy_clause_id?: string;
  policy_clause_text?: string;
  regulation_clause_id?: string;
  regulation_clause_text?: string;
  act_name?: string;
  act_year?: number;
  jurisdiction?: string;
  version?: string;
  description?: string;
  target_date?: string | null;
  is_focused?: boolean;
}


export interface GraphEdge {
  id: string;
  kind: string;
  source: string;
  target: string;
  score?: number;
  confidence?: number;
  rank?: number;
  coverage_status?: string;
}

export interface GraphViewResponse {
  status: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta?: {
    total_nodes?: number;
    total_edges?: number;
    focus_node?: string | null;
    documents?: number;
    clauses?: number;
    has_clause_edges?: number;
    similarity_edges?: number;
  };
  metadata?: {
    build_id?: string | null;
    created_at?: string | null;
    active?: boolean;
    nodes?: number;
    relationships?: number;
    user_document_id?: string;
    user_document_title?: string;
    domain_document_ids?: string[];
    domain_document_titles?: string[];
    graph_summary?: {
      total_nodes: number;
      total_relationships: number;
      policy_clauses: number;
      regulation_clauses: number;
      domain_documents: number;
      entities: number;
      user_documents: number;
      matches: number;
      partial_matches: number;
      missing: number;
    };
  };
  details?: {
    clause_id?: string;
    regulation_clause_id?: string;
    source_id?: string;
    clause_text?: string;
    regulation_text?: string;
    clause_type?: string;
    document_title?: string;
    best_match?: {
      regulation_clause_id: string;
      label: string;
      document_title: string;
      score: number;
      status: string;
      regulation_text: string;
      reasoning: string;
      recommendation?: string;
    } | null;
  };
}

export const graphService = {
  /**
   * Fetch full graph snapshot from GET /graph-view
   */
  getGraphView: async (params?: {
    max_documents?: number;
    max_clauses?: number;
    max_similarity_edges?: number;
    knowledge_graph_only?: boolean;
    build_id?: string;
    organization_id?: string;
    focus_node?: string;
    depth?: number;
    search?: string;
    finding_id?: string;
    document_id?: string;
    regulation_id?: string;
  }): Promise<GraphViewResponse> => {
    const response = await api.get<GraphViewResponse>("/graph-view", { params });
    return response.data;
  },


  /**
   * Fetch clause neighborhood and matching regulations from GET /graph/clause/{clause_id}
   */
  getGraphClauseView: async (clauseId: string, buildId?: string): Promise<GraphViewResponse> => {
    const response = await api.get<GraphViewResponse>(`/graph/clause/${clauseId}`, {
      params: buildId ? { build_id: buildId } : undefined,
    });
    return response.data;
  },

  /**
   * Fetch document clauses from GET /graph/document/{document_id}
   */
  getGraphDocumentView: async (documentId: string, buildId?: string): Promise<GraphViewResponse> => {
    const response = await api.get<GraphViewResponse>(`/graph/document/${documentId}`, {
      params: buildId ? { build_id: buildId } : undefined,
    });
    return response.data;
  },

  /**
   * Fetch regulation entities from GET /graph/regulation/{regulation_id}
   */
  getGraphRegulationView: async (regulationId: string, buildId?: string): Promise<GraphViewResponse> => {
    const response = await api.get<GraphViewResponse>(`/graph/regulation/${regulationId}`, {
      params: buildId ? { build_id: buildId } : undefined,
    });
    return response.data;
  },

  /**
   * Fetch root user documents and domain documents from GET /graph/root
   */
  getGraphRoot: async (buildId?: string): Promise<GraphViewResponse> => {
    const response = await api.get<GraphViewResponse>("/graph/root", {
      params: buildId ? { build_id: buildId } : undefined,
    });
    return response.data;
  },
};

export default graphService;
