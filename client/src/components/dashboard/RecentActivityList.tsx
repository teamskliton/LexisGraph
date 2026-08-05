"use client";

import React from "react";
import { format, isToday, isYesterday } from "date-fns";
import { ActivityItem } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  FileText,
  FileCheck,
  Download,
  Activity,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RecentActivityListProps {
  activities: ActivityItem[];
  isLoading: boolean;
}

interface ActivityGroup {
  label: string;
  items: ActivityItem[];
}

// ─── Icon registry ────────────────────────────────────────────────────────────

const iconMap: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
  building: {
    icon: <Building2 className="h-3.5 w-3.5" />,
    bg: "bg-indigo-500/10",
    color: "text-indigo-600 dark:text-indigo-400",
  },
  file: {
    icon: <FileText className="h-3.5 w-3.5" />,
    bg: "bg-violet-500/10",
    color: "text-violet-600 dark:text-violet-400",
  },
  report: {
    icon: <FileCheck className="h-3.5 w-3.5" />,
    bg: "bg-emerald-500/10",
    color: "text-emerald-600 dark:text-emerald-400",
  },
  download: {
    icon: <Download className="h-3.5 w-3.5" />,
    bg: "bg-blue-500/10",
    color: "text-blue-600 dark:text-blue-400",
  },
};

const getActivityMeta = (iconType: string) =>
  iconMap[iconType] ?? {
    icon: <Activity className="h-3.5 w-3.5" />,
    bg: "bg-amber-500/10",
    color: "text-amber-600 dark:text-amber-400",
  };

// ─── Date grouping ────────────────────────────────────────────────────────────

function groupActivities(activities: ActivityItem[]): ActivityGroup[] {
  const groups = new Map<string, ActivityItem[]>();

  for (const item of activities) {
    if (!item.timestamp) continue;
    let date: Date;
    try {
      date = new Date(item.timestamp);
      if (isNaN(date.getTime())) continue;
    } catch {
      continue;
    }

    let label: string;
    if (isToday(date)) label = "Today";
    else if (isYesterday(date)) label = "Yesterday";
    else label = format(date, "MMM d, yyyy");

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function formatEventTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? "" : format(d, "h:mm a");
  } catch {
    return "";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export const RecentActivityList: React.FC<RecentActivityListProps> = ({
  activities,
  isLoading,
}) => {
  const groups = groupActivities(activities);

  return (
    <Card className="flex flex-col">
      {/* Header */}
      <CardHeader className="pb-3 border-b border-border/40 px-5 pt-5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Activity className="h-4 w-4" />
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Activity Timeline
            </CardTitle>
          </div>
          {/* Live pill */}
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-4 flex-1">
        {/* Loading */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
                <div className="space-y-1.5 flex-1 pt-0.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <Skeleton className="h-3 w-12 shrink-0" />
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-1">
              <Inbox className="h-5 w-5 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No activity recorded yet
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-[240px]">
              System events appear here as you create organizations, upload
              policies, and run compliance analyses.
            </p>
          </div>
        ) : (
          /* Timeline */
          <div className="max-h-[380px] overflow-y-auto pr-0.5 custom-scrollbar">
            {groups.map((group) => (
              <div key={group.label} className="mb-5 last:mb-0">
                {/* Date group header */}
                <div className="flex items-center gap-2 mb-3 sticky top-0 z-10 bg-card py-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>

                {/* Timeline items */}
                {group.items.map((item, index) => {
                  const { icon, bg, color } = getActivityMeta(item.icon_type);
                  const isLast = index === group.items.length - 1;
                  const timeStr = item.timestamp
                    ? formatEventTime(item.timestamp)
                    : "";

                  return (
                    <div key={item.id} className="flex gap-0">
                      {/* Left column: icon + connector line */}
                      <div className="flex flex-col items-center mr-3 shrink-0 w-7">
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg shrink-0 relative z-10",
                            bg,
                            color
                          )}
                        >
                          {icon}
                        </div>
                        {/* Vertical connector — hidden on last item */}
                        {!isLast && (
                          <div className="w-px flex-1 min-h-[14px] bg-border/30 mt-1 mb-1" />
                        )}
                      </div>

                      {/* Right column: content */}
                      <div
                        className={cn(
                          "flex min-w-0 flex-1 items-start justify-between gap-3",
                          !isLast ? "pb-3" : "pb-0"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground leading-snug">
                            {item.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                            {item.description}
                          </p>
                        </div>
                        {timeStr && (
                          <span className="shrink-0 text-[10px] font-medium text-muted-foreground/60 whitespace-nowrap tabular-nums mt-0.5">
                            {timeStr}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentActivityList;
