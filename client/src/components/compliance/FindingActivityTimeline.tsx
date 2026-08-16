"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { format, isToday, isYesterday } from "date-fns";
import {
  History,
  Clock,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserPlus,
  Send,
  SendHorizontal,
  CheckCircle,
  CheckCircle2,
  Check,
  RotateCcw,
  XCircle,
  AlertTriangle,
  MessageSquare,
  FileText,
  Trash2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import {
  findingsService,
  FindingActivity,
  FindingActivityPaginatedResponse,
} from "@/services/api/findings";
import { formatRoleLabel } from "@/utils/role-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FindingActivityTimelineProps {
  findingId: string;
  organizationId?: string | null;
  refreshTrigger?: number;
  onNavigateToSection?: (section: "discussions" | "remediation") => void;
}

type ActivityCategory = "ALL" | "FINDING" | "DISCUSSION" | "REMEDIATION" | "STATUS";

interface DateGroupedActivities {
  dateLabel: string;
  items: FindingActivity[];
}

export const FindingActivityTimeline: React.FC<FindingActivityTimelineProps> = ({
  findingId,
  organizationId,
  refreshTrigger = 0,
  onNavigateToSection,
}) => {
  const [activities, setActivities] = useState<FindingActivity[]>([]);
  const [totalActivities, setTotalActivities] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory>("ALL");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchActivities = useCallback(
    async (targetPage: number, category: ActivityCategory, append: boolean = false) => {
      if (!findingId) return;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const catParam = category === "ALL" ? undefined : category;
        const res: FindingActivityPaginatedResponse = await findingsService.getActivity(findingId, {
          category: catParam,
          page: targetPage,
          limit: 15,
        });

        if (append) {
          setActivities((prev) => [...prev, ...(res.items || [])]);
        } else {
          setActivities(res.items || []);
        }

        setTotalActivities(res.total || 0);
        setHasMore(res.has_more || false);
        setPage(targetPage);
      } catch (err: any) {
        console.error("Error loading finding activity timeline:", err);
        setError("Failed to load activity timeline.");
        if (!append) {
          setActivities([]);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [findingId]
  );

  // Initial and refreshTrigger fetch
  useEffect(() => {
    fetchActivities(1, selectedCategory, false);
  }, [fetchActivities, selectedCategory, refreshTrigger]);

  const handleCategoryChange = (cat: ActivityCategory) => {
    if (cat === selectedCategory) return;
    setSelectedCategory(cat);
    setPage(1);
  };

  const handleLoadMore = () => {
    if (!hasMore || isLoadingMore) return;
    fetchActivities(page + 1, selectedCategory, true);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Group activities chronologically by date in user's local timezone
  const groupedActivities = useMemo<DateGroupedActivities[]>(() => {
    const groups: { [key: string]: FindingActivity[] } = {};
    const groupOrder: string[] = [];

    activities.forEach((act) => {
      const d = new Date(act.created_at);
      let label = "OLDER";
      if (!isNaN(d.getTime())) {
        if (isToday(d)) {
          label = "TODAY";
        } else if (isYesterday(d)) {
          label = "YESTERDAY";
        } else {
          label = format(d, "dd MMM yyyy").toUpperCase();
        }
      }

      if (!groups[label]) {
        groups[label] = [];
        groupOrder.push(label);
      }
      groups[label].push(act);
    });

    return groupOrder.map((dateLabel) => ({
      dateLabel,
      items: groups[dateLabel],
    }));
  }, [activities]);

  const getEventVisuals = (eventType: string) => {
    const et = (eventType || "").toUpperCase();

    if (et === "FINDING_CREATED") {
      return {
        icon: <Sparkles className="h-3.5 w-3.5" />,
        badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
        borderClass: "border-indigo-500/30",
        dotClass: "bg-indigo-500",
      };
    }
    if (et === "FINDING_ASSIGNED") {
      return {
        icon: <UserCheck className="h-3.5 w-3.5" />,
        badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
        borderClass: "border-blue-500/30",
        dotClass: "bg-blue-500",
      };
    }
    if (et === "FINDING_STATUS_CHANGED") {
      return {
        icon: <History className="h-3.5 w-3.5" />,
        badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
        borderClass: "border-amber-500/30",
        dotClass: "bg-amber-500",
      };
    }
    if (et === "FINDING_SUBMITTED_FOR_REVIEW" || et === "REMEDIATION_CYCLE_SUBMITTED" || et === "REMEDIATION_SUBMITTED") {
      return {
        icon: <SendHorizontal className="h-3.5 w-3.5" />,
        badgeClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
        borderClass: "border-sky-500/30",
        dotClass: "bg-sky-500",
      };
    }
    if (et === "FINDING_RESOLVED" || et === "REMEDIATION_APPROVED") {
      return {
        icon: <CheckCircle className="h-3.5 w-3.5" />,
        badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        borderClass: "border-emerald-500/30",
        dotClass: "bg-emerald-500",
      };
    }
    if (et === "REMEDIATION_CYCLE_VERIFIED" || et === "REMEDIATION_VERIFIED") {
      return {
        icon: <Check className="h-3.5 w-3.5" />,
        badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        borderClass: "border-emerald-500/30",
        dotClass: "bg-emerald-500",
      };
    }
    if (et === "FINDING_REOPENED" || et === "REMEDIATION_RETURNED") {
      return {
        icon: <RotateCcw className="h-3.5 w-3.5" />,
        badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
        borderClass: "border-rose-500/30",
        dotClass: "bg-rose-500",
      };
    }
    if (et === "FINDING_REJECTED" || et === "REMEDIATION_CYCLE_REJECTED" || et === "REMEDIATION_REJECTED") {
      return {
        icon: <XCircle className="h-3.5 w-3.5" />,
        badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
        borderClass: "border-rose-500/30",
        dotClass: "bg-rose-500",
      };
    }
    if (et.startsWith("FINDING_COMMENT") || et === "FINDING_MENTIONED") {
      return {
        icon: <MessageSquare className="h-3.5 w-3.5" />,
        badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
        borderClass: "border-indigo-500/30",
        dotClass: "bg-indigo-500",
      };
    }
    if (et === "REMEDIATION_CREATED" || et === "REMEDIATION_STARTED") {
      return {
        icon: <FileText className="h-3.5 w-3.5" />,
        badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
        borderClass: "border-purple-500/30",
        dotClass: "bg-purple-500",
      };
    }
    if (et === "REMEDIATION_EVIDENCE_UPLOADED") {
      return {
        icon: <FileText className="h-3.5 w-3.5" />,
        badgeClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30",
        borderClass: "border-teal-500/30",
        dotClass: "bg-teal-500",
      };
    }
    if (et === "REMEDIATION_EVIDENCE_DELETED") {
      return {
        icon: <Trash2 className="h-3.5 w-3.5" />,
        badgeClass: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
        borderClass: "border-slate-500/30",
        dotClass: "bg-slate-500",
      };
    }

    return {
      icon: <Clock className="h-3.5 w-3.5" />,
      badgeClass: "bg-muted text-muted-foreground border-border/40",
      borderClass: "border-border/40",
      dotClass: "bg-muted-foreground",
    };
  };

  return (
    <Card className="border border-border/60 bg-card p-4 space-y-4 shadow-2xs">
      {/* Header with Title, Count, & Refresh Action */}
      <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            <History className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Activity & Audit Trail
              </span>
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {totalActivities}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Traceable chronological history of all lifecycle, discussion, and remediation events.
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => fetchActivities(1, selectedCategory, false)}
          disabled={isLoading}
          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Refresh activity timeline"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin text-indigo-500")} />
        </Button>
      </div>

      {/* Lightweight Category Filter Pills */}
      <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/40 overflow-x-auto">
        {(["ALL", "FINDING", "DISCUSSION", "REMEDIATION", "STATUS"] as ActivityCategory[]).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => handleCategoryChange(cat)}
            className={cn(
              "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap capitalize",
              selectedCategory === cat
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {cat === "ALL" ? "All Activity" : cat.charAt(0) + cat.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="space-y-3 py-4">
          <div className="h-4 bg-muted/40 rounded-md w-24 animate-pulse" />
          <div className="space-y-2 pl-4 border-l-2 border-border/40">
            <div className="h-14 bg-muted/20 rounded-xl border border-border/30 animate-pulse" />
            <div className="h-14 bg-muted/20 rounded-xl border border-border/30 animate-pulse" />
          </div>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center space-y-2">
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>
          <Button
            size="xs"
            variant="outline"
            onClick={() => fetchActivities(1, selectedCategory, false)}
            className="text-xs cursor-pointer"
          >
            Retry
          </Button>
        </div>
      ) : activities.length === 0 ? (
        <div className="p-6 text-center rounded-xl bg-muted/10 border border-dashed border-border/60 space-y-1.5">
          <Clock className="h-6 w-6 text-muted-foreground mx-auto" />
          <p className="text-xs font-semibold text-foreground">No activity recorded.</p>
          <p className="text-[11px] text-muted-foreground">
            {selectedCategory !== "ALL"
              ? `No ${selectedCategory.toLowerCase()} events recorded for this finding yet.`
              : "All finding actions and audit events will appear here in chronological order."}
          </p>
        </div>
      ) : (
        <div className="space-y-6 pt-1">
          {groupedActivities.map((group) => (
            <div key={group.dateLabel} className="space-y-3">
              {/* Date Group Heading Badge */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold font-mono tracking-wider px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/40">
                  {group.dateLabel}
                </span>
                <div className="h-px bg-border/40 flex-1" />
              </div>

              {/* Activity Items in Group */}
              <div className="space-y-3 pl-3 border-l-2 border-indigo-500/20">
                {group.items.map((act) => {
                  const visuals = getEventVisuals(act.event_type);
                  const isExpanded = expandedIds.has(act.id);
                  const meta = act.metadata || {};
                  const hasExpandableContent =
                    meta.old_status ||
                    meta.new_status ||
                    meta.submission_note ||
                    meta.verification_note ||
                    meta.rejection_reason ||
                    meta.reason ||
                    meta.admin_note ||
                    meta.resolution_note ||
                    meta.cycle_number ||
                    meta.filename;

                  const actorName = act.actor?.full_name || act.user_name || "System";
                  const actorRole = act.actor?.role;

                  return (
                    <div
                      key={act.id}
                      className={cn(
                        "group relative rounded-xl border bg-card/60 p-3 text-xs transition-all hover:bg-card hover:shadow-xs",
                        visuals.borderClass
                      )}
                    >
                      {/* Timeline Node Dot */}
                      <div
                        className={cn(
                          "absolute -left-[19px] top-3.5 h-2.5 w-2.5 rounded-full ring-4 ring-card",
                          visuals.dotClass
                        )}
                      />

                      {/* Card Header: Icon, Event Title, Actor, Role, Time */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <div className={cn("p-1 rounded-md border shrink-0", visuals.badgeClass)}>
                            {visuals.icon}
                          </div>
                          <span className="font-bold text-foreground truncate">{act.title}</span>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>by</span>
                            <span className="font-semibold text-foreground/90">{actorName}</span>
                            {actorRole && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium shrink-0">
                                {formatRoleLabel(actorRole)}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                          {format(new Date(act.created_at), "HH:mm")}
                        </span>
                      </div>

                      {/* Description */}
                      {act.description && (
                        <p className="text-muted-foreground text-[11px] leading-relaxed mt-1.5">
                          {act.description}
                        </p>
                      )}

                      {/* Expandable Details Container */}
                      {hasExpandableContent && (
                        <div className="mt-2 pt-2 border-t border-border/30">
                          <button
                            type="button"
                            onClick={() => toggleExpand(act.id)}
                            className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            <span>{isExpanded ? "Hide Details" : "View Audit Details"}</span>
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-2 pt-1">
                              {/* Status Transition Pill */}
                              {meta.old_status && meta.new_status && (
                                <div className="flex items-center gap-2 text-[11px] bg-muted/40 p-2 rounded-lg border border-border/40">
                                  <span className="text-muted-foreground font-medium">Status Change:</span>
                                  <Badge variant="outline" className="text-[10px] font-mono">
                                    {meta.old_status}
                                  </Badge>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                  <Badge variant="outline" className="text-[10px] font-mono font-bold text-foreground">
                                    {meta.new_status}
                                  </Badge>
                                </div>
                              )}

                              {/* Remediation Cycle Badge */}
                              {meta.cycle_number && (
                                <div className="flex items-center justify-between gap-2 text-[11px] bg-muted/30 p-2 rounded-lg border border-border/30">
                                  <span className="text-muted-foreground font-medium">Remediation Cycle:</span>
                                  <Badge variant="outline" className="text-[10px] font-bold bg-sky-500/10 text-sky-600 border-sky-500/30">
                                    Cycle {meta.cycle_number}
                                  </Badge>
                                </div>
                              )}

                              {/* Submission Note */}
                              {meta.submission_note && (
                                <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[11px] space-y-0.5">
                                  <span className="font-bold text-sky-600 dark:text-sky-400 block text-[9px] uppercase tracking-wider">
                                    Submission Note
                                  </span>
                                  <p className="text-foreground leading-relaxed">{meta.submission_note}</p>
                                </div>
                              )}

                              {/* Rejection Reason */}
                              {(meta.rejection_reason || meta.reason) && act.event_type.includes("REJECT") && (
                                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] space-y-0.5">
                                  <span className="font-bold text-rose-600 dark:text-rose-400 block text-[9px] uppercase tracking-wider flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Rejection Rationale
                                  </span>
                                  <p className="text-foreground leading-relaxed">{meta.rejection_reason || meta.reason}</p>
                                </div>
                              )}

                              {/* Verification Note */}
                              {meta.verification_note && (
                                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] space-y-0.5">
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400 block text-[9px] uppercase tracking-wider flex items-center gap-1">
                                    <Check className="h-3 w-3" /> Verification Note
                                  </span>
                                  <p className="text-foreground leading-relaxed">{meta.verification_note}</p>
                                </div>
                              )}

                              {/* Admin Note / Resolution Note */}
                              {(meta.admin_note || meta.resolution_note) && (
                                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] space-y-0.5">
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400 block text-[9px] uppercase tracking-wider">
                                    Administrator Rationale
                                  </span>
                                  <p className="text-foreground leading-relaxed">{meta.admin_note || meta.resolution_note}</p>
                                </div>
                              )}

                              {/* Evidence Filename */}
                              {meta.filename && (
                                <div className="flex items-center justify-between gap-2 text-[11px] bg-muted/30 p-2 rounded-lg border border-border/30">
                                  <span className="text-muted-foreground font-medium">Evidence File:</span>
                                  <span className="font-mono font-semibold text-foreground">{meta.filename}</span>
                                </div>
                              )}

                              {/* Contextual Jump Navigation */}
                              {onNavigateToSection && (
                                <div className="flex items-center gap-2 pt-1">
                                  {act.category === "REMEDIATION" && (
                                    <button
                                      type="button"
                                      onClick={() => onNavigateToSection("remediation")}
                                      className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>[View Remediation / Cycles]</span>
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                  {act.category === "DISCUSSION" && (
                                    <button
                                      type="button"
                                      onClick={() => onNavigateToSection("discussions")}
                                      className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>[View Discussion]</span>
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load More Button */}
          {hasMore && (
            <div className="pt-2 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="w-full text-xs font-semibold cursor-pointer border-border/60 hover:bg-muted/30"
              >
                {isLoadingMore ? "Loading more activity..." : `Load More Activity (${activities.length} of ${totalActivities})`}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
