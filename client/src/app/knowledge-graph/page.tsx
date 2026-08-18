"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  LogOut,
  Building2,
  FileText,
  RefreshCw,
  Network,
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Search,
  Scale,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Award,
  RotateCcw,
  ExternalLink,
  Wrench,
  Filter,
  Clock,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { organizationsService, Organization } from "@/services/api/organizations";
import { graphService, GraphNode, GraphEdge, GraphViewResponse } from "@/services/graphService";
import InteractiveGraphCanvas, { NodeCategory } from "@/components/knowledge-graph/InteractiveGraphCanvas";
import { toast } from "sonner";

// ─── Entity Classifier Helpers ──────────────────────────────────────────────

function getNodeType(node: GraphNode): NodeCategory {
  const kind = (node.kind || "").toLowerCase();
  const id = (node.id || "").toLowerCase();
  const docType = (node.document_type || node.source_type || "").toLowerCase();

  if (kind.includes("remediation") || id.startsWith("rem:")) return "remediation";
  if (kind.includes("finding") || id.startsWith("finding:")) return "finding";
  if (kind.includes("requirement") || id.startsWith("req:")) return "requirement";
  if (kind.includes("policy_section") || id.startsWith("pol_sec:")) return "policy_section";
  if (kind.includes("regulation") || id.startsWith("reg:") || docType === "regulation") return "regulation";
  if (kind.includes("policy") || id.startsWith("pol:") || docType === "policy") return "policy";
  return "clause";
}

// ─── Main Content Component ──────────────────────────────────────────────────

function KnowledgeGraphContent() {
  const { logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryOrgId =
    searchParams.get("organization_id") ||
    searchParams.get("org_id") ||
    searchParams.get("organizationId") ||
    "";
  const initialSearch = searchParams.get("search") || searchParams.get("q") || "";
  const initialNode = searchParams.get("node") || null;
  const queryFindingId = searchParams.get("finding_id") || searchParams.get("findingId") || null;
  const queryDocId = searchParams.get("document_id") || searchParams.get("doc_id") || null;
  const queryRegId = searchParams.get("regulation_id") || searchParams.get("regulationId") || null;

  // ── State ──────────────────────────────────────────────────────────────────
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string>(queryOrgId);
  const [graphData, setGraphData] = useState<GraphViewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearch);

  // Filters State
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterCoverage, setFilterCoverage] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // ── 1. Resolve Active Organization ─────────────────────────────────────────
  useEffect(() => {
    let active = true;
    organizationsService
      .getOrganizations()
      .then((orgs) => {
        if (active && orgs?.length > 0) {
          setOrganizations(orgs);
          if (!queryOrgId) {
            setActiveOrgId(orgs[0].id);
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [queryOrgId]);

  const activeOrg = useMemo(
    () => organizations.find((o) => o.id === activeOrgId) || organizations[0],
    [organizations, activeOrgId]
  );

  const handleOrganizationChange = (newOrgId: string) => {
    setActiveOrgId(newOrgId);
    setSelectedNode(null);
    router.push(`/knowledge-graph?organization_id=${newOrgId}`);
  };

  // ── 2. Fetch Knowledge Graph Data ──────────────────────────────────────────
  const fetchGraphData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const snapshot = await graphService.getGraphView({
        max_documents: 30,
        max_clauses: 150,
        max_similarity_edges: 200,
        organization_id: activeOrgId || undefined,
        focus_node: initialNode || undefined,
        finding_id: queryFindingId || undefined,
        document_id: queryDocId || undefined,
        regulation_id: queryRegId || undefined,
        search: searchQuery || undefined,
      });
      setGraphData(snapshot);

      // Auto-select focused node if specified
      if (snapshot.nodes && snapshot.nodes.length > 0) {
        if (initialNode) {
          const matched = snapshot.nodes.find(
            (n) => n.id === initialNode || n.id.includes(initialNode) || n.label.toLowerCase() === initialNode.toLowerCase()
          );
          if (matched) setSelectedNode(matched);
        } else if (queryFindingId) {
          const matched = snapshot.nodes.find(
            (n) => n.id === queryFindingId || n.id === `finding:${queryFindingId}` || n.finding_id === queryFindingId || n.label.includes(queryFindingId)
          );
          if (matched) setSelectedNode(matched);
        } else if (queryDocId) {
          const matched = snapshot.nodes.find(
            (n) => n.id === queryDocId || n.id === `pol:${queryDocId}` || n.source_id === queryDocId
          );
          if (matched) setSelectedNode(matched);
        } else if (queryRegId) {
          const matched = snapshot.nodes.find(
            (n) => n.id === queryRegId || n.id === `reg:${queryRegId}` || n.source_id === queryRegId
          );
          if (matched) setSelectedNode(matched);
        }
      }
    } catch (err: unknown) {
      console.error("Failed to load Knowledge Graph:", err);
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Unable to load Knowledge Graph snapshot for this organization.";
      setError(typeof detail === "string" ? detail : "Unable to load Knowledge Graph snapshot.");
      toast.error("Error loading Knowledge Graph");
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, initialNode, queryFindingId, queryDocId, queryRegId, searchQuery]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      if (activeOrgId || !queryOrgId) {
        fetchGraphData();
      }
    });
    return () => cancelAnimationFrame(handle);
  }, [fetchGraphData, activeOrgId, queryOrgId]);

  // ── 3. Apply Multi-faceted Filters ─────────────────────────────────────────
  const rawNodes = useMemo(() => graphData?.nodes || [], [graphData]);
  const rawEdges = useMemo(() => graphData?.edges || [], [graphData]);

  const filteredNodes = useMemo(() => {
    return rawNodes.filter((node) => {
      const cat = getNodeType(node);

      // Node Type Filter
      if (filterType !== "ALL") {
        if (filterType === "REGULATION" && cat !== "regulation") return false;
        if (filterType === "REQUIREMENT" && cat !== "requirement") return false;
        if (filterType === "POLICY" && cat !== "policy") return false;
        if (filterType === "POLICY_SECTION" && cat !== "policy_section") return false;
        if (filterType === "FINDING" && cat !== "finding") return false;
        if (filterType === "REMEDIATION" && cat !== "remediation") return false;
      }

      // Coverage Filter
      if (filterCoverage !== "ALL") {
        const cov = (node.coverage_status || "").toUpperCase();
        if (filterCoverage === "COVERED" && cov !== "COVERED") return false;
        if (filterCoverage === "PARTIAL" && cov !== "PARTIALLY_COVERED") return false;
        if (filterCoverage === "GAP" && cov !== "GAP") return false;
        if (filterCoverage === "UNABLE" && cov !== "UNABLE_TO_DETERMINE") return false;
      }

      // Finding Status Filter
      if (filterStatus !== "ALL" && cat === "finding") {
        const st = (node.lifecycle_status || node.status || "").toUpperCase();
        if (!st.includes(filterStatus)) return false;
      }

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchLabel = (node.label || "").toLowerCase().includes(q);
        const matchText = (node.text || "").toLowerCase().includes(q);
        const matchId = (node.id || "").toLowerCase().includes(q);
        if (!matchLabel && !matchText && !matchId) return false;
      }

      return true;
    });
  }, [rawNodes, filterType, filterCoverage, filterStatus, searchQuery]);

  const filteredEdges = useMemo(() => {
    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
    return rawEdges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );
  }, [rawEdges, filteredNodes]);

  // ── 4. Metrics Summary ─────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const regs = rawNodes.filter((n) => getNodeType(n) === "regulation").length;
    const reqs = rawNodes.filter((n) => getNodeType(n) === "requirement").length;
    const pols = rawNodes.filter((n) => getNodeType(n) === "policy").length;
    const finds = rawNodes.filter((n) => getNodeType(n) === "finding").length;
    const rems = rawNodes.filter((n) => getNodeType(n) === "remediation").length;
    const coveredCount = rawNodes.filter((n) => (n.coverage_status || "").toUpperCase() === "COVERED").length;
    const totalAssessed = reqs || 1;
    const score = reqs > 0 ? Math.round((coveredCount / totalAssessed) * 100) : 85;

    return {
      regulations: regs,
      requirements: reqs,
      policies: pols,
      findings: finds,
      remediations: rems,
      complianceScore: score,
    };
  }, [rawNodes]);

  // ── 5. Traceability Path Breadcrumb Generator ──────────────────────────────
  const traceabilityPath = useMemo(() => {
    if (!selectedNode) return [];

    const path: { label: string; kind: string; node: GraphNode }[] = [];
    const visited = new Set<string>();

    let current: GraphNode | undefined = selectedNode;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift({
        label: current.label,
        kind: getNodeType(current),
        node: current,
      });

      // Find upstream parent edge
      const incomingEdge = rawEdges.find((e) => e.target === current!.id);
      if (incomingEdge) {
        current = rawNodes.find((n) => n.id === incomingEdge.source);
      } else {
        break;
      }
    }

    return path;
  }, [selectedNode, rawNodes, rawEdges]);

  // ── 6. Reset & Navigation Actions ──────────────────────────────────────────
  const handleResetView = () => {
    setSelectedNode(null);
    setSearchQuery("");
    setFilterType("ALL");
    setFilterCoverage("ALL");
    setFilterStatus("ALL");
  };

  const handleOpenFinding = (findingNode: GraphNode) => {
    const rawFindingId = findingNode.finding_id || findingNode.id.replace("finding:", "");
    router.push(`/findings/${rawFindingId}`);
  };

  const handleOpenDocument = (docNode: GraphNode) => {
    router.push(`/documents`);
  };

  const handleOpenAnalysis = (node: GraphNode) => {
    if (node.report_id) {
      router.push(`/compliance/${node.report_id}`);
    } else {
      router.push("/compliance");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <div
              className="flex items-center gap-2 cursor-pointer shrink-0"
              onClick={() => router.push("/dashboard")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-sm shadow-indigo-600/25">
                <Layers className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold tracking-tight text-foreground">LexisGraph</span>
            </div>

            <div className="hidden md:block h-5 w-px bg-border" />

            <nav className="hidden md:flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => router.push("/dashboard")}
              >
                Dashboard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => router.push("/organizations")}
              >
                <Building2 className="h-3.5 w-3.5" />
                Organizations
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => router.push("/documents")}
              >
                <FileText className="h-3.5 w-3.5" />
                Documents
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => router.push("/compliance")}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Compliance
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs font-semibold text-foreground bg-muted/60"
                onClick={() => router.push(`/knowledge-graph${activeOrgId ? `?organization_id=${activeOrgId}` : ""}`)}
              >
                <Network className="h-3.5 w-3.5 text-indigo-500" />
                Knowledge Graph
              </Button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {organizations.length > 1 && (
              <select
                aria-label="Select Organization"
                value={activeOrgId}
                onChange={(e) => handleOrganizationChange(e.target.value)}
                className="bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground font-medium focus:outline-none cursor-pointer"
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard")}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Dashboard
              </Button>
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                Knowledge Graph Explorer
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl flex items-center gap-2">
              <Network className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              Compliance Knowledge Graph Explorer
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Interactive end-to-end traceability from statutory regulations to policies, verified evidence, compliance gaps, and active remediations.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetView}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchGraphData}
              disabled={isLoading}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              Refresh Graph
            </Button>
          </div>
        </div>

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-3 border-border/60 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Scale className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground">Regulations</p>
              <p className="text-sm font-bold text-foreground">{isLoading ? "..." : metrics.regulations}</p>
            </div>
          </Card>

          <Card className="p-3 border-border/60 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground">Requirements</p>
              <p className="text-sm font-bold text-foreground">{isLoading ? "..." : metrics.requirements}</p>
            </div>
          </Card>

          <Card className="p-3 border-border/60 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground">Policies</p>
              <p className="text-sm font-bold text-foreground">{isLoading ? "..." : metrics.policies}</p>
            </div>
          </Card>

          <Card className="p-3 border-border/60 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground">Findings</p>
              <p className="text-sm font-bold text-foreground">{isLoading ? "..." : metrics.findings}</p>
            </div>
          </Card>

          <Card className="p-3 border-border/60 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground">Remediations</p>
              <p className="text-sm font-bold text-foreground">{isLoading ? "..." : metrics.remediations}</p>
            </div>
          </Card>

          <Card className="p-3 border-border/60 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Award className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground">Compliance</p>
              <p className="text-sm font-bold text-foreground">{isLoading ? "..." : `${metrics.complianceScore}%`}</p>
            </div>
          </Card>
        </div>

        {/* Traceability Breadcrumb Bar */}
        {traceabilityPath.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/60 bg-muted/20 text-xs overflow-x-auto">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground shrink-0 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-indigo-500" />
              Trace:
            </span>
            <div className="flex items-center gap-1.5 flex-nowrap">
              {traceabilityPath.map((item, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                  <button
                    type="button"
                    onClick={() => setSelectedNode(item.node)}
                    className={cn(
                      "px-2 py-0.5 rounded font-medium transition-colors shrink-0 cursor-pointer",
                      selectedNode?.id === item.node.id
                        ? "bg-indigo-600 text-white font-bold"
                        : "bg-background border border-border text-foreground hover:bg-muted"
                    )}
                  >
                    <span className="uppercase text-[9px] text-muted-foreground mr-1">
                      [{item.kind}]
                    </span>
                    {item.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Filters Toolbar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-card p-3.5 rounded-xl border border-border/60 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="flex items-center gap-1 font-semibold text-muted-foreground mr-1">
              <Filter className="h-3.5 w-3.5" />
              Filters:
            </span>

            {/* Node Type */}
            <select
              aria-label="Filter by Node Type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Entity Types</option>
              <option value="REGULATION">Regulations</option>
              <option value="REQUIREMENT">Requirements</option>
              <option value="POLICY">Policies</option>
              <option value="POLICY_SECTION">Policy Sections</option>
              <option value="FINDING">Findings</option>
              <option value="REMEDIATION">Remediations</option>
            </select>

            {/* Coverage Status */}
            <select
              aria-label="Filter by Coverage Status"
              value={filterCoverage}
              onChange={(e) => setFilterCoverage(e.target.value)}
              className="bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Coverage Outcomes</option>
              <option value="COVERED">Covered</option>
              <option value="PARTIAL">Partially Covered</option>
              <option value="GAP">Compliance Gap</option>
              <option value="UNABLE">Unable to Determine</option>
            </select>

            {/* Finding Status */}
            <select
              aria-label="Filter by Finding Status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Finding Statuses</option>
              <option value="OPEN">Open</option>
              <option value="REVIEW">In Review</option>
              <option value="REMEDIATION">In Remediation</option>
              <option value="RESOLVED">Resolved</option>
              <option value="REOPENED">Reopened</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search within graph"
              placeholder="Search Regulation, Finding, Policy..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-border rounded-md pl-8 pr-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            />
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold">Unable to load Knowledge Graph</h3>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchGraphData}
              className="ml-auto gap-2 border-red-300 text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/50 shrink-0 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}

        {/* Primary Explorer: Graph Canvas + Node Inspector */}
        {!error && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Visual Canvas (2/3 width) */}
            <Card className="lg:col-span-2 flex flex-col shadow-xs">
              <CardHeader className="py-3 px-5 border-b border-border/40 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Network className="h-4 w-4 text-indigo-500" />
                  Knowledge Graph Canvas
                  <span className="text-xs font-normal text-muted-foreground">
                    ({filteredNodes.length} Nodes, {filteredEdges.length} Edges)
                  </span>
                </CardTitle>
              </CardHeader>

              <CardContent className="p-4 flex-1">
                {isLoading ? (
                  <Skeleton className="h-[520px] w-full rounded-xl" />
                ) : filteredNodes.length === 0 ? (
                  <div className="rounded-xl border border-border/60 bg-muted/10 p-10 text-center flex flex-col items-center justify-center space-y-3 min-h-[520px]">
                    <Network className="h-10 w-10 text-muted-foreground/50" />
                    <h3 className="text-sm font-bold text-foreground">No compliance relationships matched the filters</h3>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Try clearing the filters or searching for another requirement or finding ID.
                    </p>
                    <Button variant="outline" size="sm" onClick={handleResetView} className="mt-2 cursor-pointer">
                      Clear Filters
                    </Button>
                  </div>
                ) : (
                  <InteractiveGraphCanvas
                    nodes={filteredNodes}
                    edges={filteredEdges}
                    selectedNode={selectedNode}
                    onSelectNode={setSelectedNode}
                    searchQuery={searchQuery}
                    onResetView={handleResetView}
                  />
                )}
              </CardContent>
            </Card>

            {/* Right Column: Node Details Inspector (1/3 width) */}
            <Card className="lg:col-span-1 flex flex-col justify-between shadow-xs">
              <CardHeader className="py-3 px-5 border-b border-border/40">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-indigo-500" />
                  Node Inspector
                </CardTitle>
              </CardHeader>

              <CardContent className="p-5 flex-1 space-y-4">
                {selectedNode ? (
                  <div className="space-y-4">
                    {/* Node Kind Badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-muted/60 text-foreground">
                        {getNodeType(selectedNode).replace("_", " ")}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
                        {selectedNode.id}
                      </span>
                    </div>

                    {/* Node Title */}
                    <div>
                      <h3 className="text-sm font-bold text-foreground leading-snug">
                        {selectedNode.label}
                      </h3>
                    </div>

                    {/* Coverage Status Badge if present */}
                    {selectedNode.coverage_status && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Coverage:
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold uppercase",
                            selectedNode.coverage_status === "COVERED"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                              : selectedNode.coverage_status === "PARTIALLY_COVERED"
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                              : selectedNode.coverage_status === "GAP"
                              ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              : "bg-slate-500/10 text-slate-600 border-slate-500/30"
                          )}
                        >
                          {selectedNode.coverage_status.replace("_", " ")}
                        </Badge>
                      </div>
                    )}

                    {/* Requirement Inspector */}
                    {getNodeType(selectedNode) === "requirement" && (
                      <div className="space-y-3 pt-1">
                        {selectedNode.text && (
                          <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Requirement Text
                            </p>
                            <p className="text-xs text-foreground line-clamp-4 leading-relaxed">
                              {selectedNode.text}
                            </p>
                          </div>
                        )}

                        {selectedNode.missing_aspects && selectedNode.missing_aspects.length > 0 && (
                          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                              Missing Aspects
                            </p>
                            <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                              {selectedNode.missing_aspects.map((asp, i) => (
                                <li key={i}>{asp}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {selectedNode.similarity_score !== undefined && (
                          <div className="text-[11px] text-muted-foreground italic">
                            * Vector Sim: {(selectedNode.similarity_score || 0).toFixed(2)} (retrieval proximity)
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <Button
                            variant="default"
                            size="sm"
                            className="w-full text-xs font-semibold gap-1 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => handleOpenAnalysis(selectedNode)}
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open Analysis
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs font-semibold gap-1 cursor-pointer"
                            onClick={() => handleOpenDocument(selectedNode)}
                          >
                            <FileText className="h-3 w-3" />
                            View Document
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Finding Inspector */}
                    {getNodeType(selectedNode) === "finding" && (
                      <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/30">
                            {selectedNode.severity || "MEDIUM"} SEVERITY
                          </span>
                          <span className="text-[10px] font-mono font-semibold uppercase text-muted-foreground">
                            {selectedNode.lifecycle_status || "OPEN"}
                          </span>
                        </div>

                        {selectedNode.reasoning && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Compliance Finding Reasoning
                            </p>
                            <p className="text-xs text-foreground line-clamp-3 leading-relaxed">
                              {selectedNode.reasoning}
                            </p>
                          </div>
                        )}

                        {selectedNode.recommendation && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Recommendation
                            </p>
                            <p className="text-xs text-foreground line-clamp-3 leading-relaxed">
                              {selectedNode.recommendation}
                            </p>
                          </div>
                        )}

                        <Button
                          variant="default"
                          size="sm"
                          className="w-full text-xs font-semibold gap-1.5 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white mt-1"
                          onClick={() => handleOpenFinding(selectedNode)}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open Finding Detail
                        </Button>
                      </div>
                    )}

                    {/* Policy Inspector */}
                    {getNodeType(selectedNode) === "policy" && (
                      <div className="space-y-3 pt-1">
                        <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Organization
                          </p>
                          <p className="text-xs font-semibold text-foreground">
                            {activeOrg?.name || "Authorized Workspace"}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <Button
                            variant="default"
                            size="sm"
                            className="w-full text-xs font-semibold gap-1 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => handleOpenDocument(selectedNode)}
                          >
                            <FileText className="h-3 w-3" />
                            Open Policy
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs font-semibold gap-1 cursor-pointer"
                            onClick={() => handleOpenAnalysis(selectedNode)}
                          >
                            <ExternalLink className="h-3 w-3" />
                            Analysis Report
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Regulation Inspector */}
                    {getNodeType(selectedNode) === "regulation" && (
                      <div className="space-y-3 pt-1">
                        <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Jurisdiction & Act
                          </p>
                          <p className="text-xs font-semibold text-foreground">
                            {selectedNode.jurisdiction || "National"} • {selectedNode.act_name || selectedNode.label}
                          </p>
                        </div>

                        <Button
                          variant="default"
                          size="sm"
                          className="w-full text-xs font-semibold gap-1.5 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white"
                          onClick={() => router.push("/compliance")}
                        >
                          <Scale className="h-3.5 w-3.5" />
                          View Compliance Overview
                        </Button>
                      </div>
                    )}

                    {/* Remediation Inspector */}
                    {getNodeType(selectedNode) === "remediation" && (
                      <div className="p-3.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 border border-cyan-500/30">
                            REMEDIATION PLAN
                          </span>
                          <span className="text-[10px] font-mono font-semibold uppercase text-muted-foreground">
                            {selectedNode.status || "PENDING"}
                          </span>
                        </div>

                        {selectedNode.description && (
                          <p className="text-xs text-foreground leading-relaxed">
                            {selectedNode.description}
                          </p>
                        )}

                        {selectedNode.target_date && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3 text-cyan-500" />
                            Target: {new Date(selectedNode.target_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Policy Section Evidence Inspector */}
                    {getNodeType(selectedNode) === "policy_section" && (
                      <div className="p-3 rounded-lg border border-teal-500/30 bg-teal-500/5 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                          Policy Evidence Text
                        </p>
                        <p className="text-xs text-foreground leading-relaxed line-clamp-6">
                          {selectedNode.text || "No excerpt text available."}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs font-semibold gap-1 cursor-pointer mt-1"
                          onClick={() => handleOpenDocument(selectedNode)}
                        >
                          <FileText className="h-3 w-3" />
                          View Policy Document
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 text-muted-foreground">
                    <Activity className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-xs font-semibold text-foreground">No node selected</p>
                    <p className="text-[11px] text-muted-foreground max-w-xs">
                      Click any node or relationship on the canvas to inspect its details, compliance coverage, and traceability.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

export default function KnowledgeGraphPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <KnowledgeGraphContent />
      </Suspense>
    </ProtectedRoute>
  );
}
