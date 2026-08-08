"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
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
  FileCheck2,
  BarChart3,
  Network,
  XCircle,
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

interface FindingsWorkspaceProps {
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

export function FindingsWorkspace({ reportId }: FindingsWorkspaceProps) {
  const router = useRouter();

  // Data State
  const [findings, setFindings] = useState<FindingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortOrder, setSortOrder] = useState<"severity_desc" | "severity_asc" | "score_asc" | "score_desc">("severity_desc");

  // Drawer State
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Fetch Findings
  const fetchFindings = useCallback(async () => {
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
      console.error(`Error loading findings for report ${reportId}:`, err);
      const rawDetail = err?.response?.data?.detail;
      let detailMsg = "Findings could not be loaded. Please verify backend connection or permissions.";
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
      toast.error("Failed to load compliance findings.");
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchFindings();
  }, [fetchFindings]);

  // Derived Metrics
  const metrics = useMemo(() => {
    const total = findings.length;
    const high = findings.filter(
      (f) => (f.severity || "").toUpperCase() === "HIGH" || (f.status || "").toUpperCase() === "NON_COMPLIANT"
    ).length;
    const medium = findings.filter(
      (f) => (f.severity || "").toUpperCase() === "MEDIUM" || (f.status || "").toUpperCase() === "PARTIALLY_COMPLIANT"
    ).length;
    const low = findings.filter(
      (f) => (f.severity || "").toUpperCase() === "LOW" || (f.status || "").toUpperCase() === "COMPLIANT"
    ).length;

    return { total, high, medium, low };
  }, [findings]);

  // Filter & Sort Findings
  const filteredFindings = useMemo(() => {
    return findings
      .filter((f) => {
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchId = (f.id || "").toLowerCase().includes(q);
          const matchReg = (f.citation || f.regulation_clause_id || "").toLowerCase().includes(q);
          const matchPol = (f.matched_policy_text || f.policy_clause_id || "").toLowerCase().includes(q);
          const matchReason = (f.reasoning || "").toLowerCase().includes(q);
          if (!matchId && !matchReg && !matchPol && !matchReason) return false;
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
        const scoreA = a.confidence != null ? a.confidence : 0;
        const scoreB = b.confidence != null ? b.confidence : 0;

        if (sortOrder === "score_asc") return scoreA - scoreB;
        if (sortOrder === "score_desc") return scoreB - scoreA;

        const sevRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const rankA = sevRank[(a.severity || "").toUpperCase()] || (a.status === "NON_COMPLIANT" ? 3 : 1);
        const rankB = sevRank[(b.severity || "").toUpperCase()] || (b.status === "NON_COMPLIANT" ? 3 : 1);

        if (sortOrder === "severity_asc") return rankA - rankB;
        return rankB - rankA; // severity_desc (default)
      });
  }, [findings, searchQuery, severityFilter, statusFilter, sortOrder]);

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
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Findings Workspace
              </h1>
              <p className="text-xs text-muted-foreground">
                Clause-level compliance gap evaluations for Report #{reportId.slice(0, 8)}.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/compliance/reports/${reportId}`)}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open Report Details
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
      {!isLoading && !error && findings.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Findings
              </span>
              <FileCheck2 className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground">{metrics.total}</span>
              <span className="text-[10px] text-muted-foreground">Evaluated clauses</span>
            </div>
          </Card>

          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-500">
                Critical / High
              </span>
              <ShieldX className="h-4 w-4 text-rose-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-rose-500">{metrics.high}</span>
              <span className="text-[10px] text-muted-foreground">Non-compliant</span>
            </div>
          </Card>

          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
                Medium Risk
              </span>
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-amber-500">{metrics.medium}</span>
              <span className="text-[10px] text-muted-foreground">Partially compliant</span>
            </div>
          </Card>

          <Card className="border border-border/60 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">
                Low / Compliant
              </span>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-emerald-500">{metrics.low}</span>
              <span className="text-[10px] text-muted-foreground">Aligned clauses</span>
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
            placeholder="Search clause ID, reasoning, or citation..."
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
            <option value="score_desc">Highest Similarity Score</option>
            <option value="score_asc">Lowest Similarity Score</option>
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
            onClick={fetchFindings}
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
            <h3 className="text-sm font-bold text-foreground">Findings Could Not Be Loaded</h3>
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
              onClick={fetchFindings}
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
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 rounded-xl border border-border/50 bg-card space-y-2">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      )}

      {/* ── 6. Empty State ── */}
      {!isLoading && !error && filteredFindings.length === 0 && (
        <Card className="border border-dashed border-border/60 bg-muted/10 py-12 px-6 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center mx-auto">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-sm font-semibold text-foreground">
              {findings.length === 0 ? "No compliance findings" : "No matching findings found"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {findings.length === 0
                ? "This analysis did not return any compliance gaps or findings."
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

      {/* ── 7. Findings List / Table & Mobile Cards ── */}
      {!isLoading && !error && filteredFindings.length > 0 && (
        <div className="space-y-4">
          {/* Desktop Table View (md and above) */}
          <div className="hidden md:block rounded-xl border border-border/60 bg-card overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Regulation Clause</th>
                    <th className="px-4 py-3">Matched Policy Clause</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-medium">
                  {filteredFindings.map((item) => {
                    const sev = deriveSeverityBadge(item.severity, item.status);
                    const scoreText =
                      item.confidence != null
                        ? `${(item.confidence * (item.confidence <= 1 ? 100 : 1)).toFixed(0)}%`
                        : "—";

                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleOpenDrawer(item)}
                        className="hover:bg-muted/20 transition-colors cursor-pointer group"
                      >
                        {/* Severity Badge */}
                        <td className="px-4 py-3.5">
                          <Badge variant="outline" className={cn("gap-1 text-[10px] uppercase font-bold", sev.className)}>
                            {sev.icon}
                            {sev.label}
                          </Badge>
                        </td>

                        {/* Regulation Clause */}
                        <td className="px-4 py-3.5 text-foreground max-w-xs">
                          <p className="line-clamp-2 font-semibold">
                            {item.citation || item.regulation_clause_id || "Regulation Clause"}
                          </p>
                          <span className="text-[10px] text-muted-foreground font-mono block">
                            ID: {item.regulation_clause_id || "N/A"}
                          </span>
                        </td>

                        {/* Matched Policy Clause */}
                        <td className="px-4 py-3.5 text-muted-foreground max-w-xs">
                          {item.matched_policy_text ? (
                            <p className="line-clamp-2">{item.matched_policy_text}</p>
                          ) : (
                            <span className="italic text-rose-500">No policy match</span>
                          )}
                        </td>

                        {/* Score */}
                        <td className="px-4 py-3.5 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {scoreText}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold uppercase",
                              item.status === "COMPLIANT"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                : item.status === "PARTIALLY_COMPLIANT"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                            )}
                          >
                            {item.status}
                          </Badge>
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => handleOpenDrawer(item)}
                            className="h-7 text-xs gap-1 cursor-pointer"
                          >
                            <span>View Finding</span>
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Grid View (sm and below) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredFindings.map((item) => {
              const sev = deriveSeverityBadge(item.severity, item.status);
              const scoreText =
                item.confidence != null
                  ? `${(item.confidence * (item.confidence <= 1 ? 100 : 1)).toFixed(0)}%`
                  : "—";

              return (
                <Card
                  key={item.id}
                  onClick={() => handleOpenDrawer(item)}
                  className="border border-border/60 bg-card p-4 space-y-3 shadow-2xs hover:border-border transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={cn("gap-1 text-[10px] uppercase font-bold", sev.className)}>
                      {sev.icon}
                      {sev.label}
                    </Badge>
                    <span className="font-mono font-bold text-xs text-indigo-500">{scoreText} Score</span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Regulation Citation
                    </span>
                    <p className="text-xs text-foreground font-semibold">
                      {item.citation || item.regulation_clause_id}
                    </p>
                  </div>

                  <div className="space-y-1 border-t border-border/40 pt-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Matched Policy
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {item.matched_policy_text || <span className="italic text-rose-500">No policy match</span>}
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-border/40" onClick={(e) => e.stopPropagation()}>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-bold uppercase",
                        item.status === "COMPLIANT"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : item.status === "PARTIALLY_COMPLIANT"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                      )}
                    >
                      {item.status}
                    </Badge>

                    <Button
                      size="sm"
                      onClick={() => handleOpenDrawer(item)}
                      className="h-8 text-xs font-semibold cursor-pointer gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <span>View Finding</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
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
