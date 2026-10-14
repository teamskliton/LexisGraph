"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  Eye,
  SlidersHorizontal,
  X,
  FileText,
  User as UserIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FindingItem } from "@/components/compliance/FindingDetailDrawer";

interface FindingsTabProps {
  findings: FindingItem[];
  initialSeverityFilter?: string;
  onSelectFinding: (finding: FindingItem) => void;
}

export function FindingsTab({
  findings,
  initialSeverityFilter = "ALL",
  onSelectFinding,
}: FindingsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>(initialSeverityFilter);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [ownerFilter, setOwnerFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("severity_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Synchronize when initialSeverityFilter changes from parent (e.g. clicking risk bar)
  React.useEffect(() => {
    if (initialSeverityFilter && initialSeverityFilter !== "ALL") {
      setSeverityFilter(initialSeverityFilter);
      setCurrentPage(1);
    }
  }, [initialSeverityFilter]);

  // Multi-Filter & Search
  const filteredFindings = useMemo(() => {
    return findings.filter((item) => {
      // Severity filter
      if (severityFilter !== "ALL") {
        if (severityFilter === "CRITICAL" && item.severity !== "CRITICAL") return false;
        if (severityFilter === "HIGH" && item.severity !== "HIGH") return false;
        if (severityFilter === "MEDIUM" && item.severity !== "MEDIUM") return false;
        if (severityFilter === "LOW" && item.severity !== "LOW") return false;
      }

      // Lifecycle / Status filter
      if (statusFilter !== "ALL") {
        const itemLife = (item.lifecycle_status || "").toUpperCase();
        const itemStatus = (item.status || "").toUpperCase();
        if (statusFilter === "OPEN" && !["OPEN", "REOPENED"].includes(itemLife)) return false;
        if (statusFilter === "IN_REVIEW" && itemLife !== "IN_REVIEW") return false;
        if (statusFilter === "REMEDIATION" && itemLife !== "REMEDIATION") return false;
        if (statusFilter === "RESOLVED" && itemLife !== "RESOLVED") return false;
        if (statusFilter === "COMPLIANT" && itemStatus !== "COMPLIANT") return false;
      }

      // Owner filter
      if (ownerFilter !== "ALL") {
        if (ownerFilter === "UNASSIGNED" && item.assigned_to) return false;
        if (ownerFilter === "ASSIGNED" && !item.assigned_to) return false;
      }

      // Search query across ID, regulation, clause, reasoning, policy
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const idMatch = item.id.toLowerCase().includes(query);
        const clauseMatch = (item.regulation_clause_id || "").toLowerCase().includes(query);
        const policyClauseMatch = (item.policy_clause_id || "").toLowerCase().includes(query);
        const reasoningMatch = (item.reasoning || "").toLowerCase().includes(query);
        const citationMatch = (item.citation || "").toLowerCase().includes(query);
        const policyTextMatch = (item.matched_policy_text || "").toLowerCase().includes(query);
        const ownerMatch = (item.assignee?.full_name || "").toLowerCase().includes(query);

        if (
          !idMatch &&
          !clauseMatch &&
          !policyClauseMatch &&
          !reasoningMatch &&
          !citationMatch &&
          !policyTextMatch &&
          !ownerMatch
        ) {
          return false;
        }
      }

      return true;
    });
  }, [findings, severityFilter, statusFilter, ownerFilter, searchQuery]);

  // Sorting logic
  const sortedFindings = useMemo(() => {
    const list = [...filteredFindings];
    const severityRank: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    list.sort((a, b) => {
      if (sortBy === "severity_desc") {
        const diff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
        if (diff !== 0) return diff;
        return (a.regulation_clause_id || "").localeCompare(b.regulation_clause_id || "");
      }
      if (sortBy === "severity_asc") {
        const diff = (severityRank[a.severity] || 0) - (severityRank[b.severity] || 0);
        if (diff !== 0) return diff;
        return (a.regulation_clause_id || "").localeCompare(b.regulation_clause_id || "");
      }
      if (sortBy === "clause_id") {
        return (a.regulation_clause_id || "").localeCompare(b.regulation_clause_id || "");
      }
      if (sortBy === "confidence") {
        return (b.confidence || 0) - (a.confidence || 0);
      }
      return 0;
    });

    return list;
  }, [filteredFindings, sortBy]);

  // Pagination
  const totalItems = sortedFindings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedFindings = sortedFindings.slice(startIndex, startIndex + pageSize);

  const handleResetFilters = () => {
    setSearchQuery("");
    setSeverityFilter("ALL");
    setStatusFilter("ALL");
    setOwnerFilter("ALL");
    setSortBy("severity_desc");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    severityFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    ownerFilter !== "ALL" ||
    sortBy !== "severity_desc";

  return (
    <div className="space-y-4">
      {/* ── Filters & Controls Bar ── */}
      <Card className="p-4 border-border bg-card shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search findings, clauses, or regulations..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 h-9 text-xs bg-surface-elevated border-border"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-surface-elevated border border-border rounded-md text-foreground cursor-pointer focus:ring-1 focus:ring-primary"
              aria-label="Filter by Severity"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            {/* Lifecycle Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-surface-elevated border border-border rounded-md text-foreground cursor-pointer focus:ring-1 focus:ring-primary"
              aria-label="Filter by Status"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open Gaps</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="REMEDIATION">In Remediation</option>
              <option value="RESOLVED">Resolved</option>
              <option value="COMPLIANT">Fully Compliant</option>
            </select>

            {/* Owner Filter */}
            <select
              value={ownerFilter}
              onChange={(e) => {
                setOwnerFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-surface-elevated border border-border rounded-md text-foreground cursor-pointer focus:ring-1 focus:ring-primary"
              aria-label="Filter by Ownership"
            >
              <option value="ALL">All Owners</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="UNASSIGNED">Unassigned</option>
            </select>

            {/* Sort Order */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 px-2.5 text-xs bg-surface-elevated border border-border rounded-md text-foreground cursor-pointer focus:ring-1 focus:ring-primary"
              aria-label="Sort findings"
            >
              <option value="severity_desc">Highest Severity First</option>
              <option value="severity_asc">Lowest Severity First</option>
              <option value="clause_id">Clause Identifier (A–Z)</option>
              <option value="confidence">Confidence Score</option>
            </select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Results Count Header */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
          <span>
            Showing <strong className="text-foreground">{totalItems === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, totalItems)}</strong> of <strong className="text-foreground">{totalItems}</strong> matching findings
          </span>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-6 text-[11px] bg-transparent border border-border rounded px-1 text-foreground cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </Card>

      {/* ── Table Container ── */}
      {paginatedFindings.length === 0 ? (
        <Card className="p-12 text-center border-border bg-card">
          <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
          <h4 className="text-sm font-bold text-foreground">No Compliance Findings Found</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {hasActiveFilters
              ? "No findings match your current filter and search query. Try clearing filters."
              : "No compliance findings were generated for this assessment."}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="mt-4 text-xs cursor-pointer"
            >
              Clear all filters
            </Button>
          )}
        </Card>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs" role="table">
              <thead className="bg-muted/40 border-b border-border uppercase font-bold text-[10px] text-muted-foreground tracking-wider">
                <tr>
                  <th className="p-3.5 pl-4" scope="col">Finding</th>
                  <th className="p-3.5" scope="col">Statutory Reference</th>
                  <th className="p-3.5" scope="col">Severity</th>
                  <th className="p-3.5" scope="col">Lifecycle Status</th>
                  <th className="p-3.5" scope="col">Owner</th>
                  <th className="p-3.5 pr-4 text-right" scope="col">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium">
                {paginatedFindings.map((finding) => (
                  <tr
                    key={finding.id}
                    onClick={() => onSelectFinding(finding)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                  >
                    {/* Finding Info */}
                    <td className="p-3.5 pl-4 max-w-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold text-primary">
                            #{finding.id.slice(0, 8)}
                          </span>
                        </div>
                        <p className="text-foreground font-semibold line-clamp-2 leading-relaxed">
                          {finding.reasoning || finding.citation || "Statutory clause compliance gap"}
                        </p>
                      </div>
                    </td>

                    {/* Statutory Reference */}
                    <td className="p-3.5 max-w-[200px]">
                      <div className="space-y-0.5">
                        <span className="text-foreground font-mono text-[11px] block truncate" title={finding.regulation_clause_id || ""}>
                          {finding.regulation_clause_id || "Statutory Mandate"}
                        </span>
                        {finding.citation && (
                          <span className="text-[10px] text-muted-foreground block line-clamp-1">
                            {finding.citation}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Severity */}
                    <td className="p-3.5 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 uppercase",
                          finding.severity === "CRITICAL"
                            ? "bg-rose-600/10 text-rose-600 border-rose-600/30"
                            : finding.severity === "HIGH"
                            ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                            : finding.severity === "MEDIUM"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                            : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                        )}
                      >
                        {finding.severity}
                      </Badge>
                    </td>

                    {/* Status */}
                    <td className="p-3.5 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5",
                          (finding.lifecycle_status || "OPEN") === "RESOLVED"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                            : (finding.lifecycle_status || "OPEN") === "IN_REVIEW"
                            ? "bg-primary/10 text-primary border-primary/30"
                            : (finding.lifecycle_status || "OPEN") === "REMEDIATION"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                            : "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {finding.lifecycle_status || "OPEN"}
                      </Badge>
                    </td>

                    {/* Owner */}
                    <td className="p-3.5 whitespace-nowrap">
                      {finding.assignee ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
                            {finding.assignee.full_name?.charAt(0) || "U"}
                          </div>
                          <span className="text-foreground">{finding.assignee.full_name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px] italic">Unassigned</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="p-3.5 pr-4 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-xs text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="divide-y divide-border/40 md:hidden">
            {paginatedFindings.map((finding) => (
              <div
                key={finding.id}
                onClick={() => onSelectFinding(finding)}
                className="p-4 space-y-2.5 hover:bg-muted/20 transition-colors cursor-pointer text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-primary">#{finding.id.slice(0, 8)}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-bold px-1.5 py-0 uppercase",
                        finding.severity === "CRITICAL" || finding.severity === "HIGH"
                          ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                      )}
                    >
                      {finding.severity}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                      {finding.lifecycle_status || "OPEN"}
                    </Badge>
                  </div>
                </div>

                <p className="text-foreground font-semibold line-clamp-2">
                  {finding.reasoning || finding.citation || "Statutory clause gap"}
                </p>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                  <span>Clause: {finding.regulation_clause_id || "Statutory"}</span>
                  <span>{finding.assignee?.full_name || "Unassigned"}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-3.5 bg-muted/20 border-t border-border flex items-center justify-between gap-2 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 text-xs cursor-pointer gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>

              <span className="text-muted-foreground">
                Page <strong className="text-foreground">{currentPage}</strong> of <strong className="text-foreground">{totalPages}</strong>
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 text-xs cursor-pointer gap-1"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
