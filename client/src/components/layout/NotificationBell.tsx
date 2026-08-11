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
      const data = await notificationsService.getNotifications(organizationId, { limit: 15 });
      setNotifications(data || []);
    } catch (err: any) {
      console.error("Failed to load notifications:", err);
      setError("Unable to load notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

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

    setIsOpen(false);

    if (notification.finding_id) {
      try {
        const findingDetail = await findingsService.getFinding(notification.finding_id);
        setSelectedFinding(findingDetail as FindingItem);
        setIsDrawerOpen(true);
      } catch (err) {
        router.push("/compliance/my-work");
      }
    } else {
      router.push("/compliance/my-work");
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
      case "FINDING_ASSIGNED":
        return <UserCheck className="h-4 w-4 text-indigo-500 shrink-0" />;
      case "FINDING_STATUS_CHANGED":
        return <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />;
      case "FINDING_COMMENTED":
        return <MessageSquare className="h-4 w-4 text-blue-500 shrink-0" />;
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
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-card text-card-foreground shadow-xl z-50 overflow-hidden flex flex-col max-h-[480px]">
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 border-b border-border/60 bg-muted/20">
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
                className="text-[11px] h-6 text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
              >
                <CheckCheck className="h-3 w-3" />
                <span>Mark all read</span>
              </Button>
            )}
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
              <div className="p-8 text-center space-y-1">
                <Bell className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                <p className="text-xs font-semibold text-foreground">You're all caught up.</p>
                <p className="text-[11px] text-muted-foreground">No new notifications in this organization.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleMarkAsRead(n)}
                  className={cn(
                    "p-3.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-muted/40",
                    !n.is_read && "bg-indigo-500/5"
                  )}
                >
                  <div className="mt-0.5">{renderIcon(n.type)}</div>

                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn("text-xs font-semibold", !n.is_read ? "text-foreground font-bold" : "text-muted-foreground")}>
                        {n.title}
                      </span>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {format(new Date(n.created_at), "MMM d, HH:mm")}
                    </span>
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
              <span>View All Notifications</span>
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
