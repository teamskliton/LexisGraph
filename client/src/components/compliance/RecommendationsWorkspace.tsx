"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Search,
  RefreshCw,
  Filter,
  ArrowLeft,
  ExternalLink,
  ChevronRight,
  FileText,
  BookOpen,
  Network,
  XCircle,
  CheckCircle2,
  FileCheck2,
} from "lucide-react";
import { toast } from "sonner";

import { reportService } from "@/services/reportService";
import { FindingDetailDrawer, FindingItem } from "./FindingDetailDrawer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface RecommendationsWorkspaceProps {
  reportId: string;
}

function deriveSeverityBadge(severity?: string, status?: string) {
  const sev = (severity || "").toUpperCase();
  const st = (status || "").toUpperCase();

  if (sev === "CRITICAL" || sev === "HIGH" || st === "NON_COMPLIANT") {
    return {
      label: "High Severity",
      className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      icon: <ShieldX className="h-3.5 w-3.5 text-rose-500" />,
    };
  }
  if (sev === "MEDIUM" || st === "PARTIALLY_COMPLIANT") {
    return {
      label: "Medium Severity",
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />,
    };
  }
  return {
    label: "Low Severity",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />,
  };
}

export function RecommendationsWorkspace({ reportId }: RecommendationsWorkspaceProps) {
  const router = useRouter();

  // Data State
  const [findings, setFindings] = useState<FindingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortOrder, setSortOrder] = useState<"severity_desc" | "severity_asc">("severity_desc");

  // Drawer State
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Fetch Recommendations (derived from report findings)
  const fetchRecommendations = useCallback(async () => {
    const isUUID = !!reportId && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(reportId);
    if (!isUUID) {
      setError("Invalid Report ID format. Please select a report from your organization list.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const data = await reportService.getReportFindings(reportId);
      setFindings(data || []);
    } catch (err: any) {
      console.error(`Error loading recommendations for report ${reportId}:`, err);
      const rawDetail = err?.response?.data?.detail;
      let detailMsg = "Recommendations could not be loaded. Please verify backend connection or permissions.";
      if (typeof rawDetail === "string") {
        detailMsg = rawDetail;
      } else if (Array.isArray(rawDetail)) {
        detailMsg = rawDetail.map((d: any) => d?.msg || d?.detail || (typeof d === "string" ? d : JSON.stringify(d))).join("; ");
      } else if (rawDetail && typeof rawDetail === "object") {
        detailMsg = rawDetail?.msg || rawDetail?.detail || JSON.stringify(rawDetail);
      } else if (err?.message) {
        detailMsg = err.message;
      }
      setError(detailMsg);
      toast.error("Failed to load compliance recommendations.");
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Filter findings that have recommendations
  const recommendationItems = useMemo(() => {
    return findings.filter((f) => f.recommendation && f.recommendation.trim().length > 0);
  }, [findings]);

  // Derived Metrics
  const metrics = useMemo(() => {
    const total = recommendationItems.length;
    const high = recommendationItems.filter(
      (f) => (f.severity || "").toUpperCase() === "HIGH" || (f.status || "").toUpperCase() === "NON_COMPLIANT"
    ).length;
    const medium = recommendationItems.filter(
      (f) => (f.severity || "").toUpperCase() === "MEDIUM" || (f.status || "").toUpperCase() === "PARTIALLY_COMPLIANT"
    ).length;
    const low = recommendationItems.filter(
      (f) => (f.severity || "").toUpperCase() === "LOW" || (f.status || "").toUpperCase() === "COMPLIANT"
    ).length;

    return { total, high, medium, low };
  }, [recommendationItems]);

  // Filter & Sort Recommendations
  const filteredRecommendations = useMemo(() => {
    return recommendationItems
      .filter((f) => {
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchRec = (f.recommendation || "").toLowerCase().includes(q);
          const matchId = (f.id || "").toLowerCase().includes(q);
          const matchReg = (f.citation || f.regulation_clause_id || "").toLowerCase().includes(q);
          const matchPol = (f.matched_policy_text || f.policy_clause_id || "").toLowerCase().includes(q);
          if (!matchRec && !matchId && !matchReg && !matchPol) return false;
        }

        // Severity filter
        if (severityFilter !== "ALL") {
          const sev = (f.severity || "").toUpperCase();
          if (sev !== severityFilter.toUpperCase()) return false;
        }

        // Status filter
        if (statusFilter !== "ALL") {
          const st = (f.status || "").toUpperCase();
          if (st !== statusFilter.toUpperCase()) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const sevRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const rankA = sevRank[(a.severity || "").toUpperCase()] || (a.status === "NON_COMPLIANT" ? 3 : 1);
        const rankB = sevRank[(b.severity || "").toUpperCase()] || (b.status === "NON_COMPLIANT" ? 3 : 1);

        if (sortOrder === "severity_asc") return rankA - rankB;
        return rankB - rankA; // severity_desc (default)
      });
  }, [recommendationItems, searchQuery, severityFilter, statusFilter, sortOrder]);

  const handleOpenDrawer = (item: FindingItem) => {
    setSelectedFinding(item);
    setIsDrawerOpen(true);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setSeverityFilter("ALL");
    setStatusFilter("ALL");
    setSortOrder("severity_desc");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ── 1. Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/compliance/reports/${reportId}`)}
              className="w-fit -ml-2 text-muted-foreground hover:text-foreground cursor-pointer gap-1.5 text-xs"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Report
            </Button>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Recommendations Workspace
              </h1>
              <p className="text-xs text-muted-foreground">
                Compliance remediation guidance for Report #{reportId.slice(0, 8)}.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/compliance/reports/${reportId}/findings`)}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-indigo-500" /> View Findings
          </Button>

          <Button
            size="sm"
            onClick={() => router.push("/knowledge-graph")}
            className="gap-1.5 text-xs font-semibold cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Network className="h-3.5 w-3.5" /> Explore Knowledge Graph
          </Button>
        </div>
      </div>

      {/* ── 2. Summary Metrics ── */}
      {!isLoading && !error && recommendationItems.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Recommendations
              </span>
              <Sparkles className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">{metrics.total}</span>
              <span className="text-[10px] text-muted-foreground">Action items</span>
            </div>
          </Card>

          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-500">
                High Severity
              </span>
              <ShieldX className="h-4 w-4 text-rose-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-rose-500">{metrics.high}</span>
              <span className="text-[10px] text-muted-foreground">Critical gaps</span>
            </div>
          </Card>

          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
                Medium Severity
              </span>
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-amber-500">{metrics.medium}</span>
              <span className="text-[10px] text-muted-foreground">Partial gaps</span>
            </div>
          </Card>

          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">
                Low Severity
              </span>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-emerald-500">{metrics.low}</span>
              <span className="text-[10px] text-muted-foreground">Minor updates</span>
            </div>
          </Card>
        </div>
      )}

      {/* ── 3. Filter Bar ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-card shadow-2xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recommendation text, policy clause, or citation..."
            className="pl-9 h-8 text-xs bg-background"
          />
        </div>

        {/* Dropdown Filters & Sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground hidden sm:block" />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="h-8 px-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              <option value="ALL">All Severities</option>
              <option value="HIGH">High Severity</option>
              <option value="MEDIUM">Medium Severity</option>
              <option value="LOW">Low Severity</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="NON_COMPLIANT">Non-Compliant</option>
            <option value="PARTIALLY_COMPLIANT">Partially Compliant</option>
            <option value="COMPLIANT">Compliant</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="h-8 px-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="severity_desc">Highest Severity First</option>
            <option value="severity_asc">Lowest Severity First</option>
          </select>

          {(searchQuery || severityFilter !== "ALL" || statusFilter !== "ALL") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Clear</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={fetchRecommendations}
            disabled={isLoading}
            className="h-8 px-2.5 text-xs cursor-pointer gap-1"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── 4. Error State ── */}
      {error && (
        <Card className="border border-rose-500/30 bg-rose-500/5 p-8 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">Recommendations Could Not Be Loaded</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">{error}</p>
          </div>
          <div className="flex justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/compliance/reports/${reportId}`)}
              className="text-xs cursor-pointer"
            >
              Back to Report
            </Button>
            <Button
              size="sm"
              onClick={fetchRecommendations}
              className="text-xs font-semibold cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        </Card>
      )}

      {/* ── 5. Skeleton Loading State ── */}
      {isLoading && !error && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-4 rounded-xl border border-border/50 bg-card space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* ── 6. Empty State ── */}
      {!isLoading && !error && filteredRecommendations.length === 0 && (
        <Card className="border border-dashed border-border/60 bg-muted/10 py-12 px-6 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center mx-auto">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-sm font-semibold text-foreground">
              {recommendationItems.length === 0 ? "No recommendations" : "No matching recommendations found"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {recommendationItems.length === 0
                ? "No specific remediation recommendations were returned for this analysis."
                : "Try adjusting your search query or severity filter options above."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/compliance/reports/${reportId}`)}
            className="text-xs cursor-pointer"
          >
            Back to Report
          </Button>
        </Card>
      )}

      {/* ── 7. Recommendations List ── */}
      {!isLoading && !error && filteredRecommendations.length > 0 && (
        <div className="space-y-4">
          {filteredRecommendations.map((item) => {
            const sev = deriveSeverityBadge(item.severity, item.status);

            return (
              <Card
                key={item.id}
                onClick={() => handleOpenDrawer(item)}
                className="border border-amber-500/20 bg-card hover:bg-muted/10 p-5 space-y-4 shadow-2xs hover:border-amber-500/40 transition-colors cursor-pointer group"
              >
                {/* Header: Severity, Finding Status & Assignee Badges */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("gap-1 text-[10px] uppercase font-bold", sev.className)}>
                      {sev.icon}
                      {sev.label}
                    </Badge>

                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                    >
                      Finding Status: {item.lifecycle_status || "OPEN"}
                    </Badge>

                    {item.assignee && (
                      <Badge variant="outline" className="text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30">
                        Assigned: {item.assignee.full_name}
                      </Badge>
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-muted-foreground">
                    Generated from Finding #{item.id.slice(0, 8)}
                  </span>
                </div>

                {/* Recommendation Text */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Recommended Remediation Action
                  </span>
                  <p className="text-sm font-semibold text-foreground leading-relaxed">
                    {item.recommendation}
                  </p>
                </div>

                {/* Policy vs Regulation Context Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border/40 text-xs">
                  {/* Policy Side */}
                  <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-indigo-500 block">
                      Affected Policy Clause
                    </span>
                    <p className="text-muted-foreground truncate">
                      {item.policy_clause_id ? `ID: ${item.policy_clause_id}` : "Clause ID N/A"}
                    </p>
                    {item.matched_policy_text && (
                      <p className="text-foreground line-clamp-1 italic">
                        "{item.matched_policy_text}"
                      </p>
                    )}
                  </div>

                  {/* Regulation Side */}
                  <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-emerald-500 block">
                      Related Regulation Citation
                    </span>
                    <p className="text-muted-foreground truncate">
                      {item.regulation_clause_id ? `ID: ${item.regulation_clause_id}` : "Regulation N/A"}
                    </p>
                    {item.citation && (
                      <p className="text-foreground line-clamp-1 italic">
                        "{item.citation}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-2 flex items-center justify-between border-t border-border/40" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[11px] text-muted-foreground italic">
                    Source: LexisGraph Compliance Engine
                  </span>

                  <Button
                    size="sm"
                    onClick={() => handleOpenDrawer(item)}
                    className="h-8 text-xs font-semibold cursor-pointer gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <span>View Source Finding</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Slide-over Finding Detail Drawer ── */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        reportName={`Report #${reportId.slice(0, 8)}`}
      />
    </div>
  );
}
