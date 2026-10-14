"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserPlus,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  Search,
  Filter,
  Eye,
  Info,
  Clock,
  CheckCircle,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FindingItem } from "@/components/compliance/FindingDetailDrawer";

export interface ActionPlanItem {
  id: string;
  findingId: string;
  findingTitle: string;
  statutoryClause: string;
  recommendedAction: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: string;
  assignedTo?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
  findingItem: FindingItem;
}

interface ActionPlanTabProps {
  actions: ActionPlanItem[];
  onSelectFinding: (finding: FindingItem) => void;
  policyDocumentId?: string;
}

export function ActionPlanTab({
  actions,
  onSelectFinding,
  policyDocumentId,
}: ActionPlanTabProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filteredActions = useMemo(() => {
    return actions.filter((act) => {
      if (priorityFilter !== "ALL" && act.priority !== priorityFilter) return false;
      if (statusFilter !== "ALL") {
        const itemLife = (act.status || "").toUpperCase();
        if (statusFilter === "OPEN" && !["OPEN", "REOPENED"].includes(itemLife)) return false;
        if (statusFilter === "IN_REVIEW" && itemLife !== "IN_REVIEW") return false;
        if (statusFilter === "REMEDIATION" && itemLife !== "REMEDIATION") return false;
        if (statusFilter === "RESOLVED" && itemLife !== "RESOLVED") return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const actionMatch = act.recommendedAction.toLowerCase().includes(q);
        const titleMatch = act.findingTitle.toLowerCase().includes(q);
        const clauseMatch = act.statutoryClause.toLowerCase().includes(q);
        const ownerMatch = (act.assigneeName || "").toLowerCase().includes(q);
        if (!actionMatch && !titleMatch && !clauseMatch && !ownerMatch) return false;
      }

      return true;
    });
  }, [actions, priorityFilter, statusFilter, searchQuery]);

  // Operational metrics
  const openCount = actions.filter((a) => (a.status || "OPEN") === "OPEN").length;
  const inReviewCount = actions.filter((a) => a.status === "IN_REVIEW").length;
  const inRemediationCount = actions.filter((a) => a.status === "REMEDIATION").length;
  const resolvedCount = actions.filter((a) => a.status === "RESOLVED").length;

  return (
    <div className="space-y-4">
      {/* Historical Integrity & Operations Banner */}
      <Card className="p-4 border-border bg-card shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Remediation Action Plan & Operations
            </h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-2xl">
              Recommendations are directly mapped to specific compliance findings. While the compliance audit report remains an immutable point-in-time snapshot, remediation statuses reflect live operational workflows.
            </p>
          </div>
        </div>

        {/* Operational Status Badges */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Badge variant="outline" className="text-xs px-2.5 py-1 bg-rose-500/10 text-rose-500 border-rose-500/30">
            Open: {openCount}
          </Badge>
          <Badge variant="outline" className="text-xs px-2.5 py-1 bg-primary/10 text-primary border-primary/30">
            In Review: {inReviewCount}
          </Badge>
          <Badge variant="outline" className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-500 border-amber-500/30">
            Remediation: {inRemediationCount}
          </Badge>
          <Badge variant="outline" className="text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
            Resolved: {resolvedCount}
          </Badge>
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <Card className="p-4 border-border bg-card shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search remediation actions or findings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-surface-elevated border-border"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="h-9 px-2.5 text-xs bg-surface-elevated border border-border rounded-md text-foreground cursor-pointer focus:ring-1 focus:ring-primary"
              aria-label="Filter by Priority"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-2.5 text-xs bg-surface-elevated border border-border rounded-md text-foreground cursor-pointer focus:ring-1 focus:ring-primary"
              aria-label="Filter by Status"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="REMEDIATION">In Remediation</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Remediation Actions Table */}
      {filteredActions.length === 0 ? (
        <Card className="p-12 text-center border-border bg-card">
          <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
          <h4 className="text-sm font-bold text-foreground">No Remediation Actions Available</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            All statutory requirements are either fully compliant or no actionable recommendations were generated.
          </p>
        </Card>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" role="table">
              <thead className="bg-muted/40 border-b border-border uppercase font-bold text-[10px] text-muted-foreground tracking-wider">
                <tr>
                  <th className="p-3.5 pl-4" scope="col">Finding Ref</th>
                  <th className="p-3.5" scope="col">Recommended Remediation Action</th>
                  <th className="p-3.5" scope="col">Priority</th>
                  <th className="p-3.5" scope="col">Assigned Owner</th>
                  <th className="p-3.5" scope="col">Status</th>
                  <th className="p-3.5 pr-4 text-right" scope="col">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium">
                {filteredActions.map((action) => (
                  <tr
                    key={action.id}
                    onClick={() => onSelectFinding(action.findingItem)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                  >
                    {/* Finding Reference */}
                    <td className="p-3.5 pl-4 max-w-[200px]">
                      <div className="space-y-0.5">
                        <span className="font-mono text-[11px] font-bold text-primary block">
                          #{action.findingId.slice(0, 8)}
                        </span>
                        <span className="text-[10px] text-muted-foreground block truncate" title={action.statutoryClause}>
                          {action.statutoryClause}
                        </span>
                      </div>
                    </td>

                    {/* Recommended Action */}
                    <td className="p-3.5 max-w-md">
                      <p className="text-foreground leading-relaxed font-medium line-clamp-3">
                        {action.recommendedAction}
                      </p>
                    </td>

                    {/* Priority */}
                    <td className="p-3.5 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 uppercase",
                          action.priority === "CRITICAL"
                            ? "bg-rose-600/10 text-rose-600 border-rose-600/30"
                            : action.priority === "HIGH"
                            ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                            : action.priority === "MEDIUM"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                            : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                        )}
                      >
                        {action.priority}
                      </Badge>
                    </td>

                    {/* Owner */}
                    <td className="p-3.5 whitespace-nowrap">
                      {action.assigneeName ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
                            {action.assigneeName.charAt(0)}
                          </div>
                          <span className="text-foreground">{action.assigneeName}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px] italic">Unassigned</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="p-3.5 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5",
                          action.status === "RESOLVED"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                            : action.status === "IN_REVIEW"
                            ? "bg-primary/10 text-primary border-primary/30"
                            : action.status === "REMEDIATION"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                            : "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {action.status || "OPEN"}
                      </Badge>
                    </td>

                    {/* Action Buttons */}
                    <td className="p-3.5 pr-4 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-xs text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" /> View Finding
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
