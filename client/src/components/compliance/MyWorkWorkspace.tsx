"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Search,
  RefreshCw,
  Filter,
  ArrowLeft,
  ChevronRight,
  AlertCircle,
  Clock,
  CheckCircle,
  FileText,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import { findingsService, FindingDetail } from "@/services/api/findings";
import { FindingDetailDrawer, FindingItem } from "./FindingDetailDrawer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

function deriveLifecycleBadge(lifecycleStatus?: string) {
  const st = (lifecycleStatus || "OPEN").toUpperCase();

  switch (st) {
    case "IN_REVIEW":
      return {
        label: "IN REVIEW",
        className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
      };
    case "REMEDIATION":
      return {
        label: "REMEDIATION",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      };
    case "RESOLVED":
      return {
        label: "RESOLVED",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      };
    case "REOPENED":
      return {
        label: "REOPENED",
        className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      };
    default:
      return {
        label: "OPEN",
        className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
      };
  }
}

export function MyWorkWorkspace() {
  const router = useRouter();
  const { user } = useAuth();

  // Active Organization state
  const [activeOrgId, setActiveOrgId] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_organization_id") || undefined;
    }
    return undefined;
  });

  // Findings & Workspace State
  const [findings, setFindings] = useState<FindingDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Finding Detail Drawer State
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Synchronize active organization on event
  useEffect(() => {
    const handleOrgChange = () => {
      if (typeof window !== "undefined") {
        const storedId = localStorage.getItem("selected_organization_id");
        if (storedId) {
          setActiveOrgId(storedId);
        }
      }
    };
    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, []);

  // Fetch assigned findings
  const fetchMyWork = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await findingsService.getMyWork(activeOrgId, {
        lifecycle_status: statusFilter !== "ALL" ? statusFilter : undefined,
        severity: severityFilter !== "ALL" ? severityFilter : undefined,
        overdue_only: overdueOnly || undefined,
      });
      setFindings(data || []);
    } catch (err: any) {
      console.error("Failed loading My Work findings:", err);
      const rawDetail = err?.response?.data?.detail || "Failed to load assigned findings.";
      setError(typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail));
      toast.error("Error loading assigned work items.");
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, statusFilter, severityFilter, overdueOnly]);

  useEffect(() => {
    fetchMyWork();
  }, [fetchMyWork]);

  // Derived filtered findings (client side text search)
  const filteredFindings = useMemo(() => {
    if (!searchQuery.trim()) return findings;

    const q = searchQuery.toLowerCase();
    return findings.filter((f) => {
      return (
        f.id.toLowerCase().includes(q) ||
        (f.policy_clause_id && f.policy_clause_id.toLowerCase().includes(q)) ||
        (f.regulation_clause_id && f.regulation_clause_id.toLowerCase().includes(q)) ||
        (f.citation && f.citation.toLowerCase().includes(q)) ||
        (f.reasoning && f.reasoning.toLowerCase().includes(q)) ||
        (f.recommendation && f.recommendation.toLowerCase().includes(q))
      );
    });
  }, [findings, searchQuery]);

  // KPI Metrics Calculations
  const metrics = useMemo(() => {
    const total = findings.length;
    const open = findings.filter(
      (f) => (f.lifecycle_status || "OPEN").toUpperCase() in { OPEN: 1, REOPENED: 1 }
    ).length;
    const inReview = findings.filter(
      (f) => (f.lifecycle_status || "OPEN").toUpperCase() === "IN_REVIEW"
    ).length;
    const highCritical = findings.filter((f) => {
      const sev = (f.severity || "").toUpperCase();
      return sev === "CRITICAL" || sev === "HIGH" || f.status === "NON_COMPLIANT";
    }).length;

    return { total, open, inReview, highCritical };
  }, [findings]);

  // Drawer Handlers
  const handleOpenDrawer = (finding: FindingDetail) => {
    setSelectedFinding(finding as FindingItem);
    setIsDrawerOpen(true);
  };

  const handleFindingUpdated = (updated: FindingItem) => {
    fetchMyWork();
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-16 space-y-6">
      {/* Header Bar */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/compliance/overview")}
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-indigo-500" /> My Work
                </h1>
                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 text-xs font-semibold">
                  Assigned to Me
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Active compliance findings assigned to <strong className="text-foreground">{user?.full_name || "you"}</strong> for review and remediation.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchMyWork()}
            disabled={isLoading}
            className="gap-1.5 text-xs cursor-pointer shrink-0"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border border-border/50 bg-card p-4 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Total Assigned</span>
            <p className="text-2xl font-bold text-foreground tabular-nums">{metrics.total}</p>
            <span className="text-[10px] text-muted-foreground">Work items assigned to you</span>
          </Card>

          <Card className="border border-border/50 bg-card p-4 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Open & Active</span>
            <p className="text-2xl font-bold text-blue-500 tabular-nums">{metrics.open}</p>
            <span className="text-[10px] text-muted-foreground">Requiring initial assessment</span>
          </Card>

          <Card className="border border-border/50 bg-card p-4 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">In Review</span>
            <p className="text-2xl font-bold text-indigo-500 tabular-nums">{metrics.inReview}</p>
            <span className="text-[10px] text-muted-foreground">Under remediation review</span>
          </Card>

          <Card className="border border-border/50 bg-card p-4 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">High / Critical Attention</span>
            <p className="text-2xl font-bold text-rose-500 tabular-nums">{metrics.highCritical}</p>
            <span className="text-[10px] text-muted-foreground">High statutory risk items</span>
          </Card>
        </div>

        {/* Filters & Search Controls */}
        <Card className="border border-border/50 bg-card p-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 flex-wrap">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search clause, citation, reasoning..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            {/* Filter Selects */}
            <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <Filter className="h-3.5 w-3.5" />
                <span>Status:</span>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="REMEDIATION">Remediation</option>
                <option value="RESOLVED">Resolved</option>
                <option value="REOPENED">Reopened</option>
              </select>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium ml-2">
                <span>Severity:</span>
              </div>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="h-9 px-3 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              <Button
                variant={overdueOnly ? "secondary" : "outline"}
                size="sm"
                onClick={() => setOverdueOnly(!overdueOnly)}
                className={cn(
                  "h-9 text-xs font-semibold gap-1.5 cursor-pointer ml-2",
                  overdueOnly && "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold"
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Overdue Only</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Content Area */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : error ? (
          <Card className="border border-rose-500/30 bg-rose-500/5 p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-rose-500 mx-auto" />
            <h3 className="text-sm font-semibold text-foreground">Failed to Load Assigned Findings</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
            <Button size="sm" onClick={() => fetchMyWork()} className="cursor-pointer text-xs font-semibold gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Try Again
            </Button>
          </Card>
        ) : findings.length === 0 ? (
          /* Empty State: Zero assigned findings */
          <Card className="border border-dashed border-border/60 bg-muted/10 p-12 text-center space-y-3">
            <CheckCircle className="h-10 w-10 text-emerald-500/80 mx-auto" />
            <h3 className="text-sm font-bold text-foreground">No findings are currently assigned to you.</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              When compliance team members assign findings or audit actions to your profile, they will appear here automatically.
            </p>
          </Card>
        ) : filteredFindings.length === 0 ? (
          /* Empty State: Filter mismatch */
          <Card className="border border-dashed border-border/60 bg-muted/10 p-8 text-center space-y-2">
            <Filter className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
            <h4 className="text-xs font-semibold text-foreground">No matching findings found</h4>
            <p className="text-xs text-muted-foreground">Try adjusting your search query or filter options.</p>
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("ALL");
                setSeverityFilter("ALL");
              }}
              className="text-xs cursor-pointer mt-1"
            >
              Reset Filters
            </Button>
          </Card>
        ) : (
          /* Findings List Grid */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Showing {filteredFindings.length} of {findings.length} assigned items</span>
            </div>

            {filteredFindings.map((item) => {
              const sev = deriveSeverityBadge(item.severity, item.status);
              const lifecycle = deriveLifecycleBadge(item.lifecycle_status);

              return (
                <Card
                  key={item.id}
                  onClick={() => handleOpenDrawer(item)}
                  className="border border-border/60 bg-card hover:border-border transition-all cursor-pointer p-4 space-y-3 group shadow-xs"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cn("gap-1 text-xs uppercase font-bold", sev.className)}>
                        {sev.icon}
                        {sev.label}
                      </Badge>
                      <Badge variant="outline" className={cn("text-xs font-bold uppercase", lifecycle.className)}>
                        {lifecycle.label}
                      </Badge>
                      {item.is_overdue && (
                        <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 gap-1 font-bold text-[10px]">
                          <AlertTriangle className="h-3 w-3" />
                          <span>OVERDUE</span>
                        </Badge>
                      )}
                      <span className="text-xs font-mono text-muted-foreground">
                        ID: #{item.id.slice(0, 8)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {item.remediation_due_date && (
                        <div className="flex items-center gap-1 font-medium text-foreground">
                          <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                          <span>Due: {format(new Date(item.remediation_due_date), "dd MMM yyyy")}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{format(new Date(item.created_at), "MMM d, yyyy")}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      {item.policy_clause_id && <Badge variant="secondary" className="text-[10px]">{item.policy_clause_id}</Badge>}
                      {item.regulation_clause_id && <Badge variant="outline" className="text-[10px]">{item.regulation_clause_id}</Badge>}
                    </div>
                    <p className="text-xs text-foreground font-medium line-clamp-2">
                      {item.citation || item.reasoning || "Compliance finding item assigned for review."}
                    </p>
                  </div>

                  {item.recommendation && (
                    <p className="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-lg border border-border/30 line-clamp-2">
                      <strong className="text-foreground">Recommendation:</strong> {item.recommendation}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-border/30">
                    <span className="text-[11px] text-muted-foreground">
                      Assigned to: <strong className="text-indigo-500">{item.assignee?.full_name || "You"}</strong>
                    </span>

                    <Button variant="ghost" size="xs" className="h-7 text-xs font-semibold text-indigo-500 gap-1 group-hover:translate-x-0.5 transition-transform">
                      <span>Open Work Item</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Canonical Finding Detail Drawer */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onFindingUpdated={handleFindingUpdated}
        organizationId={activeOrgId}
      />
    </div>
  );
}
