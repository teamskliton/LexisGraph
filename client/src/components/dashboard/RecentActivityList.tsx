"use client";

import React from "react";
import { formatDistanceToNow } from "date-fns";
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

// Icon containers with per-type colored backgrounds
const iconMap: Record<
  string,
  { icon: React.ReactNode; bg: string; color: string }
> = {
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

export const RecentActivityList: React.FC<RecentActivityListProps> = ({
  activities,
  isLoading,
}) => {
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
              Recent System Activity
            </CardTitle>
          </div>
          {/* "Live Feed" pill badge */}
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-4 flex-1">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <Skeleton className="h-3 w-16 shrink-0" />
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-1">
              <Inbox className="h-5 w-5 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No recent activities yet
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              Activities appear automatically as you create organizations,
              upload documents, or run reports.
            </p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[340px] overflow-y-auto pr-0.5 custom-scrollbar">
            {activities.map((item) => {
              const { icon, bg, color } = getActivityMeta(item.icon_type);
              const timeAgo = item.timestamp
                ? formatDistanceToNow(new Date(item.timestamp), {
                    addSuffix: true,
                  })
                : "just now";

              return (
                <div
                  key={item.id}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg px-2 py-2.5",
                    "transition-colors duration-100 hover:bg-muted/40"
                  )}
                >
                  {/* Colored icon container */}
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      bg,
                      color,
                      "border border-transparent group-hover:border-border/50 transition-colors duration-100"
                    )}
                  >
                    {icon}
                  </div>

                  {/* Text content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate leading-snug">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5 leading-snug">
                      {item.description}
                    </p>
                  </div>

                  {/* Timestamp — right-aligned, tabular */}
                  <span className="shrink-0 text-[10px] font-medium text-muted-foreground/60 whitespace-nowrap tabular-nums mt-0.5">
                    {timeAgo}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentActivityList;
