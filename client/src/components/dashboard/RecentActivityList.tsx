"use client";

import React from "react";
import { formatDistanceToNow } from "date-fns";
import { ActivityItem } from "@/types/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, FileText, FileCheck, Download, Activity, Inbox } from "lucide-react";

interface RecentActivityListProps {
  activities: ActivityItem[];
  isLoading: boolean;
}

function getActivityIcon(iconType: string) {
  switch (iconType) {
    case "building":
      return <Building2 className="h-4 w-4 text-indigo-500" />;
    case "file":
      return <FileText className="h-4 w-4 text-violet-500" />;
    case "report":
      return <FileCheck className="h-4 w-4 text-emerald-500" />;
    case "download":
      return <Download className="h-4 w-4 text-blue-500" />;
    default:
      return <Activity className="h-4 w-4 text-amber-500" />;
  }
}

export const RecentActivityList: React.FC<RecentActivityListProps> = ({
  activities,
  isLoading,
}) => {
  return (
    <Card className="border-border/60 shadow-sm flex flex-col justify-between">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <CardTitle className="text-base font-bold text-foreground">
              Recent System Activity
            </CardTitle>
          </div>
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
            Live Feed
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-4 flex-1">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground space-y-2">
            <Inbox className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No recent activities recorded yet.</p>
            <p className="text-xs">Activities will appear automatically as you create organizations, upload documents, or run reports.</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
            {activities.map((item) => {
              const timeAgo = item.timestamp
                ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })
                : "just now";

              return (
                <div key={item.id} className="flex items-start gap-3 group">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted border border-border/50 group-hover:border-primary/40 transition-colors">
                    {getActivityIcon(item.icon_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {item.title}
                      </p>
                      <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                        {timeAgo}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </p>
                  </div>
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
