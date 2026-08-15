"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import {
  Wrench,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  Calendar,
  Flag,
  UploadCloud,
  FileText,
  Paperclip,
  Trash2,
  Download,
  ExternalLink,
  RotateCcw,
  Check,
  SendHorizontal,
  XCircle,
  Plus,
  RefreshCw,
  Edit3,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import {
  remediationsService,
  RemediationDetail,
  RemediationEvidenceItem,
} from "@/services/api/remediations";
import { organizationsService, OrganizationMember } from "@/services/api/organizations";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RemediationSectionProps {
  findingId: string;
  recommendation?: string | null;
  reasoning?: string | null;
  severity?: string | null;
  organizationId?: string | null;
  onRemediationChanged?: () => void;
}

function deriveRemediationStatusBadge(status?: string, isOverdue?: boolean) {
  const st = (status || "NOT_STARTED").toUpperCase();

  if (isOverdue && st !== "VERIFIED" && st !== "APPROVED") {
    return {
      label: "OVERDUE",
      className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold",
    };
  }

  switch (st) {
    case "IN_PROGRESS":
      return {
        label: "IN PROGRESS",
        className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
      };
    case "READY_FOR_REVIEW":
      return {
        label: "READY FOR REVIEW",
        className: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
      };
    case "VERIFIED":
      return {
        label: "VERIFIED",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      };
    case "APPROVED":
      return {
        label: "APPROVED",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold",
      };
    case "REJECTED":
      return {
        label: "REJECTED",
        className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      };
    case "NOT_STARTED":
    default:
      return {
        label: "NOT STARTED",
        className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
      };
  }
}

function derivePriorityBadge(priority?: string) {
  const p = (priority || "HIGH").toUpperCase();
  switch (p) {
    case "CRITICAL":
      return { label: "CRITICAL", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" };
    case "HIGH":
      return { label: "HIGH", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" };
    case "MEDIUM":
      return { label: "MEDIUM", className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30" };
    case "LOW":
    default:
      return { label: "LOW", className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30" };
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RemediationSection({
  findingId,
  recommendation,
  reasoning,
  severity,
  organizationId,
  onRemediationChanged,
}: RemediationSectionProps) {
  const { user, permissions } = useAuth();

  const [remediation, setRemediation] = useState<RemediationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([]);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("HIGH");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAssignee, setEditAssignee] = useState("");

  // Modals for status transitions
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [verifyNoteInput, setVerifyNoteInput] = useState("");

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState("");

  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approveNoteInput, setApproveNoteInput] = useState("");

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnReasonInput, setReturnReasonInput] = useState("");

  // Evidence upload state
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeOrgId =
    organizationId ||
    (typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null);

  const fetchRemediation = useCallback(async () => {
    if (!findingId) return;
    setIsLoading(true);
    try {
      const data = await remediationsService.getRemediation(findingId);
      setRemediation(data);
      if (data) {
        setEditTitle(data.title);
        setEditDescription(data.description || "");
        setEditPriority(data.priority);
        setEditAssignee(data.assigned_to || "");
        if (data.due_date) {
          const d = new Date(data.due_date);
          setEditDueDate(!isNaN(d.getTime()) ? d.toISOString().split("T")[0] : "");
        } else {
          setEditDueDate("");
        }
      }
    } catch (err) {
      console.error("Failed fetching remediation:", err);
    } finally {
      setIsLoading(false);
    }
  }, [findingId]);

  const fetchMembers = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const members = await organizationsService.getMembers(activeOrgId);
      setOrgMembers(members || []);
    } catch (err) {
      console.warn("Failed fetching members for remediation owner dropdown:", err);
    }
  }, [activeOrgId]);

  useEffect(() => {
    fetchRemediation();
    fetchMembers();
  }, [fetchRemediation, fetchMembers]);

  // Actions
  const handleCreateRemediation = async () => {
    setIsMutating(true);
    try {
      const data = await remediationsService.createRemediation(findingId, {
        title: `Remediation for Finding #${findingId.slice(0, 8)}`,
        description: recommendation || reasoning || "",
        priority: severity ? (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(severity.toUpperCase()) ? severity.toUpperCase() : "HIGH") : "HIGH",
      });
      setRemediation(data);
      toast.success("Remediation record created.");
      if (onRemediationChanged) onRemediationChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to create remediation.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleSaveRemediationEdits = async () => {
    if (!remediation) return;
    setIsMutating(true);
    try {
      const updated = await remediationsService.updateRemediation(findingId, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        priority: editPriority,
        assigned_to: editAssignee || null,
        due_date: editDueDate ? new Date(`${editDueDate}T00:00:00Z`).toISOString() : null,
      });
      setRemediation(updated);
      setIsEditing(false);
      toast.success("Remediation plan updated.");
      if (onRemediationChanged) onRemediationChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update remediation.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleStartRemediation = async () => {
    setIsMutating(true);
    try {
      const updated = await remediationsService.startRemediation(findingId);
      setRemediation(updated);
      toast.success("Remediation marked In Progress.");
      if (onRemediationChanged) onRemediationChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to start remediation.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleSubmitForReview = async () => {
    setIsMutating(true);
    try {
      const updated = await remediationsService.submitForReview(findingId);
      setRemediation(updated);
      toast.success("Remediation submitted for review.");
      if (onRemediationChanged) onRemediationChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to submit remediation for review.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleVerify = async () => {
    setIsMutating(true);
    try {
      const updated = await remediationsService.verifyRemediation(findingId, verifyNoteInput.trim() || undefined);
      setRemediation(updated);
      setIsVerifyModalOpen(false);
      setVerifyNoteInput("");
      toast.success("Remediation verified successfully.");
      if (onRemediationChanged) onRemediationChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to verify remediation.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReasonInput.trim()) {
      toast.error("Please provide a reason for rejecting the remediation.");
      return;
    }
    setIsMutating(true);
    try {
      const updated = await remediationsService.rejectRemediation(findingId, rejectReasonInput.trim());
      setRemediation(updated);
      setIsRejectModalOpen(false);
      setRejectReasonInput("");
      toast.success("Remediation rejected and returned to In Progress.");
      if (onRemediationChanged) onRemediationChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to reject remediation.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleApprove = async () => {
    setIsMutating(true);
    try {
      const updated = await remediationsService.approveRemediation(findingId, approveNoteInput.trim() || undefined);
      setRemediation(updated);
      setIsApproveModalOpen(false);
      setApproveNoteInput("");
      toast.success("Remediation approved by Administrator.");
      if (onRemediationChanged) onRemediationChanged();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.info(err?.response?.data?.detail || "Remediation has already been approved.");
        fetchRemediation();
        setIsApproveModalOpen(false);
      } else {
        toast.error(err?.response?.data?.detail || "Failed to approve remediation.");
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handleReturn = async () => {
    if (!returnReasonInput.trim()) {
      toast.error("Please provide a reason for returning the remediation.");
      return;
    }
    setIsMutating(true);
    try {
      const updated = await remediationsService.returnRemediation(findingId, returnReasonInput.trim());
      setRemediation(updated);
      setIsReturnModalOpen(false);
      setReturnReasonInput("");
      toast.success("Remediation returned to In Progress.");
      if (onRemediationChanged) onRemediationChanged();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.info(err?.response?.data?.detail || "Remediation state changed.");
        fetchRemediation();
        setIsReturnModalOpen(false);
      } else {
        toast.error(err?.response?.data?.detail || "Failed to return remediation.");
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidenceFile) {
      toast.error("Please select a file to upload.");
      return;
    }
    setIsUploadingEvidence(true);
    try {
      const evItem = await remediationsService.uploadEvidence(findingId, evidenceFile, evidenceDescription.trim() || undefined);
      setRemediation((prev) => (prev ? { ...prev, evidence: [evItem, ...prev.evidence] } : null));
      setEvidenceFile(null);
      setEvidenceDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Evidence attached successfully.");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to upload evidence.");
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  const handleDeleteEvidence = async (evidenceId: string) => {
    if (!confirm("Are you sure you want to delete this evidence file?")) return;
    try {
      await remediationsService.deleteEvidence(findingId, evidenceId);
      setRemediation((prev) => (prev ? { ...prev, evidence: prev.evidence.filter((e) => e.id !== evidenceId) } : null));
      toast.success("Evidence deleted.");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to delete evidence.");
    }
  };

  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState<string | null>(null);

  const handleDownloadEvidence = async (evidenceId: string, filename: string) => {
    setDownloadingEvidenceId(evidenceId);
    try {
      const blob = await remediationsService.downloadEvidence(findingId, evidenceId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (err: any) {
      console.error("Failed to download evidence:", err);
      toast.error(err?.response?.data?.detail || "Failed to download evidence file.");
    } finally {
      setDownloadingEvidenceId(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4 border border-border/60 bg-card space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
          <span className="text-xs text-muted-foreground">Loading remediation details...</span>
        </div>
      </Card>
    );
  }

  // If no remediation exists yet
  if (!remediation) {
    return (
      <Card className="p-4 border border-dashed border-border/60 bg-muted/10 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-indigo-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Remediation Plan
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              No remediation has been created for this finding yet.
            </p>
          </div>

          {permissions.canManageRemediation && (
            <Button
              size="xs"
              onClick={handleCreateRemediation}
              disabled={isMutating}
              className="h-8 text-xs font-semibold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Remediation</span>
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const statusBadge = deriveRemediationStatusBadge(remediation.status, remediation.is_overdue);
  const priorityBadge = derivePriorityBadge(remediation.priority);

  return (
    <Card className="p-4 border border-border/60 bg-card space-y-4 shadow-2xs">
      {/* Header with Title & Status Badges */}
      <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-3 flex-wrap">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Wrench className="h-4 w-4 text-indigo-500 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground truncate">
              {remediation.title}
            </h3>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-bold", statusBadge.className)}>
              {statusBadge.label}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-semibold", priorityBadge.className)}>
              {priorityBadge.label} PRIORITY
            </Badge>
          </div>
        </div>

        {permissions.canManageRemediation && !isEditing && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setIsEditing(true)}
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
          >
            <Edit3 className="h-3 w-3" />
            <span>Edit Plan</span>
          </Button>
        )}
      </div>

      {/* Editing Mode */}
      {isEditing ? (
        <div className="space-y-3 p-3 bg-muted/20 rounded-xl border border-border/40 text-xs">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full p-2 text-xs rounded-lg border border-input bg-background text-foreground"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted-foreground">Description / Action Plan</label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full p-2 text-xs rounded-lg border border-input bg-background text-foreground resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">Owner / Assignee</label>
              <select
                value={editAssignee}
                onChange={(e) => setEditAssignee(e.target.value)}
                className="w-full h-8 px-2 text-xs rounded-lg border border-input bg-background text-foreground cursor-pointer"
              >
                <option value="">Unassigned</option>
                {orgMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name || m.username || m.user_id} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="w-full h-8 px-2 text-xs rounded-lg border border-input bg-background text-foreground cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">Priority</label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
                className="w-full h-8 px-2 text-xs rounded-lg border border-input bg-background text-foreground cursor-pointer"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => setIsEditing(false)}
              className="h-7 text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={handleSaveRemediationEdits}
              disabled={isMutating}
              className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer"
            >
              Save Changes
            </Button>
          </div>
        </div>
      ) : (
        /* Read Mode Details */
        <div className="space-y-3 text-xs">
          {remediation.description && (
            <div className="space-y-1">
              <span className="font-semibold text-muted-foreground text-[11px]">Corrective Action Plan:</span>
              <p className="text-foreground leading-relaxed bg-muted/20 p-3 rounded-xl border border-border/40">
                {remediation.description}
              </p>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-muted/10 border border-border/30">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                <UserCheck className="h-3 w-3" /> Owner
              </span>
              <p className="text-xs font-semibold text-foreground">
                {remediation.assignee ? remediation.assignee.full_name : "Unassigned"}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Deadline
              </span>
              <p className="text-xs font-semibold text-foreground">
                {remediation.due_date ? format(new Date(remediation.due_date), "MMM d, yyyy") : "No due date"}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                <Flag className="h-3 w-3" /> Priority
              </span>
              <p className="text-xs font-semibold text-foreground">
                {remediation.priority}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Verification & Approval Callouts */}
      {remediation.verification_note && (
        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs space-y-1">
          <span className="font-bold text-sky-600 dark:text-sky-400 block uppercase text-[10px]">
            Reviewer Verification Note ({remediation.verifier?.full_name || "Reviewer"})
          </span>
          <p className="text-foreground">{remediation.verification_note}</p>
        </div>
      )}

      {remediation.status === "APPROVED" && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1.5 shadow-2xs">
          <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 uppercase text-[11px]">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>Remediation Approved</span>
          </div>
          <p className="text-muted-foreground text-xs">
            Approved by <span className="font-semibold text-foreground">{remediation.admin_approver?.full_name || "Administrator"}</span> on{" "}
            <span className="font-semibold text-foreground">
              {remediation.admin_approved_at
                ? format(new Date(remediation.admin_approved_at), "dd MMM yyyy, h:mm a")
                : "recently"}
            </span>
          </p>
          {remediation.admin_note && (
            <p className="text-foreground text-xs mt-1 bg-background/50 p-2 rounded-lg border border-emerald-500/10 italic">
              "{remediation.admin_note}"
            </p>
          )}
        </div>
      )}

      {/* Action Workflow Buttons */}
      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/40">
        {remediation.status === "NOT_STARTED" && permissions.canManageRemediation && (
          <Button
            size="xs"
            onClick={handleStartRemediation}
            disabled={isMutating}
            className="h-8 text-xs font-semibold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Start Remediation</span>
          </Button>
        )}

        {(remediation.status === "IN_PROGRESS" || remediation.status === "REJECTED") && permissions.canManageRemediation && (
          <Button
            size="xs"
            onClick={handleSubmitForReview}
            disabled={isMutating}
            className="h-8 text-xs font-semibold gap-1.5 bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
          >
            <SendHorizontal className="h-3.5 w-3.5" />
            <span>Submit for Review</span>
          </Button>
        )}

        {remediation.status === "READY_FOR_REVIEW" && (
          <>
            {permissions.canVerifyRemediation && (
              <>
                <Button
                  size="xs"
                  onClick={() => setIsVerifyModalOpen(true)}
                  disabled={isMutating}
                  className="h-8 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Verify Remediation</span>
                </Button>

                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setIsRejectModalOpen(true)}
                  disabled={isMutating}
                  className="h-8 text-xs font-semibold gap-1.5 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Reject Remediation</span>
                </Button>
              </>
            )}
          </>
        )}

        {remediation.status === "VERIFIED" && (
          <>
            {permissions.canApproveRemediation && (
              <>
                <Button
                  size="xs"
                  onClick={() => setIsApproveModalOpen(true)}
                  disabled={isMutating}
                  className="h-8 text-xs font-semibold gap-1.5 bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Approve Remediation</span>
                </Button>

                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setIsReturnModalOpen(true)}
                  disabled={isMutating}
                  className="h-8 text-xs font-semibold gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Return to In Progress</span>
                </Button>
              </>
            )}
          </>
        )}

        {remediation.status === "APPROVED" && (
          <div className="flex items-center justify-between w-full gap-2 flex-wrap">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Remediation Approved</span>
            </span>

            {permissions.canApproveRemediation && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => setIsReturnModalOpen(true)}
                disabled={isMutating}
                className="h-8 text-xs font-semibold gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Return to In Progress</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Remediation Evidence Section */}
      <div className="space-y-3 pt-2 border-t border-border/40">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5 text-indigo-500" /> Attached Evidence ({remediation.evidence.length})
          </span>
        </div>

        {/* Evidence List */}
        {remediation.evidence.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic bg-muted/10 p-3 rounded-lg border border-border/30">
            No remediation evidence submitted.
          </p>
        ) : (
          <div className="space-y-2">
            {remediation.evidence.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold text-foreground truncate">{ev.original_filename}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                      <span>{formatFileSize(ev.file_size)}</span>
                      <span>·</span>
                      <span>Uploaded by {ev.uploader?.full_name || "User"}</span>
                      <span>·</span>
                      <span>{format(new Date(ev.uploaded_at), "MMM d, yyyy HH:mm")}</span>
                    </div>
                    {ev.description && <p className="text-[11px] text-foreground/80 italic">{ev.description}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDownloadEvidence(ev.id, ev.original_filename)}
                    disabled={downloadingEvidenceId === ev.id}
                    className="p-1.5 text-indigo-500 hover:text-indigo-600 rounded-lg hover:bg-indigo-500/10 cursor-pointer disabled:opacity-50"
                    title="Download Evidence"
                  >
                    {downloadingEvidenceId === ev.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {(ev.uploaded_by === user?.id || permissions.canManageOrganization) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteEvidence(ev.id)}
                      className="p-1.5 text-muted-foreground hover:text-rose-500 rounded-lg hover:bg-rose-500/10 cursor-pointer"
                      title="Delete Evidence"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Form */}
        {permissions.canManageRemediation && (
          <form onSubmit={handleUploadEvidence} className="space-y-2 p-3 rounded-xl bg-muted/10 border border-border/30 text-xs">
            <span className="font-bold text-[11px] text-foreground block">Attach New Evidence</span>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-500/10 file:text-indigo-600 dark:file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer"
              />
              <input
                type="text"
                placeholder="Optional description..."
                value={evidenceDescription}
                onChange={(e) => setEvidenceDescription(e.target.value)}
                className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-input bg-background text-foreground"
              />
              <Button
                type="submit"
                size="xs"
                disabled={!evidenceFile || isUploadingEvidence}
                className="h-7 text-xs font-semibold gap-1 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shrink-0"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>{isUploadingEvidence ? "Uploading..." : "Attach"}</span>
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Verify Modal */}
      {isVerifyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Verify Remediation
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Confirm that corrective action and evidence satisfy the compliance requirement.
            </p>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-foreground">Verification Note (Optional)</label>
              <textarea
                rows={3}
                value={verifyNoteInput}
                onChange={(e) => setVerifyNoteInput(e.target.value)}
                placeholder="e.g. Verified updated ICC committee member list..."
                className="w-full p-2.5 text-xs rounded-xl border border-input bg-background text-foreground resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="xs" onClick={() => setIsVerifyModalOpen(false)} className="cursor-pointer">
                Cancel
              </Button>
              <Button size="xs" onClick={handleVerify} disabled={isMutating} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer">
                {isMutating ? "Verifying..." : "Confirm Verification"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-500" /> Reject Remediation
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Return the remediation to In Progress for corrective revisions.
            </p>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-foreground">Rejection Reason (Required)</label>
              <textarea
                rows={3}
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                placeholder="e.g. Attached policy still missing clause 4(b)..."
                className="w-full p-2.5 text-xs rounded-xl border border-input bg-background text-foreground resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="xs" onClick={() => setIsRejectModalOpen(false)} className="cursor-pointer">
                Cancel
              </Button>
              <Button size="xs" onClick={handleReject} disabled={isMutating} className="bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer">
                {isMutating ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {isApproveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-purple-500" /> Approve Remediation
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Approve verified remediation. (Finding will remain ready for final resolution).
            </p>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-foreground">Approval Note (Optional)</label>
              <textarea
                rows={3}
                value={approveNoteInput}
                onChange={(e) => setApproveNoteInput(e.target.value)}
                placeholder="e.g. Approved for final resolution."
                className="w-full p-2.5 text-xs rounded-xl border border-input bg-background text-foreground resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="xs" onClick={() => setIsApproveModalOpen(false)} className="cursor-pointer">
                Cancel
              </Button>
              <Button size="xs" onClick={handleApprove} disabled={isMutating} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold cursor-pointer">
                {isMutating ? "Approving..." : "Confirm Approval"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-amber-500" /> Return to In Progress
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Return the remediation to In Progress for additional corrective action.
            </p>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-foreground">Return Reason (Required)</label>
              <textarea
                rows={3}
                value={returnReasonInput}
                onChange={(e) => setReturnReasonInput(e.target.value)}
                placeholder="e.g. Additional documentation required..."
                className="w-full p-2.5 text-xs rounded-xl border border-input bg-background text-foreground resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="xs" onClick={() => setIsReturnModalOpen(false)} className="cursor-pointer">
                Cancel
              </Button>
              <Button size="xs" onClick={handleReturn} disabled={isMutating} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer">
                {isMutating ? "Returning..." : "Confirm Return"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
