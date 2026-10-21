"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bell,
  Mail,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Info,
  Clock,
  Sparkles,
  Users,
} from "lucide-react";
import { inboxService, NotificationPreferences } from "@/services/api/inbox";

interface NotificationPreferencesCardProps {
  organizationId?: string | null;
}

export function NotificationPreferencesCard({
  organizationId,
}: NotificationPreferencesCardProps) {
  const [prefs, setPrefs] = useState<Partial<NotificationPreferences>>({
    finding_assignments_in_app: true,
    finding_assignments_email: true,
    review_requests_in_app: true,
    review_requests_email: true,
    mentions_replies_in_app: true,
    mentions_replies_email: true,
    deadlines_in_app: true,
    deadlines_email: true,
    analysis_results_in_app: true,
    analysis_results_email: false,
    workspace_activity_in_app: true,
    workspace_activity_email: false,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    inboxService
      .getPreferences(organizationId || undefined)
      .then((data) => {
        if (mounted && data) {
          setPrefs(data);
        }
      })
      .catch((err) => {
        console.error("Failed to load notification preferences:", err);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [organizationId]);

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await inboxService.updatePreferences(organizationId || undefined, prefs);
      toast.success("Notification preferences saved successfully");
    } catch (err: any) {
      console.error("Failed saving preferences:", err);
      toast.error(
        err?.response?.data?.detail || "Failed to update notification preferences"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6 bg-card border-border rounded-2xl flex items-center justify-center min-h-[220px]">
        <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span>Loading notification preferences...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card border-border rounded-2xl space-y-6 mt-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              Notifications &amp; Communication Preferences
            </h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Customize which events generate in-app alerts and email notifications for your active workspace.
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="h-8 text-xs px-3.5 rounded-xl self-start sm:self-auto cursor-pointer"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Save Preferences
            </>
          )}
        </Button>
      </div>

      {/* Security notice distinction */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#EAF3FF] dark:bg-blue-500/10 border border-[#E2E8F0] dark:border-blue-500/20 text-xs">
        <Info className="w-4 h-4 text-[#0A61C9] dark:text-blue-500 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold text-[#0A61C9] dark:text-blue-500">
            Compliance &amp; Security Distinction
          </span>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            User preferences control personal notifications and reminders. Mandatory statutory audit logs, access revocation records, and organization security events are permanently retained for regulatory accountability and cannot be silenced.
          </p>
        </div>
      </div>

      {/* Grid: In-App & Email Channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* In-App Notifications Channel */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground border-b border-border/60 pb-2">
            <Bell className="w-3.5 h-3.5 text-[#0A61C9] dark:text-sky-400" />
            <span>In-App Notifications &amp; Popover</span>
          </div>

          <div className="space-y-3">
            {/* Finding Assignments */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Finding Assignments
                </p>
                <p className="text-[10px] text-muted-foreground">
                  When a compliance finding is assigned or reassigned to you.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.finding_assignments_in_app)}
                onChange={() => handleToggle("finding_assignments_in_app")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>

            {/* Review Requests */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Review Requests
                </p>
                <p className="text-[10px] text-muted-foreground">
                  When a remediation or audit report is submitted for your sign-off.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.review_requests_in_app)}
                onChange={() => handleToggle("review_requests_in_app")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>

            {/* Mentions & Replies */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Mentions &amp; Replies
                </p>
                <p className="text-[10px] text-muted-foreground">
                  When a team member @mentions you in finding discussions.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.mentions_replies_in_app)}
                onChange={() => handleToggle("mentions_replies_in_app")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>

            {/* Deadlines & Overdue Alerts */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Deadlines &amp; Reminders
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Alerts for approaching statutory or internal compliance target dates.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.deadlines_in_app)}
                onChange={() => handleToggle("deadlines_in_app")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>

            {/* Analysis Results */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Analysis Results
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Completion or failure notices for your initiated compliance runs.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.analysis_results_in_app)}
                onChange={() => handleToggle("analysis_results_in_app")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>

            {/* Routine Workspace Activity */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Workspace Activity
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Policy uploads, team invitations, and general workspace milestones.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.workspace_activity_in_app)}
                onChange={() => handleToggle("workspace_activity_in_app")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>
          </div>
        </div>

        {/* Email Notifications Channel */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground border-b border-border/60 pb-2">
            <Mail className="w-3.5 h-3.5 text-violet-400" />
            <span>Email Notifications</span>
          </div>

          <div className="space-y-3">
            {/* Finding Assignments */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Critical Finding Assignments
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Send immediate email digest when assigned high/critical severity gaps.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.finding_assignments_email)}
                onChange={() => handleToggle("finding_assignments_email")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>

            {/* Review Requests */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Review &amp; Sign-off Requests
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Email when your review or formal compliance approval is requested.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.review_requests_email)}
                onChange={() => handleToggle("review_requests_email")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>

            {/* Mentions */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Direct Mentions
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Send an email when explicitly mentioned in a finding discussion.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.mentions_replies_email)}
                onChange={() => handleToggle("mentions_replies_email")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>

            {/* Approaching Deadlines */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Approaching Target Deadlines
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Receive email warnings 24 hours before overdue remediation dates.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.deadlines_email)}
                onChange={() => handleToggle("deadlines_email")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>

            {/* Analysis Results Email */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Analysis Summary Digests
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Receive email report summary upon large automated compliance batch completion.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.analysis_results_email)}
                onChange={() => handleToggle("analysis_results_email")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>

            {/* Routine Workspace Digest */}
            <label className="flex items-start justify-between gap-3 p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="space-y-0.5 min-w-0 pr-2">
                <p className="text-xs font-medium text-foreground">
                  Periodic Workspace Digest
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Weekly summary of workspace compliance progress and open items.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(prefs.workspace_activity_email)}
                onChange={() => handleToggle("workspace_activity_email")}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </label>
          </div>
        </div>
      </div>
    </Card>
  );
}
