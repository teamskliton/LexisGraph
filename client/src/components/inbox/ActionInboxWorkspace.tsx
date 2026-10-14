"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNowStrict, isPast } from "date-fns";
import {
  Inbox,
  CheckCircle2,
  Clock,
  ShieldAlert,
  SendHorizontal,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  Building2,
  Sparkles,
  Calendar,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import { inboxService, InboxItem, InboxCounts } from "@/services/api/inbox";
import { organizationsService, Organization } from "@/services/api/organizations";
import { FindingDetailDrawer, FindingItem } from "@/components/compliance/FindingDetailDrawer";
import { findingsService } from "@/services/api/findings";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type InboxTab = "needs_action" | "mentions" | "updates" | "done";

export function ActionInboxWorkspace() {
  const router = useRouter();
  const { user } = useAuth();

  const [activeOrgId, setActiveOrgId] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_organization_id") || undefined;
    }
    return undefined;
  });

  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [activeTab, setActiveTab] = useState<InboxTab>("needs_action");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [counts, setCounts] = useState<InboxCounts>({
    action_required_count: 0,
    mentions_count: 0,
    updates_count: 0,
    total_pending_count: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick Finding Drawer Inspection
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sync active organization
  useEffect(() => {
    const handleOrgChange = () => {
      if (typeof window !== "undefined") {
        const storedId = localStorage.getItem("selected_organization_id");
        if (storedId) setActiveOrgId(storedId);
      }
    };
    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, []);

  // Fetch current organization details for context display
  useEffect(() => {
    if (activeOrgId) {
      organizationsService
        .getOrganizationById(activeOrgId)
        .then((org: Organization) => setCurrentOrg(org))
        .catch(() => setCurrentOrg(null));
    }
  }, [activeOrgId]);

  // Fetch counts
  const fetchCounts = useCallback(async () => {
    try {
      const data = await inboxService.getInboxCounts(activeOrgId);
      setCounts(data);
    } catch (err) {
      console.warn("Failed loading inbox counts:", err);
    }
  }, [activeOrgId]);

  // Fetch items for active tab
  const fetchInboxItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await inboxService.getInboxItems(activeOrgId, {
        tab: activeTab,
        limit: 50,
      });
      setItems(data || []);
      fetchCounts();
    } catch (err: any) {
      console.error("Failed loading inbox items:", err);
      const rawDetail = err?.response?.data?.detail || "Failed to load inbox tasks.";
      setError(typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail));
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, activeTab, fetchCounts]);

  useEffect(() => {
    fetchInboxItems();
  }, [fetchInboxItems]);

  const handleCompleteItem = async (e: React.MouseEvent, item: InboxItem) => {
    e.stopPropagation();
    try {
      await inboxService.completeItem(item.id);
      setItems((prev) =>
        activeTab === "done"
          ? prev.map((i) => (i.id === item.id ? { ...i, status: "COMPLETED" } : i))
          : prev.filter((i) => i.id !== item.id)
      );
      fetchCounts();
      toast.success("Task marked as completed.");
    } catch (err) {
      toast.error("Failed to complete task.");
    }
  };

  const handleDismissItem = async (e: React.MouseEvent, item: InboxItem) => {
    e.stopPropagation();
    try {
      await inboxService.dismissItem(item.id);
      setItems((prev) =>
        activeTab === "done"
          ? prev.map((i) => (i.id === item.id ? { ...i, status: "DISMISSED" } : i))
          : prev.filter((i) => i.id !== item.id)
      );
      fetchCounts();
      toast.success("Task dismissed from inbox.");
    } catch (err) {
      toast.error("Failed to dismiss task.");
    }
  };

  const handleOpenItem = async (item: InboxItem) => {
    if (!item.is_read) {
      try {
        await inboxService.markAsRead(item.id);
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, is_read: true } : i))
        );
      } catch (err) {
        console.warn("Failed marking read:", err);
      }
    }

    if (item.entity_type === "FINDING" && item.entity_id) {
      try {
        const findingData = await findingsService.getFinding(item.entity_id);
        if (findingData) {
          const findingItem: FindingItem = {
            id: findingData.id,
            report_id: findingData.report_id,
            organization_id: findingData.organization_id || activeOrgId,
            policy_clause_id: findingData.policy_clause_id,
            regulation_clause_id: findingData.regulation_clause_id,
            status: findingData.status,
            severity: findingData.severity,
            confidence: findingData.confidence,
            reasoning: findingData.reasoning,
            recommendation: findingData.recommendation,
            lifecycle_status: findingData.lifecycle_status,
            assigned_to: findingData.assigned_to,
            assignee: findingData.assignee,
            remediation_due_date: findingData.remediation_due_date,
            is_overdue: findingData.is_overdue,
            created_at: findingData.created_at,
            updated_at: findingData.updated_at,
          };
          setSelectedFinding(findingItem);
          setIsDrawerOpen(true);
          return;
        }
      } catch {
        // Fallback to route push
      }
      router.push(`/findings/${item.entity_id}`);
    } else if (item.entity_type === "REPORT" && item.entity_id) {
      router.push(`/reports/${item.entity_id}`);
    }
  };

  const getPriorityBadge = (priority: string) => {
    const p = (priority || "MEDIUM").toUpperCase();
    if (p === "CRITICAL") {
      return (
        <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] font-bold">
          Critical Priority
        </Badge>
      );
    }
    if (p === "HIGH") {
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-bold">
          High Priority
        </Badge>
      );
    }
    if (p === "LOW") {
      return (
        <Badge variant="outline" className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30 text-[10px] font-semibold">
          Low Priority
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-semibold">
        Medium Priority
      </Badge>
    );
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "REMEDIATION_REQUIRED":
        return <ShieldAlert className="h-4 w-4 text-amber-500" />;
      case "REVIEW_REQUESTED":
        return <SendHorizontal className="h-4 w-4 text-sky-500" />;
      case "CLARIFICATION_REQUESTED":
      case "MENTION_RESPONSE":
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case "DEADLINE_APPROACHING":
        return <Clock className="h-4 w-4 text-rose-500" />;
      default:
        return <Inbox className="h-4 w-4 text-primary" />;
    }
  };

  const getPrimaryActionLabel = (actionType: string) => {
    switch (actionType) {
      case "REMEDIATION_REQUIRED":
        return "Remediate Finding";
      case "REVIEW_REQUESTED":
        return "Review Finding";
      case "MENTION_RESPONSE":
        return "Reply in Discussion";
      case "CLARIFICATION_REQUESTED":
        return "Provide Clarification";
      default:
        return "Take Action";
    }
  };

  const getRelativeTime = (created_at: string) => {
    try {
      return formatDistanceToNowStrict(new Date(created_at), { addSuffix: true });
    } catch {
      return "recently";
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 space-y-6">
      {/* Header Bar */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Inbox className="h-5 w-5 text-primary" /> Inbox
              </h1>
              {currentOrg && (
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs font-semibold gap-1">
                  <Building2 className="h-3 w-3" />
                  <span>{currentOrg.name}</span>
                </Badge>
              )}
              {counts.total_pending_count > 0 && (
                <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-xs font-bold">
                  {counts.total_pending_count} Actionable
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review tasks, requests, and compliance work requiring your attention.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchInboxItems}
              disabled={isLoading}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 space-y-5">
        {/* Inbox Navigation Tabs */}
        <Card className="border border-border/50 bg-card p-1.5 shadow-2xs">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab("needs_action")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer",
                activeTab === "needs_action"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <span>Needs Action</span>
              {counts.action_required_count > 0 && (
                <span className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums",
                  activeTab === "needs_action" ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                )}>
                  {counts.action_required_count}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("mentions")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer",
                activeTab === "mentions"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <span>Mentions</span>
              {counts.mentions_count > 0 && (
                <span className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums",
                  activeTab === "mentions" ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                )}>
                  {counts.mentions_count}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("updates")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer",
                activeTab === "updates"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <span>Updates</span>
              {counts.updates_count > 0 && (
                <span className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums",
                  activeTab === "updates" ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                )}>
                  {counts.updates_count}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("done")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ml-auto",
                activeTab === "done"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Done</span>
            </button>
          </div>
        </Card>

        {/* Task Items List */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : error ? (
          <Card className="border border-rose-500/30 bg-rose-500/5 p-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
            <h3 className="text-sm font-semibold text-foreground">Unable to load tasks.</h3>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button size="sm" onClick={fetchInboxItems} className="cursor-pointer text-xs font-semibold gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </Card>
        ) : items.length === 0 ? (
          <Card className="border border-dashed border-border/60 bg-muted/10 p-12 text-center space-y-3">
            <Inbox className="h-9 w-9 text-muted-foreground opacity-40 mx-auto" />
            <h3 className="text-sm font-bold text-foreground">
              {activeTab === "needs_action"
                ? "Nothing needs your attention right now."
                : activeTab === "mentions"
                ? "No mentions yet."
                : activeTab === "updates"
                ? "No updates yet."
                : "No completed tasks yet."}
            </h3>
            <p className="text-xs text-muted-foreground">
              {activeTab === "needs_action"
                ? "When compliance findings or reviews are assigned to you, they will appear here."
                : activeTab === "mentions"
                ? "When team members mention you in finding discussions, you will be notified here."
                : activeTab === "updates"
                ? "Recent status updates on items you follow will be listed here."
                : "Tasks you have completed or dismissed will appear in this history tab."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => {
              const isOverdue = item.due_at && isPast(new Date(item.due_at)) && item.status === "PENDING";
              return (
                <Card
                  key={item.id}
                  onClick={() => handleOpenItem(item)}
                  className={cn(
                    "border transition-all cursor-pointer p-4 group shadow-2xs hover:border-primary/40",
                    item.status === "COMPLETED"
                      ? "opacity-75 bg-muted/20 border-border/50"
                      : !item.is_read
                      ? "border-primary/40 bg-card hover:bg-muted/30"
                      : "border-border/60 bg-card hover:bg-muted/30"
                  )}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Main Task Description */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="p-2 rounded-xl bg-muted/50 border border-border/40 shrink-0 mt-0.5">
                        {getActionIcon(item.action_type)}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={cn("text-xs leading-snug", !item.is_read ? "font-bold text-foreground" : "font-semibold text-foreground/90")}>
                            {item.title}
                          </h3>
                          {getPriorityBadge(item.priority)}
                          {item.entity_id && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-primary border-primary/20 bg-primary/5">
                              {item.entity_type} #{item.entity_id.slice(0, 8)}
                            </Badge>
                          )}
                          {isOverdue && (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[9px] font-bold gap-1">
                              <AlertTriangle className="h-3 w-3" /> Overdue
                            </Badge>
                          )}
                          {item.status === "COMPLETED" && (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] font-semibold gap-1">
                              <Check className="h-3 w-3" /> Done
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {item.description}
                        </p>

                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-medium pt-0.5 flex-wrap">
                          <span>Created {getRelativeTime(item.created_at)}</span>
                          {item.due_at && (
                            <span className={cn("flex items-center gap-1", isOverdue && "text-rose-500 font-bold")}>
                              <Calendar className="h-3 w-3" />
                              Due: {format(new Date(item.due_at), "MMM d, yyyy")}
                            </span>
                          )}
                          {item.completed_at && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Completed: {format(new Date(item.completed_at), "MMM d, HH:mm")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Contextual Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      {item.status === "PENDING" && (
                        <>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenItem(item);
                            }}
                            className="h-8 text-xs font-semibold gap-1 bg-primary hover:bg-primary-hover text-primary-foreground cursor-pointer"
                          >
                            <span>{getPrimaryActionLabel(item.action_type)}</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => handleCompleteItem(e, item)}
                            className="h-8 text-xs font-semibold gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                            title="Mark as Completed"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Done</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleDismissItem(e, item)}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-2"
                            title="Dismiss task"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}

                      {item.status !== "PENDING" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenItem(item)}
                          className="h-8 text-xs font-semibold text-primary gap-1 cursor-pointer"
                        >
                          <span>Inspect Item</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Inspection Drawer */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onFindingUpdated={() => fetchInboxItems()}
        organizationId={activeOrgId}
      />
    </div>
  );
}
