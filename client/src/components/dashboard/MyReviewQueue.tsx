"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Clock,
  UserCheck,
  Calendar,
  ArrowRight,
  Filter,
  CheckCircle2,
  FileText,
  Search,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { findingsService, FindingDetail } from "@/services/api/findings";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FindingDetailDrawer, FindingItem } from "@/components/compliance/FindingDetailDrawer";

interface MyReviewQueueProps {
  organizationId?: string;
  organizationName?: string;
}

type FilterOption =
  | "ALL"
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "OPEN"
  | "IN_REVIEW"
  | "OVERDUE";

export function MyReviewQueue({ organizationId, organizationName }: MyReviewQueueProps) {
  const [findings, setFindings] = useState<FindingDetail[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const fetchFindings = useCallback(
    async (isManual = false) => {
      if (isManual) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const data = await findingsService.getMyWork(organizationId);
        setFindings(data || []);
      } catch (err) {
        console.error("Failed to load review queue findings:", err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [organizationId]
  );

  useEffect(() => {
    fetchFindings();
  }, [fetchFindings]);

  const handleFindingUpdated = (updated: FindingItem) => {
    setFindings((prev) =>
      prev.map((f) =>
        f.id === updated.id
          ? {
              ...f,
              ...updated,
              assignee: updated.assignee
                ? {
                    id: updated.assignee.id,
                    full_name: updated.assignee.full_name,
                    email: updated.assignee.email,
                  }
                : null,
            }
          : f
      )
    );
  };

  const handleOpenFinding = (f: FindingDetail) => {
    const item: FindingItem = {
      id: f.id,
      report_id: f.report_id,
      policy_clause_id: f.policy_clause_id,
      regulation_clause_id: f.regulation_clause_id,
      status: f.status,
      lifecycle_status: f.lifecycle_status,
      confidence: f.confidence,
      severity: f.severity,
      reasoning: f.reasoning,
      recommendation: f.recommendation,
      citation: f.citation,
      matched_policy_text: f.matched_policy_text,
      graph_path: f.graph_path,
      assigned_to: f.assigned_to,
      assignee: f.assignee,
      resolution_note: f.resolution_note,
      reopen_reason: f.reopen_reason,
      remediation_due_date: f.remediation_due_date,
      is_overdue: f.is_overdue,
      comments_count: f.comments_count,
      created_at: f.created_at,
      updated_at: f.updated_at,
    };
    setSelectedFinding(item);
    setIsDrawerOpen(true);
  };

  // Filter & Search Logic
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      // 1. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText =
          f.id.toLowerCase().includes(q) ||
          (f.citation && f.citation.toLowerCase().includes(q)) ||
          (f.reasoning && f.reasoning.toLowerCase().includes(q)) ||
          (f.recommendation && f.recommendation.toLowerCase().includes(q)) ||
          (f.policy_clause_id && f.policy_clause_id.toLowerCase().includes(q)) ||
          (f.regulation_clause_id && f.regulation_clause_id.toLowerCase().includes(q));
        if (!matchesText) return false;
      }

      // 2. Filter Pills
      if (activeFilter === "ALL") return true;
      if (activeFilter === "CRITICAL") return (f.severity || "").toUpperCase() === "CRITICAL";
      if (activeFilter === "HIGH") return (f.severity || "").toUpperCase() === "HIGH";
      if (activeFilter === "MEDIUM") return (f.severity || "").toUpperCase() === "MEDIUM";
      if (activeFilter === "LOW") return (f.severity || "").toUpperCase() === "LOW";
      if (activeFilter === "OPEN") return (f.lifecycle_status || "OPEN").toUpperCase() === "OPEN";
      if (activeFilter === "IN_REVIEW") return (f.lifecycle_status || "").toUpperCase() === "IN_REVIEW";
      if (activeFilter === "OVERDUE") return Boolean(f.is_overdue);

      return true;
    });
  }, [findings, activeFilter, searchQuery]);

  // Metric counts for filter pills
  const counts = useMemo(() => {
    return {
      all: findings.length,
      critical: findings.filter((f) => (f.severity || "").toUpperCase() === "CRITICAL").length,
      high: findings.filter((f) => (f.severity || "").toUpperCase() === "HIGH").length,
      medium: findings.filter((f) => (f.severity || "").toUpperCase() === "MEDIUM").length,
      low: findings.filter((f) => (f.severity || "").toUpperCase() === "LOW").length,
      open: findings.filter((f) => (f.lifecycle_status || "OPEN").toUpperCase() === "OPEN").length,
      inReview: findings.filter((f) => (f.lifecycle_status || "").toUpperCase() === "IN_REVIEW").length,
      overdue: findings.filter((f) => Boolean(f.is_overdue)).length,
    };
  }, [findings]);

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="p-4 sm:p-5 border-b border-border/40 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm sm:text-base font-bold text-foreground">
                My Review Queue
              </CardTitle>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold">
                {findings.length} findings
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Findings assigned to you or awaiting compliance verification in {organizationName || "this workspace"}.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchFindings(true)}
              disabled={isLoading || isRefreshing}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="pt-3 space-y-2.5">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder="Search findings by clause, citation, or reasoning…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { key: "ALL" as FilterOption, label: "All", count: counts.all },
              { key: "CRITICAL" as FilterOption, label: "Critical", count: counts.critical, color: "text-rose-500" },
              { key: "HIGH" as FilterOption, label: "High", count: counts.high, color: "text-orange-500" },
              { key: "MEDIUM" as FilterOption, label: "Medium", count: counts.medium, color: "text-amber-500" },
              { key: "LOW" as FilterOption, label: "Low", count: counts.low, color: "text-slate-400" },
              { key: "OPEN" as FilterOption, label: "Open", count: counts.open },
              { key: "IN_REVIEW" as FilterOption, label: "In Review", count: counts.inReview, color: "text-indigo-400" },
              { key: "OVERDUE" as FilterOption, label: "Overdue", count: counts.overdue, color: "text-red-500 font-bold" },
            ].map((tab) => {
              const isSelected = activeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0 cursor-pointer border",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-2xs font-semibold"
                      : "bg-background border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span className={tab.color}>{tab.label}</span>
                  <span className="ml-1.5 opacity-70 tabular-nums font-normal">({tab.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : filteredFindings.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-border/60 rounded-xl bg-muted/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
            <h4 className="text-sm font-semibold text-foreground">No findings match your filter</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {searchQuery || activeFilter !== "ALL"
                ? "Try adjusting your search query or severity filter."
                : "You have reviewed all assigned items in this workspace. No action required."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredFindings.map((f) => {
              const sev = (f.severity || "MEDIUM").toUpperCase();
              const lifecycle = (f.lifecycle_status || "OPEN").toUpperCase();

              return (
                <div
                  key={f.id}
                  onClick={() => handleOpenFinding(f)}
                  className="group p-3.5 rounded-xl border border-border/60 bg-card hover:bg-muted/30 hover:border-border transition-all duration-150 cursor-pointer shadow-2xs space-y-2"
                >
                  {/* Card Top Row: ID, Badges, Due Date, Review Button */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold font-mono text-foreground">
                        #{f.id.slice(0, 8)}
                      </span>

                      {/* Severity Badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0 uppercase font-bold",
                          sev === "CRITICAL" || sev === "HIGH"
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                            : sev === "MEDIUM"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                            : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30"
                        )}
                      >
                        {sev}
                      </Badge>

                      {/* Lifecycle Status Badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0 font-medium",
                          lifecycle === "RESOLVED"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            : lifecycle === "IN_REVIEW"
                            ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                            : lifecycle === "REMEDIATION"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                            : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30"
                        )}
                      >
                        {lifecycle.replace(/_/g, " ")}
                      </Badge>

                      {f.is_overdue && (
                        <Badge
                          variant="outline"
                          className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] px-1.5 py-0 font-bold"
                        >
                          OVERDUE
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {f.remediation_due_date && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                          <Calendar className="h-3 w-3 text-indigo-400" />
                          {format(new Date(f.remediation_due_date), "MMM d, yyyy")}
                        </span>
                      )}

                      <Button
                        size="xs"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFinding(f);
                        }}
                        className="h-7 text-xs font-semibold gap-1 text-primary border-primary/30 hover:bg-primary/5 cursor-pointer"
                      >
                        <span>Review Finding</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Finding Text / Citation */}
                  <p className="text-xs text-foreground/90 font-medium line-clamp-2 leading-relaxed">
                    {f.citation || f.reasoning || "Statutory compliance finding requiring review."}
                  </p>

                  {/* Metadata Row: Source Policy, Regulation Clause, Assignee */}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 border-t border-border/30 flex-wrap">
                    {f.policy_clause_id && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3 text-indigo-400" />
                        <span className="font-mono text-foreground font-semibold">{f.policy_clause_id}</span>
                      </span>
                    )}

                    {f.regulation_clause_id && (
                      <span className="flex items-center gap-1">
                        <span className="text-muted-foreground">•</span>
                        <span className="font-mono text-foreground font-semibold">{f.regulation_clause_id}</span>
                      </span>
                    )}

                    <div className="ml-auto flex items-center gap-1">
                      <UserCheck className="h-3 w-3 text-muted-foreground" />
                      <span>{f.assignee?.full_name || "Unassigned"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="p-3 sm:p-4 border-t border-border/40 bg-muted/10 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">
          Showing findings assigned to you ({counts.all} items)
        </span>
        <Link
          href="/compliance/my-work?view=all"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
        >
          <span>View All Organization Findings</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardFooter>

      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onFindingUpdated={handleFindingUpdated}
        organizationId={organizationId}
      />
    </Card>
  );
}
