"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  ExternalLink,
  Copy,
  ArrowRight,
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
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
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
      return {
        label: "REMEDIATION",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
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
  const { user } = useAuth();

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
  const [commentText, setCommentText] = useState("");

  // Confirmation Modals
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolutionNoteInput, setResolutionNoteInput] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenReasonInput, setReopenReasonInput] = useState("");
  const [isReopening, setIsReopening] = useState(false);

  // Synchronize internal finding state when prop changes
  const [dueDateInput, setDueDateInput] = useState<string>("");
  const [isUpdatingDueDate, setIsUpdatingDueDate] = useState(false);

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

  // Load comments, activities, and organization members when drawer opens
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

    const targetOrgId = organizationId || (typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") || undefined : undefined);

    if (targetOrgId) {
      try {
        const membersData = await organizationsService.getMembers(targetOrgId);
        setOrgMembers(membersData || []);
      } catch (err) {
        console.error("Error loading org members for assignment:", err);
      }
    }
  }, [currentFinding?.id, organizationId]);

  useEffect(() => {
    if (isOpen && currentFinding?.id) {
      fetchAuxiliaryData();
    }
  }, [isOpen, currentFinding?.id, fetchAuxiliaryData]);

  if (!isOpen || !currentFinding) return null;

  const severityInfo = deriveSeverityBadge(currentFinding.severity, currentFinding.status);
  const lifecycleInfo = deriveLifecycleBadge(currentFinding.lifecycle_status);

  // Update Status Handler
  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === "RESOLVED") {
      setIsResolveModalOpen(true);
      return;
    }
    if (newStatus === "REOPENED") {
      setIsReopenModalOpen(true);
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const updated = await findingsService.updateStatus(currentFinding.id, newStatus);
      const merged: FindingItem = { ...currentFinding, lifecycle_status: updated.lifecycle_status, updated_at: updated.updated_at };
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

  // Self Assign
  const handleSelfAssign = () => {
    if (user?.id) {
      handleAssignUser(user.id);
    }
  };

  // Resolve Confirmation Handler
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

  // Reopen Confirmation Handler
  const handleConfirmReopen = async () => {
    setIsReopening(true);
    try {
      const updated = await findingsService.reopenFinding(currentFinding.id, reopenReasonInput);
      const merged: FindingItem = {
        ...currentFinding,
        lifecycle_status: "REOPENED",
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

  // Add Comment Handler
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setIsCommenting(true);
    try {
      const newComment = await findingsService.addComment(currentFinding.id, commentText);
      setComments((prev) => [...prev, newComment]);
      setCommentText("");
      toast.success("Comment added.");
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to add comment.";
      toast.error(msg);
    } finally {
      setIsCommenting(false);
    }
  };

  // Delete Comment Handler
  const handleDeleteComment = async (commentId: string) => {
    try {
      await findingsService.deleteComment(currentFinding.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
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

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background/80 backdrop-blur-xs flex justify-end transition-opacity">
      {/* Backdrop overlay click */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Drawer Body */}
      <div className="relative w-full max-w-2xl bg-card border-l border-border shadow-2xl h-full flex flex-col z-10 overflow-y-auto">
        {/* Drawer Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between p-5 border-b border-border/60 bg-card/95 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Finding #{currentFinding.id.slice(0, 8)}</h3>
              <p className="text-xs text-muted-foreground font-mono">
                {reportName || `Report #${currentFinding.report_id.slice(0, 8)}`}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Close detail drawer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1">
          {/* ── Status, Assignee & Operational Lifecycle Bar ── */}
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

              {/* Contextual Lifecycle Status Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {currentFinding.lifecycle_status === "OPEN" || currentFinding.lifecycle_status === "REOPENED" ? (
                  <Button
                    size="xs"
                    onClick={() => handleStatusChange("IN_REVIEW")}
                    disabled={isUpdatingStatus}
                    className="h-8 text-xs font-semibold gap-1 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>Start Review</span>
                  </Button>
                ) : currentFinding.lifecycle_status === "IN_REVIEW" ? (
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
                ) : currentFinding.lifecycle_status === "REMEDIATION" ? (
                  <>
                    <Button
                      size="xs"
                      onClick={() => handleStatusChange("RESOLVED")}
                      disabled={isUpdatingStatus}
                      className="h-8 text-xs font-semibold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>Mark Resolved</span>
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
                ) : currentFinding.lifecycle_status === "RESOLVED" ? (
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
                ) : null}
              </div>
            </div>

            {/* Assignee Information & Actions */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/40 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Assigned to:</span>
                {currentFinding.assignee ? (
                  <Badge variant="outline" className="gap-1 text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30">
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>{currentFinding.assignee.full_name}</span>
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Unassigned</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Org Members Dropdown */}
                {orgMembers.length > 0 && (
                  <select
                    value={currentFinding.assigned_to || ""}
                    onChange={(e) => handleAssignUser(e.target.value || null)}
                    disabled={isAssigning}
                    className="h-8 px-2 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {orgMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name} ({m.role})
                      </option>
                    ))}
                  </select>
                )}

                {/* Self Assign Button */}
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleSelfAssign}
                  disabled={isAssigning || currentFinding.assigned_to === user?.id}
                  className="h-8 text-xs cursor-pointer gap-1"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Assign to me</span>
                </Button>
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
                  <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 gap-1 font-bold text-[10px]">
                    <AlertTriangle className="h-3 w-3" />
                    <span>OVERDUE</span>
                  </Badge>
                )}
              </div>

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
            </div>

            {/* Resolution Note / Reopen Reason Callout if applicable */}
            {currentFinding.resolution_note && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 block uppercase text-[10px]">
                  Resolution Note
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

          {/* ── Evidence & Citations ── */}
          <Card className="border border-border/60 bg-card p-4 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Policy Clause Reference
              </span>
              {currentFinding.policy_clause_id && (
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  ID: {currentFinding.policy_clause_id}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed">
              {currentFinding.matched_policy_text || "No exact matching policy clause text returned."}
            </p>
            {currentFinding.matched_policy_text && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleCopyText(currentFinding.matched_policy_text!, "Policy text")}
                className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer gap-1"
              >
                <Copy className="h-3 w-3" /> Copy Policy Text
              </Button>
            )}
          </Card>

          <Card className="border border-border/60 bg-card p-4 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Statutory Regulation Reference
              </span>
              {currentFinding.regulation_clause_id && (
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  ID: {currentFinding.regulation_clause_id}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed">
              {currentFinding.citation || "Statutory regulation clause citation details."}
            </p>
            {currentFinding.citation && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleCopyText(currentFinding.citation!, "Regulation citation")}
                className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer gap-1"
              >
                <Copy className="h-3 w-3" /> Copy Citation
              </Button>
            )}
          </Card>

          {/* ── Explanation Section ── */}
          <Card className="border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-2 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> LLM Legal Reasoning & Analysis
            </span>
            {currentFinding.reasoning ? (
              <p className="text-xs text-foreground leading-relaxed font-medium">
                {currentFinding.reasoning}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No legal reasoning text available for this finding.
              </p>
            )}
          </Card>

          {/* ── Recommendation Section ── */}
          <Card className="border border-amber-500/20 bg-amber-500/5 p-4 space-y-2 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Recommended Remediation
            </span>
            {currentFinding.recommendation ? (
              <p className="text-xs text-amber-900 dark:text-amber-200 font-medium leading-relaxed">
                {currentFinding.recommendation}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No specific remediation recommendation provided for this clause.
              </p>
            )}
          </Card>

          {/* ── Comments Section ── */}
          <Card className="border border-border/60 bg-card p-4 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-indigo-500" /> Collaboration Comments ({comments.length})
              </span>
            </div>

            {/* Comment Submission Form */}
            <form onSubmit={handleAddComment} className="space-y-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment or note regarding remediation..."
                rows={2}
                className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isCommenting || !commentText.trim()}
                  className="h-7 text-xs font-semibold cursor-pointer gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Send className="h-3 w-3" />
                  <span>{isCommenting ? "Commenting..." : "Comment"}</span>
                </Button>
              </div>
            </form>

            {/* Comments List */}
            {isLoadingComments ? (
              <p className="text-xs text-muted-foreground italic">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2 text-center">No comments yet.</p>
            ) : (
              <div className="space-y-3 divide-y divide-border/40 pt-1">
                {comments.map((c) => (
                  <div key={c.id} className="pt-3 space-y-1 first:pt-0">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-foreground">{c.user_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono">
                          {format(new Date(c.created_at), "dd MMM yyyy, HH:mm")}
                        </span>
                        {(c.user_id === user?.id || user?.is_superuser) && (
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="text-rose-500 hover:text-rose-700 cursor-pointer"
                            title="Delete comment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── Activity Timeline Section ── */}
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

        {/* Drawer Footer Actions */}
        <div className="sticky bottom-0 z-20 p-4 border-t border-border/60 bg-card/95 backdrop-blur-md flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs cursor-pointer"
          >
            Close
          </Button>

          <div className="flex items-center gap-2 flex-wrap">
            {currentFinding.lifecycle_status === "RESOLVED" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReopenModalOpen(true)}
                className="text-xs cursor-pointer gap-1.5 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reopen Finding
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsResolveModalOpen(true)}
                className="text-xs cursor-pointer gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                <CheckCircle className="h-3.5 w-3.5" /> Resolve Finding
              </Button>
            )}

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

      {/* ── Resolve Confirmation Modal ── */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <Card className="w-full max-w-md bg-card p-6 border border-border shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
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
                {isResolving ? "Resolving..." : "Mark Resolved"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Reopen Confirmation Modal ── */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <Card className="w-full max-w-md bg-card p-6 border border-border shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
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
};
