"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  Bell,
  UserCheck,
  ShieldAlert,
  MessageSquare,
  RotateCcw,
  CheckCheck,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Check,
  Info,
  Send,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import { notificationsService, NotificationItem } from "@/services/api/notifications";
import { FindingDetailDrawer, FindingItem } from "@/components/compliance/FindingDetailDrawer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type NotificationCategoryTab = "ALL" | "UNREAD" | "MENTIONS" | "SYSTEM_UPDATES";

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

  const [filterTab, setFilterTab] = useState<NotificationCategoryTab>("ALL");

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
        category: filterTab,
        unread_only: filterTab === "UNREAD",
        limit: 100,
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

  const handleOpenRelatedItem = (notification: NotificationItem) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification);
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
    } else if (notification.report_id) {
      router.push(`/reports/${notification.report_id}`);
    } else {
      router.push("/inbox");
    }
  };

  const handleMarkAsRead = async (notification: NotificationItem) => {
    try {
      await notificationsService.markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error("Failed marking read:", err);
    }
  };

  const handleMarkAsUnread = async (e: React.MouseEvent, notification: NotificationItem) => {
    e.stopPropagation();
    try {
      await notificationsService.markAsUnread(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: false } : n))
      );
      toast.success("Notification marked as unread.");
    } catch (err) {
      toast.error("Failed to mark notification as unread.");
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
        return <Send className="h-4 w-4 text-sky-500 shrink-0" />;
      case "FINDING_RESOLVED":
        return <CheckCheck className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "FINDING_REJECTED":
        return <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" />;
      case "FINDING_ASSIGNED":
        return <UserCheck className="h-4 w-4 text-primary shrink-0" />;
      case "FINDING_STATUS_CHANGED":
        return <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />;
      case "FINDING_COMMENTED":
      case "FINDING_COMMENT_REPLIED":
      case "FINDING_MENTIONED":
        return <MessageSquare className="h-4 w-4 text-blue-500 shrink-0" />;
      case "FINDING_COMMENT_RESOLVED":
        return <CheckCheck className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "FINDING_REOPENED":
        return <RotateCcw className="h-4 w-4 text-rose-500 shrink-0" />;
      case "ANALYSIS_COMPLETED":
        return <Zap className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "ANALYSIS_FAILED":
        return <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  const getRelativeTime = (created_at: string) => {
    try {
      return formatDistanceToNowStrict(new Date(created_at), { addSuffix: true });
    } catch {
      return "recently";
    }
  };

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
                  <Bell className="h-5 w-5 text-primary" /> Notifications
                </h1>
                {unreadCount > 0 && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
                    {unreadCount} Unread
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Stay informed about relevant compliance activity and workspace updates.
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
                <span>Mark All as Read</span>
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

      <div className="max-w-5xl mx-auto px-6 space-y-5">
        {/* Notice: Decoupled notification state vs task state */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-primary/20 bg-primary/5 text-xs text-muted-foreground">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span>
            Notifications keep you informed of events. Reading a notification does not complete actionable tasks; track your work in the{" "}
            <button
              onClick={() => router.push("/inbox")}
              className="text-primary font-semibold underline hover:text-primary-hover cursor-pointer"
            >
              Action Inbox
            </button>.
          </span>
        </div>

        {/* Filter Bar: All, Unread, Mentions, System Updates */}
        <Card className="border border-border/50 bg-card p-2.5 shadow-2xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1 flex-wrap">
              <Button
                variant={filterTab === "ALL" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilterTab("ALL")}
                className="text-xs font-semibold cursor-pointer h-8"
              >
                All
              </Button>
              <Button
                variant={filterTab === "UNREAD" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilterTab("UNREAD")}
                className="text-xs font-semibold cursor-pointer h-8"
              >
                Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
              </Button>
              <Button
                variant={filterTab === "MENTIONS" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilterTab("MENTIONS")}
                className="text-xs font-semibold cursor-pointer h-8"
              >
                Mentions
              </Button>
              <Button
                variant={filterTab === "SYSTEM_UPDATES" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilterTab("SYSTEM_UPDATES")}
                className="text-xs font-semibold cursor-pointer h-8"
              >
                System Updates
              </Button>
            </div>

            <span className="text-xs text-muted-foreground font-mono px-2">
              Showing: {notifications.length}
            </span>
          </div>
        </Card>

        {/* Content Area */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
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
            <Bell className="h-9 w-9 text-muted-foreground opacity-40 mx-auto" />
            <h3 className="text-sm font-bold text-foreground">
              {filterTab === "UNREAD" ? "No unread notifications." : "You're all caught up."}
            </h3>
            <p className="text-xs text-muted-foreground">
              {filterTab === "UNREAD"
                ? "No unread notifications in this workspace."
                : "No notifications to display in this category."}
            </p>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {notifications.map((item) => (
              <div
                key={item.id}
                onClick={() => handleOpenRelatedItem(item)}
                className={cn(
                  "border rounded-xl transition-all cursor-pointer p-3 flex items-center justify-between gap-3 group shadow-2xs",
                  !item.is_read
                    ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                    : "border-border/50 bg-card hover:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Read / Unread bullet */}
                  <div className="shrink-0 flex items-center justify-center">
                    {!item.is_read ? (
                      <span className="h-2 w-2 rounded-full bg-primary block" title="Unread" />
                    ) : (
                      <span className="h-2 w-2 rounded-full border border-muted-foreground/30 block" title="Read" />
                    )}
                  </div>

                  {/* Icon */}
                  <div className="p-1.5 rounded-lg bg-muted/50 border border-border/40 shrink-0">
                    {renderIcon(item.type)}
                  </div>

                  {/* Body Content */}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-xs truncate", !item.is_read ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>
                        {item.title}
                      </span>
                      {item.finding_id && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono text-primary border-primary/20 bg-primary/5">
                          Finding #{item.finding_id.slice(0, 8)}
                        </Badge>
                      )}
                      {item.comment_id && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono text-muted-foreground border-border/50">
                          Discussion
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-foreground/80 truncate leading-snug">{item.message}</p>
                  </div>
                </div>

                {/* Right Actions & Timestamp */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground block font-medium">
                      {getRelativeTime(item.created_at)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/70 font-mono block">
                      {format(new Date(item.created_at), "MMM d, HH:mm")}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    {!item.is_read ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead(item);
                        }}
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Mark as Read"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={(e) => handleMarkAsUnread(e, item)}
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Mark as Unread"
                      >
                        Mark Unread
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenRelatedItem(item);
                      }}
                      className="h-7 px-2 text-xs font-semibold text-primary hover:text-primary-hover gap-1 cursor-pointer"
                    >
                      <span>Open</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
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
