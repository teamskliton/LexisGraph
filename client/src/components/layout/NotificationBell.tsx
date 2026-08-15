"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Bell,
  UserCheck,
  ShieldAlert,
  MessageSquare,
  RotateCcw,
  Check,
  CheckCheck,
  ExternalLink,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { notificationsService, NotificationItem } from "@/services/api/notifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FindingDetailDrawer, FindingItem } from "@/components/compliance/FindingDetailDrawer";
import { findingsService } from "@/services/api/findings";

interface NotificationBellProps {
  organizationId?: string;
  className?: string;
}

export function NotificationBell({ organizationId, className }: NotificationBellProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterTab, setFilterTab] = useState<"ALL" | "UNREAD">("ALL");

  // Finding drawer state for quick inspection
  const [selectedFinding, setSelectedFinding] = useState<FindingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch unread count safely
  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await notificationsService.getUnreadCount(organizationId);
      setUnreadCount(count);
    } catch (err) {
      console.warn("Unread notifications count check failed silently:", err);
    }
  }, [organizationId]);

  // Fetch recent notifications for popover
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await notificationsService.getNotifications(organizationId, {
        unread_only: filterTab === "UNREAD",
        limit: 25,
      });
      setNotifications(data || []);
    } catch (err: any) {
      console.error("Failed to load notifications:", err);
      setError("Unable to load notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, filterTab]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Close popover on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleMarkAsRead = async (notification: NotificationItem) => {
    if (!notification.is_read) {
      try {
        await notificationsService.markAsRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        );
        fetchUnreadCount();
      } catch (err) {
        console.error("Failed marking notification as read:", err);
      }
    }

    if (notification.organization_id && typeof window !== "undefined") {
      const currentStored = localStorage.getItem("selected_organization_id");
      if (currentStored !== notification.organization_id) {
        localStorage.setItem("selected_organization_id", notification.organization_id);
        window.dispatchEvent(new Event("organization_changed"));
      }
    }

    setIsOpen(false);

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
      await notificationsService.markAllAsRead(organizationId);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
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
        return <UserCheck className="h-4 w-4 text-indigo-500 shrink-0" />;
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
      default:
        return <Bell className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  return (
    <div className={cn("relative inline-block", className)} ref={popoverRef}>
      {/* Bell Trigger Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-9 w-9 text-muted-foreground hover:text-foreground cursor-pointer"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white tabular-nums">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-card text-card-foreground shadow-xl z-50 overflow-hidden flex flex-col max-h-[500px]">
          {/* Header */}
          <div className="p-3 border-b border-border/60 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">Notifications</span>
                {unreadCount > 0 && (
                  <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 text-[10px] font-semibold">
                    {unreadCount} unread
                  </Badge>
                )}
              </div>

              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleMarkAllRead}
                  className="text-[11px] h-6 text-muted-foreground hover:text-foreground gap-1 cursor-pointer px-1.5"
                >
                  <CheckCheck className="h-3 w-3" />
                  <span>Mark all read</span>
                </Button>
              )}
            </div>

            {/* Filter Tabs: [ All ] [ Unread ] */}
            <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border border-border/40">
              <button
                type="button"
                onClick={() => setFilterTab("ALL")}
                className={cn(
                  "flex-1 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer text-center",
                  filterTab === "ALL"
                    ? "bg-background text-foreground shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("UNREAD")}
                className={cn(
                  "flex-1 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer text-center",
                  filterTab === "UNREAD"
                    ? "bg-background text-indigo-600 dark:text-indigo-400 shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 divide-y divide-border/30">
            {isLoading ? (
              <div className="p-6 text-center space-y-2">
                <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground">Loading notifications...</p>
              </div>
            ) : error ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-xs text-rose-500 font-medium">{error}</p>
                <Button size="xs" variant="outline" onClick={fetchNotifications} className="text-xs cursor-pointer">
                  Retry
                </Button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center space-y-1.5">
                <Bell className="h-7 w-7 text-muted-foreground mx-auto opacity-40" />
                <p className="text-xs font-semibold text-foreground">
                  {filterTab === "UNREAD" ? "You're all caught up." : "No notifications yet."}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {filterTab === "UNREAD"
                    ? "There are no unread notifications."
                    : "Notifications for finding reviews and comments will appear here."}
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleMarkAsRead(n)}
                  className={cn(
                    "p-3 flex items-start gap-2.5 transition-colors cursor-pointer hover:bg-muted/40",
                    !n.is_read ? "bg-indigo-500/5 dark:bg-indigo-500/10" : "opacity-85"
                  )}
                >
                  {/* Read / Unread bullet indicator */}
                  <div className="mt-1 flex items-center justify-center shrink-0">
                    {!n.is_read ? (
                      <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" title="Unread notification" />
                    ) : (
                      <span className="h-2 w-2 rounded-full border border-muted-foreground/40" title="Read notification" />
                    )}
                  </div>

                  <div className="mt-0.5">{renderIcon(n.type)}</div>

                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn("text-xs leading-snug truncate", !n.is_read ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {format(new Date(n.created_at), "MMM d, HH:mm")}
                      </span>
                    </div>

                    <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">{n.message}</p>

                    {/* Structured context badges */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      {n.finding_id && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono text-indigo-600 dark:text-indigo-400 border-indigo-500/20 bg-indigo-500/5">
                          Finding #{n.finding_id.slice(0, 8)}
                        </Badge>
                      )}
                      {n.comment_id && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono text-muted-foreground border-border/50">
                          Discussion
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-border/60 bg-muted/10 text-center">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setIsOpen(false);
                router.push("/notifications");
              }}
              className="w-full text-xs font-semibold text-indigo-500 hover:text-indigo-600 gap-1 cursor-pointer"
            >
              <span>View Notification Center</span>
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Quick inspect Finding Drawer */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        organizationId={organizationId}
      />
    </div>
  );
}
