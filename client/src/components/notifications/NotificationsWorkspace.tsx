"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Bell,
  UserCheck,
  ShieldAlert,
  MessageSquare,
  RotateCcw,
  CheckCheck,
  ArrowLeft,
  RefreshCw,
  Filter,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import { notificationsService, NotificationItem } from "@/services/api/notifications";
import { FindingDetailDrawer, FindingItem } from "@/components/compliance/FindingDetailDrawer";
import { findingsService } from "@/services/api/findings";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function NotificationsWorkspace() {
  const router = useRouter();
  const { user } = useAuth();

  const [activeOrgId, setActiveOrgId] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_organization_id") || undefined;
    }
    return undefined;
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterTab, setFilterTab] = useState<"ALL" | "UNREAD">("ALL");

  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await notificationsService.getNotifications(activeOrgId, {
        unread_only: filterTab === "UNREAD",
        limit: 50,
      });
      setNotifications(data || []);
    } catch (err: any) {
      console.error("Failed loading notifications:", err);
      const rawDetail = err?.response?.data?.detail || "Failed to load notifications.";
      setError(typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail));
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, filterTab]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (notification: NotificationItem) => {
    if (!notification.is_read) {
      try {
        await notificationsService.markAsRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        );
      } catch (err) {
        console.error("Failed marking read:", err);
      }
    }

    if (notification.organization_id && typeof window !== "undefined") {
      const currentStored = localStorage.getItem("selected_organization_id");
      if (currentStored !== notification.organization_id) {
        localStorage.setItem("selected_organization_id", notification.organization_id);
        window.dispatchEvent(new Event("organization_changed"));
      }
    }

    if (notification.finding_id) {
      const isCommentRelated =
        Boolean(notification.comment_id) ||
        notification.type.includes("COMMENT") ||
        notification.type.includes("MENTION");

      if (isCommentRelated) {
        const queryParams = new URLSearchParams();
        queryParams.set("tab", "discussion");
        if (notification.comment_id) {
          queryParams.set("commentId", notification.comment_id);
        }
        router.push(`/findings/${notification.finding_id}?${queryParams.toString()}`);
      } else {
        router.push(`/findings/${notification.finding_id}`);
      }
    } else {
      router.push("/compliance/my-work?view=all");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsService.markAllAsRead(activeOrgId);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success("All notifications marked as read.");
    } catch (err) {
      toast.error("Failed to mark notifications as read.");
    }
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case "FINDING_SUBMITTED_FOR_REVIEW":
        return <CheckCheck className="h-5 w-5 text-sky-500 shrink-0" />;
      case "FINDING_RESOLVED":
        return <CheckCheck className="h-5 w-5 text-emerald-500 shrink-0" />;
      case "FINDING_REJECTED":
        return <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0" />;
      case "FINDING_ASSIGNED":
        return <UserCheck className="h-5 w-5 text-indigo-500 shrink-0" />;
      case "FINDING_STATUS_CHANGED":
        return <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />;
      case "FINDING_COMMENTED":
      case "FINDING_COMMENT_REPLIED":
      case "FINDING_MENTIONED":
        return <MessageSquare className="h-5 w-5 text-blue-500 shrink-0" />;
      case "FINDING_COMMENT_RESOLVED":
        return <CheckCheck className="h-5 w-5 text-emerald-500 shrink-0" />;
      case "FINDING_REOPENED":
        return <RotateCcw className="h-5 w-5 text-rose-500 shrink-0" />;
      default:
        return <Bell className="h-5 w-5 text-muted-foreground shrink-0" />;
    }
  };

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-16 space-y-6">
      {/* Header Bar */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-5xl mx-auto">
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
                  <Bell className="h-5 w-5 text-indigo-500" /> Notifications & Alerts
                </h1>
                {unreadCount > 0 && (
                  <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 text-xs font-semibold">
                    {unreadCount} Unread
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                In-app alerts for findings assigned, status changes, review comments, and lifecycle updates.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                className="gap-1.5 text-xs cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark All Read</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={fetchNotifications}
              disabled={isLoading}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 space-y-6">
        {/* Filter Bar */}
        <Card className="border border-border/50 bg-card p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant={filterTab === "ALL" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilterTab("ALL")}
                className="text-xs font-semibold cursor-pointer"
              >
                All Notifications
              </Button>
              <Button
                variant={filterTab === "UNREAD" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilterTab("UNREAD")}
                className="text-xs font-semibold cursor-pointer"
              >
                Unread Only {unreadCount > 0 ? `(${unreadCount})` : ""}
              </Button>
            </div>

            <span className="text-xs text-muted-foreground font-mono">
              Total: {notifications.length}
            </span>
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
            <h3 className="text-sm font-semibold text-foreground">Unable to load notifications.</h3>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button size="sm" onClick={fetchNotifications} className="cursor-pointer text-xs font-semibold gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </Card>
        ) : notifications.length === 0 ? (
          <Card className="border border-dashed border-border/60 bg-muted/10 p-12 text-center space-y-3">
            <Bell className="h-10 w-10 text-muted-foreground opacity-40 mx-auto" />
            <h3 className="text-sm font-bold text-foreground">
              {filterTab === "UNREAD" ? "You're all caught up." : "No notifications yet."}
            </h3>
            <p className="text-xs text-muted-foreground">
              {filterTab === "UNREAD"
                ? "No unread notifications."
                : "No notifications found for this organization."}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((item) => (
              <Card
                key={item.id}
                onClick={() => handleMarkAsRead(item)}
                className={cn(
                  "border border-border/60 bg-card hover:border-border transition-all cursor-pointer p-4 space-y-2 group shadow-xs",
                  !item.is_read && "border-indigo-500/40 bg-indigo-500/5 dark:bg-indigo-500/10"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* Unread indicator */}
                    <div className="mt-2 shrink-0">
                      {!item.is_read ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400 block" title="Unread" />
                      ) : (
                        <span className="h-2.5 w-2.5 rounded-full border border-muted-foreground/30 block" title="Read" />
                      )}
                    </div>

                    <div className="p-2 rounded-xl bg-muted/40 border border-border/40 mt-0.5 shrink-0">
                      {renderIcon(item.type)}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={cn("text-xs", !item.is_read ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>
                          {item.title}
                        </h4>
                        {!item.is_read && (
                          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 text-[10px] font-bold">
                            Unread
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed">{item.message}</p>
                      
                      <div className="flex items-center gap-2 flex-wrap pt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {format(new Date(item.created_at), "MMM d, yyyy · HH:mm")}
                        </span>
                        {item.finding_id && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-indigo-600 dark:text-indigo-400 border-indigo-500/20 bg-indigo-500/5">
                            Finding #{item.finding_id.slice(0, 8)}
                          </Badge>
                        )}
                        {item.comment_id && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-muted-foreground border-border/50">
                            Discussion
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.finding_id && (
                    <Button variant="ghost" size="xs" className="h-7 text-xs font-semibold text-indigo-500 gap-1 group-hover:translate-x-0.5 transition-transform shrink-0">
                      <span>Inspect Finding</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        organizationId={activeOrgId}
      />
    </div>
  );
}
