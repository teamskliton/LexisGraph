"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  X,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  FileText,
  BookOpen,
  Sparkles,
  Network,
  Copy,
  CheckCircle2,
  UserCheck,
  UserPlus,
  MessageSquare,
  History,
  RotateCcw,
  Send,
  Trash2,
  Clock,
  CheckCircle,
  Calendar,
  CornerDownRight,
  Check,
  Flag,
  SendHorizontal,
  XCircle,
  AtSign,
  User as UserIcon,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  findingsService,
  FindingComment,
  FindingActivity,
  FindingDetail,
} from "@/services/api/findings";
import {
  organizationsService,
  OrganizationMember,
} from "@/services/api/organizations";
import { formatRoleLabel } from "@/utils/role-utils";
import { RemediationSection } from "./RemediationSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface FindingItem {
  id: string;
  report_id: string;
  policy_clause_id?: string | null;
  regulation_clause_id?: string | null;
  status: string;
  lifecycle_status?: string;
  confidence?: number;
  severity: string;
  reasoning?: string | null;
  recommendation?: string | null;
  citation?: string | null;
  matched_policy_text?: string | null;
  graph_path?: Record<string, unknown> | Array<unknown> | null;
  assigned_to?: string | null;
  assignee?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  resolution_note?: string | null;
  reopen_reason?: string | null;
  remediation_due_date?: string | null;
  is_overdue?: boolean;
  comments_count?: number;
  organization_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface FindingDetailDrawerProps {
  finding: FindingItem | null;
  isOpen: boolean;
  onClose: () => void;
  onFindingUpdated?: (updated: FindingItem) => void;
  reportName?: string;
  organizationId?: string;
}

function deriveSeverityBadge(severity?: string, status?: string) {
  const sev = (severity || "").toUpperCase();
  const st = (status || "").toUpperCase();

  if (sev === "CRITICAL" || sev === "HIGH" || st === "NON_COMPLIANT") {
    return {
      label: sev || "HIGH SEVERITY",
      badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      icon: <ShieldX className="h-4 w-4 text-rose-500" />,
    };
  }
  if (sev === "MEDIUM" || st === "PARTIALLY_COMPLIANT") {
    return {
      label: sev || "MEDIUM SEVERITY",
      badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: <ShieldAlert className="h-4 w-4 text-amber-500" />,
    };
  }
  return {
    label: sev || "LOW SEVERITY",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
  };
}

function deriveLifecycleBadge(lifecycleStatus?: string) {
  const st = (lifecycleStatus || "OPEN").toUpperCase();

  switch (st) {
    case "IN_REVIEW":
      return {
        label: "IN REVIEW",
        className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
      };
    case "REMEDIATION":
    case "REMEDIATION_REQUIRED":
      return {
        label: "REMEDIATION REQUIRED",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      };
    case "POTENTIAL_FALSE_POSITIVE":
      return {
        label: "POTENTIAL FALSE POSITIVE",
        className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
      };
    case "ADMIN_REVIEW":
      return {
        label: "ADMIN REVIEW",
        className: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
      };
    case "RESOLVED":
      return {
        label: "RESOLVED",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      };
    case "REOPENED":
      return {
        label: "REOPENED",
        className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      };
    case "REJECTED":
      return {
        label: "REJECTED (FALSE POSITIVE)",
        className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
      };
    default:
      return {
        label: "OPEN",
        className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
      };
  }
}

export const FindingDetailDrawer: React.FC<FindingDetailDrawerProps> = ({
  finding,
  isOpen,
  onClose,
  onFindingUpdated,
  reportName,
  organizationId,
}) => {
  const router = useRouter();
  const { user, permissions } = useAuth();

  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // State
  const [currentFinding, setCurrentFinding] = useState<FindingItem | null>(finding);
  const [comments, setComments] = useState<FindingComment[]>([]);
  const [activities, setActivities] = useState<FindingActivity[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([]);

  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);

  // Mutation states
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);

  // Comment & Mention states (Sprint 7.2)
  const [commentText, setCommentText] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const [discussionFilter, setDiscussionFilter] = useState<"ALL" | "UNRESOLVED" | "RESOLVED">("ALL");

  // Confirmation Modals (Sprint 7.1)
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolutionNoteInput, setResolutionNoteInput] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenReasonInput, setReopenReasonInput] = useState("");
  const [isReopening, setIsReopening] = useState(false);

  const [isSubmitReviewModalOpen, setIsSubmitReviewModalOpen] = useState(false);
  const [submissionNoteInput, setSubmissionNoteInput] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // Due date state
  const [dueDateInput, setDueDateInput] = useState<string>("");
  const [isUpdatingDueDate, setIsUpdatingDueDate] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useScrollLock(isOpen && Boolean(currentFinding));

  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        drawerRef.current?.focus({ preventScroll: true });
      });
    } else {
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === "function") {
        previousActiveElementRef.current.focus({ preventScroll: true });
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isResolveModalOpen) {
          setIsResolveModalOpen(false);
        } else if (isReopenModalOpen) {
          setIsReopenModalOpen(false);
        } else if (isSubmitReviewModalOpen) {
          setIsSubmitReviewModalOpen(false);
        } else if (isRejectModalOpen) {
          setIsRejectModalOpen(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isResolveModalOpen, isReopenModalOpen, isSubmitReviewModalOpen, isRejectModalOpen, onClose]);

  useEffect(() => {
    setCurrentFinding(finding);
    if (finding?.remediation_due_date) {
      const d = new Date(finding.remediation_due_date);
      if (!isNaN(d.getTime())) {
        setDueDateInput(d.toISOString().split("T")[0]);
      } else {
        setDueDateInput("");
      }
    } else {
      setDueDateInput("");
    }
  }, [finding]);

  const handleSaveDueDate = async (newDateStr: string | null) => {
    if (!currentFinding?.id) return;
    setIsUpdatingDueDate(true);
    try {
      const isoFormatted = newDateStr ? new Date(`${newDateStr}T00:00:00Z`).toISOString() : null;
      const updated = await findingsService.updateRemediationDueDate(currentFinding.id, isoFormatted);
      setCurrentFinding(updated as FindingItem);
      if (onFindingUpdated) onFindingUpdated(updated as FindingItem);
      fetchAuxiliaryData();
      toast.success(newDateStr ? "Remediation due date updated." : "Remediation due date cleared.");
    } catch (err: any) {
      console.error("Error setting due date:", err);
      toast.error(err?.response?.data?.detail || "Failed to update due date.");
    } finally {
      setIsUpdatingDueDate(false);
    }
  };

  const fetchAuxiliaryData = useCallback(async () => {
    if (!currentFinding?.id) return;

    setIsLoadingComments(true);
    setIsLoadingActivities(true);

    try {
      const [commentsData, activitiesData] = await Promise.all([
        findingsService.getComments(currentFinding.id),
        findingsService.getActivity(currentFinding.id),
      ]);
      setComments(commentsData || []);
      setActivities(activitiesData || []);
    } catch (err) {
      console.error("Error loading finding comments/activities:", err);
    } finally {
      setIsLoadingComments(false);
      setIsLoadingActivities(false);
    }

    const targetOrgId =
      currentFinding.organization_id ||
      organizationId ||
      (typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") || undefined : undefined);

    if (targetOrgId) {
      try {
        const membersData = await organizationsService.getMembers(targetOrgId);
        setOrgMembers(membersData || []);
      } catch (err) {
        console.error("Error loading org members for assignment/mentions:", err);
      }
    }
  }, [currentFinding?.id, currentFinding?.organization_id, organizationId]);

  useEffect(() => {
    if (isOpen && currentFinding?.id) {
      fetchAuxiliaryData();
    }
  }, [isOpen, currentFinding?.id, fetchAuxiliaryData]);

  // Statistics for discussion threads
  const discussionStats = useMemo(() => {
    const totalCount = comments.reduce((acc, c) => acc + 1 + (c.replies ? c.replies.length : 0), 0);
    const unresolvedThreads = comments.filter((c) => !c.is_resolved).length;
    const resolvedThreads = comments.filter((c) => Boolean(c.is_resolved)).length;
    return {
      totalCount,
      unresolvedThreads,
      resolvedThreads,
    };
  }, [comments]);

  // Filtered top-level comment threads
  const filteredCommentThreads = useMemo(() => {
    if (discussionFilter === "UNRESOLVED") {
      return comments.filter((c) => !c.is_resolved);
    }
    if (discussionFilter === "RESOLVED") {
      return comments.filter((c) => Boolean(c.is_resolved));
    }
    return comments;
  }, [comments, discussionFilter]);

  if (!isOpen || !currentFinding || !mounted) return null;

  const severityInfo = deriveSeverityBadge(currentFinding.severity, currentFinding.status);
  const lifecycleInfo = deriveLifecycleBadge(currentFinding.lifecycle_status);

  // Status Change
  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === "RESOLVED") {
      if (!permissions.canResolveFindings) {
        toast.error("Only Organization Admins are permitted to resolve findings.");
        return;
      }
      setIsResolveModalOpen(true);
      return;
    }
    if (newStatus === "REOPENED") {
      if (!permissions.canReopenFindings) {
        toast.error("Only Organization Admins are permitted to reopen findings.");
        return;
      }
      setIsReopenModalOpen(true);
      return;
    }
    if (newStatus === "ADMIN_REVIEW") {
      setIsSubmitReviewModalOpen(true);
      return;
    }
    if (newStatus === "REJECTED") {
      if (!permissions.canResolveFindings) {
        toast.error("Only Organization Admins are permitted to reject false-positive findings.");
        return;
      }
      setIsRejectModalOpen(true);
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const updated = await findingsService.updateStatus(currentFinding.id, newStatus);
      const merged: FindingItem = {
        ...currentFinding,
        lifecycle_status: updated.lifecycle_status,
        updated_at: updated.updated_at,
      };
      setCurrentFinding(merged);
      if (onFindingUpdated) onFindingUpdated(merged);
      toast.success(`Status updated to ${updated.lifecycle_status}`);
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to update status.";
      toast.error(msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Submit for Admin Review (Sprint 7.1)
  const handleConfirmSubmitReview = async () => {
    setIsSubmittingReview(true);
    try {
      const updated = await findingsService.submitForAdminReview(currentFinding.id, submissionNoteInput);
      const merged: FindingItem = {
        ...currentFinding,
        lifecycle_status: "ADMIN_REVIEW",
        updated_at: updated.updated_at,
      };
      setCurrentFinding(merged);
      if (onFindingUpdated) onFindingUpdated(merged);
      toast.success("Finding submitted for Administrator review.");
      setIsSubmitReviewModalOpen(false);
      setSubmissionNoteInput("");
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to submit for review.";
      toast.error(msg);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Reject False Positive (Sprint 7.1)
  const handleConfirmReject = async () => {
    setIsRejecting(true);
    try {
      const updated = await findingsService.rejectFalsePositive(currentFinding.id, rejectionReasonInput);
      const merged: FindingItem = {
        ...currentFinding,
        lifecycle_status: "REJECTED",
        resolution_note: updated.resolution_note,
        updated_at: updated.updated_at,
      };
      setCurrentFinding(merged);
      if (onFindingUpdated) onFindingUpdated(merged);
      toast.success("Finding rejected as confirmed false positive.");
      setIsRejectModalOpen(false);
      setRejectionReasonInput("");
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to reject finding.";
      toast.error(msg);
    } finally {
      setIsRejecting(false);
    }
  };

  // Assign Handler
  const handleAssignUser = async (assigneeId: string | null) => {
    setIsAssigning(true);
    try {
      const updated = await findingsService.assignFinding(currentFinding.id, assigneeId);
      const merged: FindingItem = {
        ...currentFinding,
        assigned_to: updated.assigned_to,
        assignee: updated.assignee,
        updated_at: updated.updated_at,
      };
      setCurrentFinding(merged);
      if (onFindingUpdated) onFindingUpdated(merged);
      const assigneeName = updated.assignee ? updated.assignee.full_name : "Unassigned";
      toast.success(`Finding assigned to ${assigneeName}`);
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to assign finding.";
      toast.error(msg);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleSelfAssign = () => {
    if (user?.id) {
      handleAssignUser(user.id);
    }
  };

  // Resolve Confirmation Handler (Sprint 7.1)
  const handleConfirmResolve = async () => {
    setIsResolving(true);
    try {
      const updated = await findingsService.resolveFinding(currentFinding.id, resolutionNoteInput);
      const merged: FindingItem = {
        ...currentFinding,
        lifecycle_status: "RESOLVED",
        resolution_note: updated.resolution_note,
        updated_at: updated.updated_at,
      };
      setCurrentFinding(merged);
      if (onFindingUpdated) onFindingUpdated(merged);
      toast.success("Finding marked as RESOLVED.");
      setIsResolveModalOpen(false);
      setResolutionNoteInput("");
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to resolve finding.";
      toast.error(msg);
    } finally {
      setIsResolving(false);
    }
  };

  // Reopen Confirmation Handler (Sprint 7.1)
  const handleConfirmReopen = async () => {
    setIsReopening(true);
    try {
      const updated = await findingsService.reopenFinding(currentFinding.id, reopenReasonInput);
      const merged: FindingItem = {
        ...currentFinding,
        lifecycle_status: "IN_REVIEW",
        reopen_reason: updated.reopen_reason,
        updated_at: updated.updated_at,
      };
      setCurrentFinding(merged);
      if (onFindingUpdated) onFindingUpdated(merged);
      toast.success("Finding REOPENED.");
      setIsReopenModalOpen(false);
      setReopenReasonInput("");
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to reopen finding.";
      toast.error(msg);
    } finally {
      setIsReopening(false);
    }
  };

  // Comment Text input handler with @mention matching (Sprint 7.2)
  const handleCommentTextChange = (val: string) => {
    setCommentText(val);
    const match = val.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
    } else {
      setMentionQuery(null);
    }
  };

  const handleReplyTextChange = (val: string) => {
    setReplyText(val);
    const match = val.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);
    if (match) {
      setReplyMentionQuery(match[1].toLowerCase());
    } else {
      setReplyMentionQuery(null);
    }
  };

  const selectMentionMember = (m: OrganizationMember, isReply: boolean = false) => {
    const handleName = m.username || (m.email ? m.email.split("@")[0] : m.full_name.replace(/\s+/g, "").toLowerCase());
    if (isReply) {
      const newText = replyText.replace(/@([a-zA-Z0-9_.-]*)$/, `@${handleName} `);
      setReplyText(newText);
      setReplyMentionQuery(null);
    } else {
      const newText = commentText.replace(/@([a-zA-Z0-9_.-]*)$/, `@${handleName} `);
      setCommentText(newText);
      setMentionQuery(null);
    }
    setMentionedUserIds((prev) => Array.from(new Set([...prev, m.user_id])));
  };

  // Filtered members for mentions
  const getFilteredMembers = (query: string | null) => {
    if (query === null) return [];
    if (!query) return orgMembers;
    const q = query.toLowerCase();
    return orgMembers.filter((m) => {
      const uname = (m.username || "").toLowerCase();
      const fname = (m.full_name || "").toLowerCase();
      const email = (m.email || "").toLowerCase();
      return uname.includes(q) || fname.includes(q) || email.includes(q);
    });
  };

  // Add Comment / Reply Handler (Sprint 7.2)
  const handleAddComment = async (e: React.FormEvent, parentId?: string) => {
    e.preventDefault();
    const textToSend = parentId ? replyText : commentText;
    if (!textToSend.trim()) return;

    setIsCommenting(true);
    try {
      await findingsService.postComment(
        currentFinding.id,
        textToSend.trim(),
        parentId,
        mentionedUserIds.length > 0 ? mentionedUserIds : undefined
      );
      if (parentId) {
        setReplyText("");
        setReplyingToId(null);
        setReplyMentionQuery(null);
      } else {
        setCommentText("");
        setMentionQuery(null);
      }
      setMentionedUserIds([]);
      toast.success(parentId ? "Reply posted." : "Comment added.");
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to add comment.";
      toast.error(msg);
    } finally {
      setIsCommenting(false);
    }
  };

  // Toggle Resolve Comment Discussion (Sprint 7.2 — Resolving discussion does NOT resolve finding)
  const handleToggleResolveComment = async (commentId: string, currentResolvedState: boolean) => {
    try {
      await findingsService.resolveComment(currentFinding.id, commentId, !currentResolvedState);
      toast.success(!currentResolvedState ? "Discussion resolved." : "Discussion reopened.");
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to toggle discussion resolution.";
      toast.error(msg);
    }
  };

  // Delete Comment Handler
  const handleDeleteComment = async (commentId: string) => {
    try {
      await findingsService.deleteComment(currentFinding.id, commentId);
      toast.success("Comment deleted.");
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to delete comment.";
      toast.error(msg);
    }
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard.`);
  };

  const getMemberRole = (userId: string, defaultRole?: string | null) => {
    if (defaultRole) return formatRoleLabel(defaultRole);
    const m = orgMembers.find((mem) => mem.user_id === userId);
    return m ? formatRoleLabel(m.role) : "Team Member";
  };

  const topLevelFilteredMembers = getFilteredMembers(mentionQuery);
  const replyFilteredMembers = getFilteredMembers(replyMentionQuery);

  const drawerContent = (
    <div
      className="fixed inset-0 z-50 flex justify-end overflow-hidden pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Finding #${currentFinding.id.slice(0, 8)}`}
    >
      <div
        className="fixed inset-0 bg-background/80 animate-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={drawerRef}
        tabIndex={-1}
        className="relative w-full max-w-2xl bg-card border-l border-border shadow-2xl h-full flex flex-col z-10 overflow-hidden outline-none animate-drawer-panel"
      >
        {/* Fixed Header */}
        <div className="shrink-0 flex items-center justify-between p-5 border-b border-border bg-card z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-foreground truncate">
                Finding #{currentFinding.id.slice(0, 8)}
              </h3>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {reportName || `Report #${currentFinding.report_id.slice(0, 8)}`}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
            aria-label="Close detail drawer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable Body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-6"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Status, Assignee & Operational Lifecycle Bar */}
          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn("gap-1 text-xs font-bold px-3 py-1", severityInfo.badgeClass)}>
                  {severityInfo.icon}
                  <span>{severityInfo.label}</span>
                </Badge>

                <Badge variant="outline" className={cn("text-xs font-bold px-3 py-1 uppercase", lifecycleInfo.className)}>
                  {lifecycleInfo.label}
                </Badge>
              </div>

              {/* Status-Aware Operational Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                {Boolean(currentFinding.assigned_to) &&
                currentFinding.assigned_to !== user?.id &&
                !permissions.canAssignFindings ? (
                  <span className="text-[11px] text-muted-foreground italic">
                    Assigned to {currentFinding.assignee?.full_name || "another member"}.
                  </span>
                ) : (
                  <>
                    {/* OPEN or REOPENED -> Start Review */}
                    {(currentFinding.lifecycle_status === "OPEN" || currentFinding.lifecycle_status === "REOPENED") && (
                      <Button
                        size="xs"
                        onClick={() => handleStatusChange("IN_REVIEW")}
                        disabled={isUpdatingStatus}
                        className="h-8 text-xs font-semibold gap-1 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>Start Review</span>
                      </Button>
                    )}

                    {/* IN_REVIEW -> Move to Remediation, Potential False Positive, Submit for Admin Review, Return to Open */}
                    {currentFinding.lifecycle_status === "IN_REVIEW" && (
                      <>
                        <Button
                          size="xs"
                          onClick={() => handleStatusChange("REMEDIATION")}
                          disabled={isUpdatingStatus}
                          className="h-8 text-xs font-semibold gap-1 bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>Move to Remediation</span>
                        </Button>

                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleStatusChange("POTENTIAL_FALSE_POSITIVE")}
                          disabled={isUpdatingStatus}
                          className="h-8 text-xs font-semibold gap-1 border-purple-500/40 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 cursor-pointer"
                        >
                          <Flag className="h-3.5 w-3.5" />
                          <span>Mark Potential False Positive</span>
                        </Button>

                        <Button
                          size="xs"
                          onClick={() => handleStatusChange("ADMIN_REVIEW")}
                          disabled={isUpdatingStatus}
                          className="h-8 text-xs font-semibold gap-1 bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                        >
                          <SendHorizontal className="h-3.5 w-3.5" />
                          <span>Submit for Admin Review</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleStatusChange("OPEN")}
                          disabled={isUpdatingStatus}
                          className="h-8 text-xs font-semibold gap-1 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Return to Open</span>
                        </Button>
                      </>
                    )}

                    {/* REMEDIATION -> Submit for Admin Review, Return to Review, (Admin: Resolve Finding) */}
                    {(currentFinding.lifecycle_status === "REMEDIATION" || currentFinding.lifecycle_status === "REMEDIATION_REQUIRED") && (
                      <>
                        {permissions.canResolveFindings && (
                          <Button
                            size="xs"
                            onClick={() => handleStatusChange("RESOLVED")}
                            disabled={isUpdatingStatus}
                            className="h-8 text-xs font-semibold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Resolve Finding</span>
                          </Button>
                        )}

                        <Button
                          size="xs"
                          onClick={() => handleStatusChange("ADMIN_REVIEW")}
                          disabled={isUpdatingStatus}
                          className="h-8 text-xs font-semibold gap-1 bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                        >
                          <SendHorizontal className="h-3.5 w-3.5" />
                          <span>Submit for Admin Review</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleStatusChange("IN_REVIEW")}
                          disabled={isUpdatingStatus}
                          className="h-8 text-xs font-semibold gap-1 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Return to Review</span>
                        </Button>
                      </>
                    )}

                    {/* POTENTIAL_FALSE_POSITIVE -> Submit for Admin Review, Return to Review, (Admin: Reject False Positive) */}
                    {currentFinding.lifecycle_status === "POTENTIAL_FALSE_POSITIVE" && (
                      <>
                        {permissions.canResolveFindings && (
                          <Button
                            size="xs"
                            onClick={() => handleStatusChange("REJECTED")}
                            disabled={isUpdatingStatus}
                            className="h-8 text-xs font-semibold gap-1 bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Reject as False Positive</span>
                          </Button>
                        )}

                        <Button
                          size="xs"
                          onClick={() => handleStatusChange("ADMIN_REVIEW")}
                          disabled={isUpdatingStatus}
                          className="h-8 text-xs font-semibold gap-1 bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                        >
                          <SendHorizontal className="h-3.5 w-3.5" />
                          <span>Submit for Admin Review</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleStatusChange("IN_REVIEW")}
                          disabled={isUpdatingStatus}
                          className="h-8 text-xs font-semibold gap-1 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Return to Review</span>
                        </Button>
                      </>
                    )}

                    {/* ADMIN_REVIEW -> Admin can Approve & Resolve, Reject, Return. Reviewer sees pending status. */}
                    {currentFinding.lifecycle_status === "ADMIN_REVIEW" && (
                      <>
                        {permissions.canResolveFindings ? (
                          <>
                            <Button
                              size="xs"
                              onClick={() => handleStatusChange("RESOLVED")}
                              disabled={isUpdatingStatus}
                              className="h-8 text-xs font-semibold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span>Resolve Finding</span>
                            </Button>

                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => handleStatusChange("REJECTED")}
                              disabled={isUpdatingStatus}
                              className="h-8 text-xs font-semibold gap-1 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Reject (False Positive)</span>
                            </Button>

                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => handleStatusChange("IN_REVIEW")}
                              disabled={isUpdatingStatus}
                              className="h-8 text-xs font-semibold gap-1 cursor-pointer"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Return to Review</span>
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Under Administrator Review</span>
                          </span>
                        )}
                      </>
                    )}

                    {/* RESOLVED -> Admin can Reopen. Reviewer sees read-only resolved. */}
                    {currentFinding.lifecycle_status === "RESOLVED" && (
                      permissions.canReopenFindings ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleStatusChange("REOPENED")}
                          disabled={isUpdatingStatus}
                          className="h-8 text-xs font-semibold gap-1 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Reopen Finding</span>
                        </Button>
                      ) : (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span>Resolved (Read-only)</span>
                        </span>
                      )
                    )}

                    {/* REJECTED -> Admin can Reopen. Reviewer sees read-only rejected. */}
                    {currentFinding.lifecycle_status === "REJECTED" && (
                      permissions.canReopenFindings ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleStatusChange("IN_REVIEW")}
                          disabled={isUpdatingStatus}
                          className="h-8 text-xs font-semibold gap-1 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Reopen / Return to Review</span>
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Rejected as False Positive (Read-only)</span>
                        </span>
                      )
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Assignee Information & Actions */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/40 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Assigned to:</span>
                {currentFinding.assignee ? (
                  <Badge
                    variant="outline"
                    className="gap-1 text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>{currentFinding.assignee.full_name}</span>
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Unassigned</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {permissions.canAssignFindings && orgMembers.length > 0 && (
                  <select
                    value={currentFinding.assigned_to || ""}
                    onChange={(e) => handleAssignUser(e.target.value || null)}
                    disabled={isAssigning}
                    className="h-8 px-2 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {orgMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name} ({formatRoleLabel(m.role)})
                      </option>
                    ))}
                  </select>
                )}

                {permissions.canClaimFinding && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleSelfAssign}
                    disabled={
                      isAssigning ||
                      currentFinding.assigned_to === user?.id ||
                      (!permissions.canAssignFindings &&
                        Boolean(currentFinding.assigned_to) &&
                        currentFinding.assigned_to !== user?.id)
                    }
                    className="h-8 text-xs cursor-pointer gap-1"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>{currentFinding.assigned_to === user?.id ? "Assigned to you" : "Assign to me"}</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Remediation Due Date Section */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/40 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-500 shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">Due Date:</span>
                {currentFinding.remediation_due_date ? (
                  <span className="text-xs font-bold text-foreground">
                    {format(new Date(currentFinding.remediation_due_date), "dd MMM yyyy")}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground italic">No remediation deadline set.</span>
                )}

                {currentFinding.is_overdue && (
                  <Badge
                    variant="outline"
                    className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 gap-1 font-bold text-[10px]"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    <span>OVERDUE</span>
                  </Badge>
                )}
              </div>

              {permissions.canUpdateRemediationDueDate ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dueDateInput}
                    onChange={(e) => {
                      setDueDateInput(e.target.value);
                      if (e.target.value) {
                        handleSaveDueDate(e.target.value);
                      }
                    }}
                    disabled={isUpdatingDueDate}
                    className="h-8 px-2 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  />

                  {currentFinding.remediation_due_date && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setDueDateInput("");
                        handleSaveDueDate(null);
                      }}
                      disabled={isUpdatingDueDate}
                      className="h-8 text-xs text-muted-foreground hover:text-rose-500 cursor-pointer"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-muted-foreground italic">Read-only</span>
              )}
            </div>

            {/* Resolution Note / Reopen Reason Callout if applicable */}
            {currentFinding.resolution_note && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 block uppercase text-[10px]">
                  Resolution Note / Rationale
                </span>
                <p className="text-foreground">{currentFinding.resolution_note}</p>
              </div>
            )}

            {currentFinding.reopen_reason && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs space-y-1">
                <span className="font-bold text-rose-600 dark:text-rose-400 block uppercase text-[10px]">
                  Reopen Reason
                </span>
                <p className="text-foreground">{currentFinding.reopen_reason}</p>
              </div>
            )}
          </div>

          {/* Compliance Gap Evaluation & Severity Reasoning */}
          <Card className="border border-border/60 bg-card p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Compliance Evaluation
              </span>
              {typeof currentFinding.confidence === "number" && (
                <span className="text-xs font-mono font-semibold text-muted-foreground">
                  Confidence: {Math.round(currentFinding.confidence * 100)}%
                </span>
              )}
            </div>

            <div className="space-y-3 text-xs">
              {currentFinding.reasoning && (
                <div className="space-y-1">
                  <span className="font-semibold text-muted-foreground">Evaluation Reasoning:</span>
                  <p className="text-foreground/90 leading-relaxed bg-muted/20 p-3 rounded-xl border border-border/40">
                    {currentFinding.reasoning}
                  </p>
                </div>
              )}

              {currentFinding.recommendation && (
                <div className="space-y-1">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Recommended Remediation:
                  </span>
                  <p className="text-foreground/90 leading-relaxed bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/20">
                    {currentFinding.recommendation}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* SPRINT 7.4: Remediation Management & Evidence Tracking */}
          <RemediationSection
            findingId={currentFinding.id}
            recommendation={currentFinding.recommendation}
            reasoning={currentFinding.reasoning}
            severity={currentFinding.severity}
            organizationId={organizationId || currentFinding.organization_id}
            onRemediationChanged={() => {
              fetchAuxiliaryData();
            }}
          />

          {/* Matched Policy Evidence vs Regulation Statutory Text */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Policy Clause Card */}
            <Card className="border border-border/60 bg-card p-4 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-indigo-400" /> Internal Policy
                </span>
                {currentFinding.policy_clause_id && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {currentFinding.policy_clause_id}
                  </Badge>
                )}
              </div>

              <div className="bg-muted/30 p-3 rounded-xl border border-border/40 text-xs space-y-2">
                <p className="font-mono text-muted-foreground text-[11px] leading-relaxed line-clamp-6">
                  {currentFinding.matched_policy_text || "Clause context referenced in evaluation analysis."}
                </p>
                {currentFinding.matched_policy_text && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleCopyText(currentFinding.matched_policy_text || "", "Policy Clause")}
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-1.5"
                  >
                    <Copy className="h-3 w-3" /> Copy text
                  </Button>
                )}
              </div>
            </Card>

            {/* Regulation Citation Card */}
            <Card className="border border-border/60 bg-card p-4 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-amber-500" /> Statutory Regulation
                </span>
                {currentFinding.regulation_clause_id && (
                  <Badge variant="outline" className="font-mono text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400">
                    {currentFinding.regulation_clause_id}
                  </Badge>
                )}
              </div>

              <div className="bg-muted/30 p-3 rounded-xl border border-border/40 text-xs space-y-2">
                <p className="text-muted-foreground text-[11px] leading-relaxed line-clamp-6">
                  {currentFinding.citation || "Statutory clause requirements."}
                </p>
                {currentFinding.citation && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleCopyText(currentFinding.citation || "", "Regulation Citation")}
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-1.5"
                  >
                    <Copy className="h-3 w-3" /> Copy citation
                  </Button>
                )}
              </div>
            </Card>
          </div>

          {/* SPRINT 7.2: Upgraded Compliance Discussion, Threaded Comments & @Mentions */}
          <Card className="border border-border/60 bg-card p-4 space-y-4 shadow-2xs">
            {/* Discussion Header with Dynamic Counts & Filter Tabs */}
            <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-3 flex-wrap">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-indigo-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Discussion
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {discussionStats.totalCount} {discussionStats.totalCount === 1 ? "comment" : "comments"} · {discussionStats.unresolvedThreads} unresolved
                </p>
              </div>

              {/* Discussion Filter Pills (Sprint 7.2) */}
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/40">
                <button
                  type="button"
                  onClick={() => setDiscussionFilter("ALL")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer",
                    discussionFilter === "ALL"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All ({comments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDiscussionFilter("UNRESOLVED")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer",
                    discussionFilter === "UNRESOLVED"
                      ? "bg-background text-indigo-600 dark:text-indigo-400 shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Unresolved ({discussionStats.unresolvedThreads})
                </button>
                <button
                  type="button"
                  onClick={() => setDiscussionFilter("RESOLVED")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer",
                    discussionFilter === "RESOLVED"
                      ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Resolved ({discussionStats.resolvedThreads})
                </button>
              </div>
            </div>

            {/* Top-Level New Comment Composer (Sprint 7.2) */}
            {permissions.canCommentOnFindings ? (
              <form onSubmit={(e) => handleAddComment(e)} className="space-y-2">
                <div className="relative">
                  <textarea
                    value={commentText}
                    onChange={(e) => handleCommentTextChange(e.target.value)}
                    placeholder="Write a comment or type @ to mention a colleague..."
                    rows={2}
                    className="w-full p-2.5 text-xs rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />

                  {/* Mentions helper dropdown */}
                  {mentionQuery !== null && topLevelFilteredMembers.length > 0 && (
                    <div className="absolute left-0 bottom-full mb-1 w-72 max-h-48 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-xl z-30 p-1.5 space-y-1">
                      <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <AtSign className="h-3 w-3 text-indigo-500" /> Mention Team Member ({topLevelFilteredMembers.length})
                      </div>
                      {topLevelFilteredMembers.map((m) => (
                        <button
                          key={m.user_id}
                          type="button"
                          onClick={() => selectMentionMember(m, false)}
                          className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-2 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-6 w-6 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                              {m.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className="font-semibold text-foreground block truncate">{m.full_name}</span>
                              <span className="text-[10px] text-muted-foreground font-mono truncate block">
                                @{m.username || m.email.split("@")[0]}
                              </span>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium shrink-0">
                            {formatRoleLabel(m.role)}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setCommentText((prev) => (prev.endsWith("@") ? prev : `${prev}@`));
                      setMentionQuery("");
                    }}
                    className="h-8 text-xs text-muted-foreground hover:text-indigo-600 gap-1 px-2 cursor-pointer"
                  >
                    <AtSign className="h-3.5 w-3.5" />
                    <span>Mention</span>
                  </Button>

                  <Button
                    type="submit"
                    size="sm"
                    disabled={isCommenting || !commentText.trim()}
                    className="h-8 px-3 text-xs gap-1.5 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{isCommenting ? "Adding..." : "Post Comment"}</span>
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-muted-foreground italic py-1">Viewers have read-only access to finding discussions.</p>
            )}

            {/* Comments Thread List with 1-Level Threading & Resolution */}
            {isLoadingComments ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center">Loading discussion...</p>
            ) : comments.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-muted/10 border border-dashed border-border/60 space-y-1.5">
                <MessageCircle className="h-6 w-6 text-muted-foreground mx-auto" />
                <p className="text-xs font-semibold text-foreground">No discussion yet.</p>
                <p className="text-[11px] text-muted-foreground">
                  Start a discussion about this finding to collaborate with your team.
                </p>
              </div>
            ) : filteredCommentThreads.length === 0 ? (
              <div className="p-4 text-center rounded-xl bg-muted/10 border border-border/40 text-xs text-muted-foreground italic">
                {discussionFilter === "UNRESOLVED"
                  ? "All discussions on this finding have been resolved."
                  : "No resolved discussions found."}
              </div>
            ) : (
              <div className="space-y-4 divide-y divide-border/30 pt-1">
                {filteredCommentThreads.map((c) => (
                  <div key={c.id} className="pt-3 space-y-2 first:pt-0">
                    {/* Top comment header */}
                    <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {c.user_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-foreground">{c.user_name}</span>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium">
                          {getMemberRole(c.user_id, c.user_role)}
                        </Badge>
                        {c.is_resolved && (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] gap-1 font-semibold">
                            <Check className="h-2.5 w-2.5" /> Discussion Resolved
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono text-[10px]">
                          {format(new Date(c.created_at), "dd MMM yyyy, HH:mm")}
                        </span>
                        {(c.user_id === user?.id || user?.is_superuser) && (
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="text-muted-foreground hover:text-rose-600 cursor-pointer p-0.5"
                            title="Delete comment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap pl-8">{c.content}</p>

                    {/* Comment actions: Reply & Resolve discussion */}
                    <div className="flex items-center gap-4 pt-1 text-[11px] pl-8">
                      {permissions.canCommentOnFindings && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingToId(replyingToId === c.id ? null : c.id);
                            setReplyText("");
                            setReplyMentionQuery(null);
                          }}
                          className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <CornerDownRight className="h-3 w-3" />
                          <span>Reply</span>
                        </button>
                      )}

                      {permissions.canResolveDiscussion && (
                        <button
                          type="button"
                          onClick={() => handleToggleResolveComment(c.id, Boolean(c.is_resolved))}
                          className="text-muted-foreground hover:text-foreground font-medium flex items-center gap-1 cursor-pointer"
                          title="Resolving a comment discussion only closes this thread and does NOT resolve the finding."
                        >
                          <CheckCircle2 className={cn("h-3.5 w-3.5", c.is_resolved ? "text-emerald-500" : "")} />
                          <span>{c.is_resolved ? "Reopen Discussion" : "Resolve Discussion"}</span>
                        </button>
                      )}
                    </div>

                    {/* Inline Reply Form */}
                    {replyingToId === c.id && (
                      <form onSubmit={(e) => handleAddComment(e, c.id)} className="ml-8 mt-2 pl-3 pt-2 pb-2 space-y-2 border-l-2 border-indigo-500/30 relative bg-muted/20 rounded-r-xl pr-3">
                        <div className="relative">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => handleReplyTextChange(e.target.value)}
                            placeholder={`Reply to ${c.user_name} or type @ to mention...`}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                          />

                          {/* Mentions helper dropdown for inline replies */}
                          {replyMentionQuery !== null && replyFilteredMembers.length > 0 && (
                            <div className="absolute left-0 bottom-full mb-1 w-72 max-h-48 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-xl z-30 p-1.5 space-y-1">
                              <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                <AtSign className="h-3 w-3 text-indigo-500" /> Mention Team Member ({replyFilteredMembers.length})
                              </div>
                              {replyFilteredMembers.map((m) => (
                                <button
                                  key={m.user_id}
                                  type="button"
                                  onClick={() => selectMentionMember(m, true)}
                                  className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-2 cursor-pointer transition-colors"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="h-6 w-6 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                                      {m.full_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <span className="font-semibold text-foreground block truncate">{m.full_name}</span>
                                      <span className="text-[10px] text-muted-foreground font-mono truncate block">
                                        @{m.username || m.email.split("@")[0]}
                                      </span>
                                    </div>
                                  </div>
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium shrink-0">
                                    {formatRoleLabel(m.role)}
                                  </Badge>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setReplyingToId(null);
                              setReplyText("");
                              setReplyMentionQuery(null);
                            }}
                            className="h-7 text-xs cursor-pointer"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="xs"
                            disabled={isCommenting || !replyText.trim()}
                            className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer font-semibold"
                          >
                            {isCommenting ? "Posting..." : "Post Reply"}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Threaded Nested Replies (1-level nesting) */}
                    {c.replies && c.replies.length > 0 && (
                      <div className="ml-8 mt-2 space-y-2 border-l-2 border-border/50 pl-3">
                        {c.replies.map((reply) => (
                          <div key={reply.id} className="bg-muted/30 p-2.5 rounded-xl space-y-1 border border-border/30">
                            <div className="flex items-center justify-between text-[11px] gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <div className="h-5 w-5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[9px] font-bold shrink-0">
                                  {reply.user_name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-bold text-foreground">{reply.user_name}</span>
                                <Badge variant="outline" className="text-[8px] px-1 py-0 font-medium">
                                  {getMemberRole(reply.user_id, reply.user_role)}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground font-mono text-[10px]">
                                  {format(new Date(reply.created_at), "dd MMM, HH:mm")}
                                </span>
                                {(reply.user_id === user?.id || user?.is_superuser) && (
                                  <button
                                    onClick={() => handleDeleteComment(reply.id)}
                                    className="text-muted-foreground hover:text-rose-600 cursor-pointer"
                                    title="Delete reply"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap pl-6.5">{reply.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Activity Timeline Section */}
          <Card className="border border-border/60 bg-card p-4 space-y-3 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-indigo-500" /> Activity Timeline
            </span>

            {isLoadingActivities ? (
              <p className="text-xs text-muted-foreground italic">Loading activity timeline...</p>
            ) : activities.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2 text-center">No activity has been recorded.</p>
            ) : (
              <div className="space-y-2">
                {activities.map((act) => (
                  <div key={act.id} className="flex items-start gap-2 text-xs border-l-2 border-indigo-500/30 pl-3 py-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">
                        <span className="font-semibold">{act.user_name}</span>: {act.description}
                      </p>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {format(new Date(act.created_at), "dd MMM yyyy, HH:mm")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Fixed Footer Actions */}
        <div className="shrink-0 p-4 border-t border-border bg-card flex items-center justify-between gap-3 z-10 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs cursor-pointer"
          >
            Close
          </Button>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const q = encodeURIComponent(`Explain why this finding (${currentFinding.id}) exists and what should be done.`);
                router.push(`/ai-assistant?findingId=${currentFinding.id}&question=${q}`);
              }}
              className="text-xs cursor-pointer gap-1.5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
            >
              <Sparkles className="h-3.5 w-3.5" /> Explain with AI
            </Button>

            <Button
              size="sm"
              onClick={() => {
                const searchTerm = currentFinding.policy_clause_id || currentFinding.regulation_clause_id || "";
                router.push(searchTerm ? `/knowledge-graph?search=${encodeURIComponent(searchTerm)}` : "/knowledge-graph");
              }}
              className="text-xs cursor-pointer gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              <Network className="h-3.5 w-3.5" /> Explore Graph
            </Button>
          </div>
        </div>
      </div>

      {/* ── Submit for Admin Review Modal (Sprint 7.1) ── */}
      {isSubmitReviewModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-background/80 animate-drawer-backdrop">
          <Card className="w-full max-w-md bg-card p-6 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500 border border-sky-500/20 shrink-0">
                <SendHorizontal className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Submit for Admin Review</h3>
                <p className="text-xs text-muted-foreground">
                  Notify Organization Administrators that review & remediation are ready for final decision.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Submission Note (Optional)</label>
              <textarea
                value={submissionNoteInput}
                onChange={(e) => setSubmissionNoteInput(e.target.value)}
                placeholder="Add notes for the administrator regarding remediation evidence..."
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSubmitReviewModalOpen(false)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmSubmitReview}
                disabled={isSubmittingReview}
                className="text-xs font-semibold cursor-pointer bg-sky-600 hover:bg-sky-700 text-white"
              >
                {isSubmittingReview ? "Submitting..." : "Submit to Admin"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Resolve Confirmation Modal (Admins only, Sprint 7.1) ── */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-background/80 animate-drawer-backdrop">
          <Card className="w-full max-w-md bg-card p-6 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Resolve Finding?</h3>
                <p className="text-xs text-muted-foreground">
                  Confirm that the remediation for this finding has been completed.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Resolution Note</label>
              <textarea
                value={resolutionNoteInput}
                onChange={(e) => setResolutionNoteInput(e.target.value)}
                placeholder="Describe how the finding was remediated or addressed..."
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsResolveModalOpen(false)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmResolve}
                disabled={isResolving}
                className="text-xs font-semibold cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isResolving ? "Resolving..." : "Resolve Finding"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Reject False Positive Modal (Admins only, Sprint 7.1) ── */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-background/80 animate-drawer-backdrop">
          <Card className="w-full max-w-md bg-card p-6 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
                <XCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Reject Finding (False Positive)?</h3>
                <p className="text-xs text-muted-foreground">
                  Mark this finding as an evaluated false positive. The finding will remain in audit history.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Rejection Reason</label>
              <textarea
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                placeholder="State the justification why this finding is a false positive..."
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRejectModalOpen(false)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmReject}
                disabled={isRejecting}
                className="text-xs font-semibold cursor-pointer bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isRejecting ? "Rejecting..." : "Reject (False Positive)"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Reopen Confirmation Modal (Admins only, Sprint 7.1) ── */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-background/80 animate-drawer-backdrop">
          <Card className="w-full max-w-md bg-card p-6 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Reopen Finding?</h3>
                <p className="text-xs text-muted-foreground">
                  This will return the finding to active remediation.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Reopen Reason</label>
              <textarea
                value={reopenReasonInput}
                onChange={(e) => setReopenReasonInput(e.target.value)}
                placeholder="State the reason why this finding is being reopened..."
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReopenModalOpen(false)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmReopen}
                disabled={isReopening}
                className="text-xs font-semibold cursor-pointer bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isReopening ? "Reopening..." : "Reopen Finding"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );

  return createPortal(drawerContent, document.body);
};
