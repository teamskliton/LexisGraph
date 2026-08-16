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
  Paperclip,
  Download,
  ChevronDown,
  ChevronUp,
  Link2,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  findingsService,
  FindingComment,
  FindingActivity,
  FindingDetail,
  FindingResolutionHistory,
  FindingResolutionProof,
} from "@/services/api/findings";
import {
  remediationsService,
  RemediationDetail,
} from "@/services/api/remediations";
import {
  organizationsService,
  OrganizationMember,
} from "@/services/api/organizations";
import { formatRoleLabel } from "@/utils/role-utils";
import { RemediationSection } from "./RemediationSection";
import { FindingActivityTimeline } from "./FindingActivityTimeline";
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
  resolved_by?: string | null;
  resolved_by_name?: string | null;
  resolved_at?: string | null;
  reopened_by?: string | null;
  reopened_by_name?: string | null;
  reopened_at?: string | null;
  reopen_reason?: string | null;
  reassessment_trigger?: string | null;
  reassessment_reason?: string | null;
  reassessment_document_id?: string | null;
  reassessment_document_name?: string | null;
  reassessment_report_id?: string | null;
  reassessment_detected_at?: string | null;
  remediation_due_date?: string | null;
  is_overdue?: boolean;
  comments_count?: number;
  organization_id?: string | null;
  resolution_history?: FindingResolutionHistory[];
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
    case "REASSESSMENT_REQUIRED":
      return {
        label: "REASSESSMENT REQUIRED",
        className: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50 font-bold",
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
  const discussionsRef = useRef<HTMLDivElement | null>(null);
  const remediationRef = useRef<HTMLDivElement | null>(null);

  // State
  const [currentFinding, setCurrentFinding] = useState<FindingItem | null>(finding);
  const [comments, setComments] = useState<FindingComment[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([]);
  const [activityRefreshTrigger, setActivityRefreshTrigger] = useState(0);

  const [isLoadingComments, setIsLoadingComments] = useState(false);

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

  // Remediation state (Sprint 7.7 resolution eligibility)
  const [remediation, setRemediation] = useState<RemediationDetail | null>(null);
  const [isLoadingRemediation, setIsLoadingRemediation] = useState(false);

  // Confirmation Modals (Sprint 7.1 & 7.7)
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

  // Reassessment Modals & States (Sprint 7.9)
  const [isReassessmentReviewModalOpen, setIsReassessmentReviewModalOpen] = useState(false);
  const [isKeepResolvedModalOpen, setIsKeepResolvedModalOpen] = useState(false);
  const [isReopenFromReassessmentModalOpen, setIsReopenFromReassessmentModalOpen] = useState(false);
  const [keepResolvedAdminNoteInput, setKeepResolvedAdminNoteInput] = useState("");
  const [reopenFromReassessmentReasonInput, setReopenFromReassessmentReasonInput] = useState("");
  const [isSubmittingReassessmentDecision, setIsSubmittingReassessmentDecision] = useState(false);
  const [reassessmentDetail, setReassessmentDetail] = useState<any>(null);
  const [isLoadingReassessment, setIsLoadingReassessment] = useState(false);

  // Resolution Proof state (Sprint 7.10)
  const [resolutionProof, setResolutionProof] = useState<FindingResolutionProof | null>(null);
  const [isLoadingResolutionProof, setIsLoadingResolutionProof] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [downloadingProofEvidenceId, setDownloadingProofEvidenceId] = useState<string | null>(null);

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
        } else if (isKeepResolvedModalOpen) {
          setIsKeepResolvedModalOpen(false);
        } else if (isReopenFromReassessmentModalOpen) {
          setIsReopenFromReassessmentModalOpen(false);
        } else if (isReassessmentReviewModalOpen) {
          setIsReassessmentReviewModalOpen(false);
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
  }, [
    isOpen,
    isResolveModalOpen,
    isReopenModalOpen,
    isKeepResolvedModalOpen,
    isReopenFromReassessmentModalOpen,
    isReassessmentReviewModalOpen,
    isSubmitReviewModalOpen,
    isRejectModalOpen,
    onClose,
  ]);

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

  const handleDownloadProofEvidence = async (evidenceId: string, filename: string) => {
    if (!currentFinding?.id) return;
    setDownloadingProofEvidenceId(evidenceId);
    try {
      const blob = await remediationsService.downloadEvidence(currentFinding.id, evidenceId);
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
      console.error("Failed to download proof evidence:", err);
      toast.error(err?.response?.data?.detail || "Failed to download evidence file.");
    } finally {
      setDownloadingProofEvidenceId(null);
    }
  };

  const fetchAuxiliaryData = useCallback(async () => {
    if (!currentFinding?.id) return;

    setIsLoadingComments(true);
    setIsLoadingRemediation(true);
    try {
      const isResolved = currentFinding.lifecycle_status === "RESOLVED";
      const promises: [Promise<any>, Promise<any>, Promise<any>?] = [
        findingsService.getComments(currentFinding.id),
        remediationsService.getRemediation(currentFinding.id),
      ];
      if (isResolved) {
        promises.push(findingsService.getResolutionProof(currentFinding.id));
      }

      const results = await Promise.allSettled(promises);
      const commentsData = results[0];
      const remData = results[1];
      const proofData = isResolved ? results[2] : null;

      if (commentsData.status === "fulfilled") {
        setComments(commentsData.value || []);
      }
      if (remData.status === "fulfilled") {
        setRemediation(remData.value || null);
      } else {
        setRemediation(null);
      }
      if (proofData && proofData.status === "fulfilled") {
        setResolutionProof(proofData.value || null);
      } else if (!isResolved) {
        setResolutionProof(null);
      }
      setActivityRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      console.error("Error loading finding auxiliary data:", err);
    } finally {
      setIsLoadingComments(false);
      setIsLoadingRemediation(false);
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

  // Resolution Eligibility (Sprint 7.7)
  const resolutionEligibility = useMemo(() => {
    if (!permissions.canResolveFindings) {
      return {
        isEligible: false,
        reason: "Only Organization Administrators can resolve compliance findings.",
      };
    }

    const lifecycleStatus = (currentFinding?.lifecycle_status || "OPEN").toUpperCase();
    if (lifecycleStatus === "RESOLVED") {
      return { isEligible: false, reason: "This finding is already resolved." };
    }

    if (remediation) {
      const remStatus = (remediation.status || "NOT_STARTED").toUpperCase();
      if (remStatus !== "APPROVED") {
        if (remStatus === "IN_PROGRESS" || remStatus === "NOT_STARTED") {
          return {
            isEligible: false,
            reason: "Remediation is currently in progress. Complete and approve remediation before resolving this finding.",
          };
        }
        if (remStatus === "READY_FOR_REVIEW") {
          return {
            isEligible: false,
            reason: "Remediation is under review. Complete reviewer verification and admin approval before resolving.",
          };
        }
        if (remStatus === "VERIFIED") {
          return {
            isEligible: false,
            reason: "Remediation has been verified by reviewer, but requires Admin approval before resolving this finding.",
          };
        }
        if (remStatus === "REJECTED") {
          return {
            isEligible: false,
            reason: "Remediation was rejected. Further remediation work is required before resolving this finding.",
          };
        }
        return {
          isEligible: false,
          reason: `Remediation must be approved before resolution (Current: ${remediation.status}).`,
        };
      }
    } else {
      if (lifecycleStatus === "REMEDIATION" || lifecycleStatus === "REMEDIATION_REQUIRED") {
        return {
          isEligible: false,
          reason: "Remediation is required and must be completed and approved before resolving this finding.",
        };
      }
    }

    return { isEligible: true, reason: undefined };
  }, [permissions.canResolveFindings, currentFinding?.lifecycle_status, remediation]);

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

  // Resolve Confirmation Handler (Sprint 7.1 & 7.7 & 7.8)
  const handleConfirmResolve = async () => {
    if (!currentFinding) return;
    setIsResolving(true);
    try {
      const updated = await findingsService.resolveFinding(currentFinding.id, resolutionNoteInput);
      const merged: FindingItem = {
        ...currentFinding,
        lifecycle_status: "RESOLVED",
        resolution_note: updated.resolution_note,
        resolved_by: updated.resolved_by,
        resolved_by_name: updated.resolved_by_name,
        resolved_at: updated.resolved_at,
        resolution_history: updated.resolution_history,
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

  // Reopen Confirmation Handler (Sprint 7.8)
  const handleConfirmReopen = async () => {
    if (!currentFinding) return;
    const reasonTrimmed = reopenReasonInput.trim();
    if (!reasonTrimmed) {
      toast.error("Please provide a reason for reopening this finding.");
      return;
    }
    setIsReopening(true);
    try {
      const updated = await findingsService.reopenFinding(currentFinding.id, reasonTrimmed);
      const merged: FindingItem = {
        ...currentFinding,
        lifecycle_status: "REOPENED",
        reopen_reason: updated.reopen_reason,
        reopened_by: updated.reopened_by,
        reopened_by_name: updated.reopened_by_name,
        reopened_at: updated.reopened_at,
        resolution_history: updated.resolution_history,
        updated_at: updated.updated_at,
      };
      setCurrentFinding(merged);
      if (onFindingUpdated) onFindingUpdated(merged);
      toast.success("Finding marked as REOPENED.");
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

  // Reassessment Review & Decisions (Sprint 7.9)
  const handleOpenReassessmentModal = async () => {
    if (!currentFinding?.id) return;
    setIsReassessmentReviewModalOpen(true);
    setIsLoadingReassessment(true);
    try {
      const res = await findingsService.getReassessment(currentFinding.id);
      setReassessmentDetail(res);
    } catch (err: any) {
      console.error("Failed to load reassessment details:", err);
    } finally {
      setIsLoadingReassessment(false);
    }
  };

  const handleConfirmKeepResolved = async () => {
    if (!currentFinding?.id) return;
    setIsSubmittingReassessmentDecision(true);
    try {
      const updated = await findingsService.keepResolved(currentFinding.id, keepResolvedAdminNoteInput || undefined);
      const merged: FindingItem = {
        ...currentFinding,
        lifecycle_status: "RESOLVED",
        reassessment_trigger: null,
        reassessment_reason: null,
        reassessment_document_id: null,
        reassessment_document_name: null,
        reassessment_report_id: null,
        reassessment_detected_at: null,
        updated_at: updated.updated_at,
      };
      setCurrentFinding(merged);
      if (onFindingUpdated) onFindingUpdated(merged);
      toast.success("Reassessment reviewed: Finding remains RESOLVED.");
      setIsKeepResolvedModalOpen(false);
      setIsReassessmentReviewModalOpen(false);
      setKeepResolvedAdminNoteInput("");
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to complete reassessment decision.";
      toast.error(msg);
    } finally {
      setIsSubmittingReassessmentDecision(false);
    }
  };

  const handleConfirmReopenFromReassessment = async () => {
    if (!currentFinding?.id) return;
    const reasonTrimmed = reopenFromReassessmentReasonInput.trim();
    if (!reasonTrimmed) {
      toast.error("Please provide a reason for reopening this finding.");
      return;
    }
    setIsSubmittingReassessmentDecision(true);
    try {
      const updated = await findingsService.reopenFromReassessment(currentFinding.id, reasonTrimmed);
      const merged: FindingItem = {
        ...currentFinding,
        lifecycle_status: "REOPENED",
        reopen_reason: updated.reopen_reason,
        reopened_by: updated.reopened_by,
        reopened_by_name: updated.reopened_by_name,
        reopened_at: updated.reopened_at,
        reassessment_trigger: null,
        reassessment_reason: null,
        reassessment_document_id: null,
        reassessment_document_name: null,
        reassessment_report_id: null,
        reassessment_detected_at: null,
        resolution_history: updated.resolution_history,
        updated_at: updated.updated_at,
      };
      setCurrentFinding(merged);
      if (onFindingUpdated) onFindingUpdated(merged);
      toast.success("Finding reopened from reassessment.");
      setIsReopenFromReassessmentModalOpen(false);
      setIsReassessmentReviewModalOpen(false);
      setReopenFromReassessmentReasonInput("");
      fetchAuxiliaryData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to reopen finding.";
      toast.error(msg);
    } finally {
      setIsSubmittingReassessmentDecision(false);
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

  const handleNavigateToDrawerSection = (section: "discussions" | "remediation") => {
    if (section === "discussions") {
      discussionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (section === "remediation") {
      remediationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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

                    {/* REMEDIATION -> Submit for Admin Review, Return to Review, (Admin: Resolve Finding if Eligible) */}
                    {(currentFinding.lifecycle_status === "REMEDIATION" || currentFinding.lifecycle_status === "REMEDIATION_REQUIRED") && (
                      <>
                        {permissions.canResolveFindings && (
                          <div className="relative group">
                            <Button
                              size="xs"
                              onClick={() => {
                                if (resolutionEligibility.isEligible) {
                                  setIsResolveModalOpen(true);
                                }
                              }}
                              disabled={isUpdatingStatus || !resolutionEligibility.isEligible}
                              className={cn(
                                "h-8 text-xs font-semibold gap-1 text-white cursor-pointer transition-all",
                                resolutionEligibility.isEligible
                                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-xs"
                                  : "bg-muted text-muted-foreground opacity-60 cursor-not-allowed hover:bg-muted"
                              )}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span>Resolve Finding</span>
                            </Button>
                            {!resolutionEligibility.isEligible && resolutionEligibility.reason && (
                              <div className="hidden group-hover:block absolute left-0 bottom-full mb-1.5 w-64 p-2 bg-popover border border-border rounded-lg text-[11px] text-popover-foreground shadow-lg z-30">
                                {resolutionEligibility.reason}
                              </div>
                            )}
                          </div>
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

                    {/* ADMIN_REVIEW -> Admin can Approve & Resolve if Eligible, Reject, Return. Reviewer sees pending status. */}
                    {currentFinding.lifecycle_status === "ADMIN_REVIEW" && (
                      <>
                        {permissions.canResolveFindings ? (
                          <>
                            <div className="relative group">
                              <Button
                                size="xs"
                                onClick={() => {
                                  if (resolutionEligibility.isEligible) {
                                    setIsResolveModalOpen(true);
                                  }
                                }}
                                disabled={isUpdatingStatus || !resolutionEligibility.isEligible}
                                className={cn(
                                  "h-8 text-xs font-semibold gap-1 text-white cursor-pointer transition-all",
                                  resolutionEligibility.isEligible
                                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-xs"
                                    : "bg-muted text-muted-foreground opacity-60 cursor-not-allowed hover:bg-muted"
                                )}
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span>Resolve Finding</span>
                              </Button>
                              {!resolutionEligibility.isEligible && resolutionEligibility.reason && (
                                <div className="hidden group-hover:block absolute left-0 bottom-full mb-1.5 w-64 p-2 bg-popover border border-border rounded-lg text-[11px] text-popover-foreground shadow-lg z-30">
                                  {resolutionEligibility.reason}
                                </div>
                              )}
                            </div>

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

                    {/* REASSESSMENT_REQUIRED -> Admin can Keep Resolved or Reopen; Reviewer sees read-only notification */}
                    {currentFinding.lifecycle_status === "REASSESSMENT_REQUIRED" && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="xs"
                          onClick={() => handleOpenReassessmentModal()}
                          className="h-8 text-xs font-semibold gap-1 bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Review Reassessment</span>
                        </Button>
                        {permissions.canReopenFindings && (
                          <>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => setIsKeepResolvedModalOpen(true)}
                              className="h-8 text-xs font-semibold gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Keep Resolved</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => setIsReopenFromReassessmentModalOpen(true)}
                              className="h-8 text-xs font-semibold gap-1 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Reopen Finding</span>
                            </Button>
                          </>
                        )}
                      </div>
                    )}

                    {/* RESOLVED -> Admin can Reopen if allowed. Reviewer sees read-only resolved. */}
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

            {/* SPRINT 7.10: Complete Finding Resolution Proof Dossier */}
            {currentFinding.lifecycle_status === "RESOLVED" && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-3 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300 uppercase text-[11px] tracking-wider block">
                        ✓ Resolution Proof & Audit Record
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Auditable resolution snapshot with verification evidence
                      </span>
                    </div>
                  </div>
                  {currentFinding.resolved_at && (
                    <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                      {format(new Date(currentFinding.resolved_at), "dd MMM yyyy, HH:mm")}
                    </Badge>
                  )}
                </div>

                {/* Proof Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-lg bg-background/60 border border-emerald-500/20 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Resolved By</span>
                    <span className="font-semibold text-foreground">{resolutionProof?.resolved_by_name || currentFinding.resolved_by_name || "Administrator"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Approved Cycle</span>
                    <span className="font-semibold text-foreground">
                      Cycle {resolutionProof?.approved_cycle_number || 1} (Approved)
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Verified By</span>
                    <span className="font-semibold text-foreground">
                      {resolutionProof?.verification?.verified_by_name || "Reviewer"}
                    </span>
                  </div>
                </div>

                {/* Verifier Note */}
                {resolutionProof?.verification?.verification_note && (
                  <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
                    <span className="font-bold text-sky-700 dark:text-sky-300 uppercase text-[10px] block mb-0.5">
                      Reviewer Verification Note ({resolutionProof.verification.verified_by_name || "Reviewer"})
                    </span>
                    <p className="text-foreground/90 leading-relaxed italic">
                      "{resolutionProof.verification.verification_note}"
                    </p>
                  </div>
                )}

                {/* Resolution Note */}
                {(resolutionProof?.resolution_note || currentFinding.resolution_note) && (
                  <div className="space-y-1">
                    <span className="font-bold text-emerald-800 dark:text-emerald-200 uppercase text-[10px] tracking-wider block">
                      Admin Resolution Note
                    </span>
                    <p className="text-foreground/90 bg-background/80 p-2.5 rounded-lg border border-emerald-500/20 leading-relaxed whitespace-pre-wrap">
                      {resolutionProof?.resolution_note || currentFinding.resolution_note}
                    </p>
                  </div>
                )}

                {/* Supporting Resolution Evidence */}
                <div className="space-y-1.5 pt-1 border-t border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      Supporting Evidence (Cycle {resolutionProof?.approved_cycle_number || 1})
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {resolutionProof?.supporting_evidence?.length || 0} file(s)
                    </span>
                  </div>

                  {resolutionProof?.supporting_evidence && resolutionProof.supporting_evidence.length > 0 ? (
                    <div className="space-y-1.5">
                      {resolutionProof.supporting_evidence.map((ev) => (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background/80 border border-emerald-500/20 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{ev.original_filename}</p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>{(ev.file_size / 1024).toFixed(1)} KB</span>
                                <span>·</span>
                                <span>Uploaded by {ev.uploader?.full_name || "User"}</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleDownloadProofEvidence(ev.id, ev.original_filename)}
                            disabled={downloadingProofEvidenceId === ev.id}
                            className="h-6 text-[10px] font-medium gap-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                          >
                            <Download className="h-3 w-3" />
                            <span>Download</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>Supporting evidence unavailable for this resolution.</span>
                    </div>
                  )}
                </div>

                {/* Historical Resolutions Accordion (if multiple) */}
                {resolutionProof?.historical_resolutions && resolutionProof.historical_resolutions.length > 1 && (
                  <div className="pt-2 border-t border-emerald-500/20">
                    <button
                      type="button"
                      onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                      className="w-full flex items-center justify-between text-[11px] font-bold text-emerald-800 dark:text-emerald-200 hover:underline cursor-pointer py-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <History className="h-3.5 w-3.5" />
                        Previous Resolution Periods ({resolutionProof.historical_resolutions.length - 1} prior)
                      </span>
                      {isHistoryExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>

                    {isHistoryExpanded && (
                      <div className="space-y-2 mt-2 pt-2 border-t border-border/40">
                        {resolutionProof.historical_resolutions.slice(1).map((h) => (
                          <div key={h.id} className="p-2.5 rounded-lg bg-background/50 border border-border/40 text-[11px] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground">Resolution #{h.resolution_number}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {h.resolved_at ? format(new Date(h.resolved_at), "dd MMM yyyy, HH:mm") : "Previous"}
                              </span>
                            </div>
                            <p className="text-muted-foreground">Resolved by: <strong className="text-foreground">{h.resolved_by_name || "Admin"}</strong></p>
                            {h.resolution_note && (
                              <p className="text-foreground/80 italic bg-muted/20 p-1.5 rounded">"{h.resolution_note}"</p>
                            )}
                            {h.reopened_at && (
                              <p className="text-amber-600 dark:text-amber-400 text-[10px]">
                                Reopened on {format(new Date(h.reopened_at), "dd MMM yyyy")}: {h.reopen_reason}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SPRINT 7.8: Reopened Finding Summary Card */}
            {currentFinding.lifecycle_status === "REOPENED" && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400">
                      <RotateCcw className="h-4 w-4" />
                    </div>
                    <span className="font-bold text-amber-600 dark:text-amber-400 uppercase text-[11px] tracking-wider">
                      Finding Reopened — Active Remediation Required
                    </span>
                  </div>
                  {currentFinding.reopened_at && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {format(new Date(currentFinding.reopened_at), "dd MMM yyyy, HH:mm")}
                    </span>
                  )}
                </div>
                {currentFinding.reopened_by_name && (
                  <p className="text-xs text-foreground/90 font-medium">
                    Reopened by: <span className="font-semibold text-foreground">{currentFinding.reopened_by_name}</span>
                  </p>
                )}
                {currentFinding.reopen_reason && (
                  <div className="pt-1">
                    <span className="font-bold text-amber-700 dark:text-amber-300 block uppercase text-[10px] tracking-wider mb-1">
                      Reopen Reason
                    </span>
                    <p className="text-foreground/90 bg-background/60 p-2.5 rounded-lg border border-amber-500/20 leading-relaxed whitespace-pre-wrap">
                      {currentFinding.reopen_reason}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* SPRINT 7.9: Reassessment Required Finding Summary Card */}
            {currentFinding.lifecycle_status === "REASSESSMENT_REQUIRED" && (
              <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-amber-500/25 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <span className="font-bold text-amber-800 dark:text-amber-200 uppercase text-[11px] tracking-wider">
                      ⚠️ Reassessment Required — Compliance Change Detected
                    </span>
                  </div>
                  {currentFinding.reassessment_detected_at && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {format(new Date(currentFinding.reassessment_detected_at), "dd MMM yyyy, HH:mm")}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-semibold">Trigger:</span>
                    <Badge variant="outline" className="text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/40">
                      {currentFinding.reassessment_trigger || "NEW_ANALYSIS"}
                    </Badge>
                  </div>
                  {currentFinding.reassessment_document_name && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Associated Document: <strong className="text-foreground">{currentFinding.reassessment_document_name}</strong></span>
                    </div>
                  )}
                  {currentFinding.reassessment_reason && (
                    <div className="pt-1">
                      <span className="font-bold text-amber-800 dark:text-amber-200 block uppercase text-[10px] tracking-wider mb-1">
                        Reassessment Trigger Reason
                      </span>
                      <p className="text-foreground/90 bg-background/80 p-2.5 rounded-lg border border-amber-500/30 leading-relaxed whitespace-pre-wrap">
                        {currentFinding.reassessment_reason}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-amber-500/30">
                  <span className="text-[11px] text-amber-800 dark:text-amber-300">
                    Decision required: Choose whether to maintain previous resolution or reopen for active remediation.
                  </span>
                  <Button
                    size="xs"
                    onClick={() => handleOpenReassessmentModal()}
                    className="h-7 text-xs font-semibold gap-1 bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shrink-0"
                  >
                    <BookOpen className="h-3 w-3" />
                    <span>Review Decision</span>
                  </Button>
                </div>
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
          <div ref={remediationRef}>
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
          </div>

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

          {/* SPRINT 7.8: Multi-Period Resolution History Card */}
          {((currentFinding.resolution_history && currentFinding.resolution_history.length > 0) || currentFinding.resolved_at) && (
            <Card className="border border-border/60 bg-card p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-indigo-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                    Resolution History
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
                  {currentFinding.resolution_history?.length || 1} { (currentFinding.resolution_history?.length || 1) === 1 ? "Period" : "Periods" }
                </Badge>
              </div>

              <div className="space-y-3 pt-1">
                {(currentFinding.resolution_history && currentFinding.resolution_history.length > 0
                  ? currentFinding.resolution_history
                  : [
                      {
                        id: "res-fallback",
                        finding_id: currentFinding.id,
                        resolution_number: 1,
                        resolved_at: currentFinding.resolved_at || currentFinding.created_at || "",
                        resolved_by_name: currentFinding.resolved_by_name,
                        resolution_note: currentFinding.resolution_note,
                        reopened_at: currentFinding.reopened_at,
                        reopened_by_name: currentFinding.reopened_by_name,
                        reopen_reason: currentFinding.reopen_reason,
                        status: currentFinding.lifecycle_status === "REOPENED" ? "REOPENED" : "RESOLVED",
                      },
                    ]
                ).map((res, idx) => {
                  const isCurrent = idx === (currentFinding.resolution_history?.length || 1) - 1 && currentFinding.lifecycle_status === "RESOLVED";
                  const isReopened = Boolean(res.reopened_at || res.status === "REOPENED");

                  return (
                    <div
                      key={res.id || idx}
                      className={cn(
                        "p-3.5 rounded-xl border text-xs space-y-2.5 transition-all",
                        isCurrent
                          ? "bg-emerald-500/5 border-emerald-500/30"
                          : isReopened
                          ? "bg-muted/20 border-border/60"
                          : "bg-muted/10 border-border/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">
                            Resolution #{res.resolution_number || idx + 1}
                          </span>
                          {isCurrent ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold">
                              ✓ Current Resolution
                            </Badge>
                          ) : isReopened ? (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-bold">
                              Historical (Reopened)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30 font-bold">
                              Historical
                            </Badge>
                          )}
                        </div>
                        {res.resolved_at && (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            Resolved: {format(new Date(res.resolved_at), "dd MMM yyyy, HH:mm")}
                          </span>
                        )}
                      </div>

                      {/* Resolved Metadata */}
                      <div className="space-y-1 text-muted-foreground text-[11px]">
                        {res.resolved_by_name && (
                          <p>
                            Resolved by: <span className="font-semibold text-foreground">{res.resolved_by_name}</span>
                          </p>
                        )}
                        {res.resolution_note && (
                          <div className="bg-background/60 p-2 rounded-lg border border-border/30 text-foreground/90 leading-relaxed whitespace-pre-wrap">
                            <span className="font-semibold text-[10px] uppercase tracking-wider block text-muted-foreground mb-0.5">Note:</span>
                            {res.resolution_note}
                          </div>
                        )}
                      </div>

                      {/* Reopen Metadata if reopened */}
                      {isReopened && (
                        <div className="mt-2 pt-2 border-t border-border/40 space-y-1 text-[11px]">
                          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 font-semibold gap-2">
                            <span className="flex items-center gap-1">
                              <RotateCcw className="h-3 w-3" />
                              <span>Reopened{res.reopened_by_name ? ` by ${res.reopened_by_name}` : ""}</span>
                            </span>
                            {res.reopened_at && (
                              <span className="font-mono text-[10px] text-muted-foreground font-normal">
                                {format(new Date(res.reopened_at), "dd MMM yyyy, HH:mm")}
                              </span>
                            )}
                          </div>
                          {res.reopen_reason && (
                            <p className="text-foreground/90 bg-amber-500/5 p-2 rounded-lg border border-amber-500/20 leading-relaxed">
                              <span className="font-semibold text-[10px] uppercase tracking-wider block text-amber-700 dark:text-amber-300 mb-0.5">Reason:</span>
                              {res.reopen_reason}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* SPRINT 7.2: Upgraded Compliance Discussion, Threaded Comments & @Mentions */}
          <div ref={discussionsRef}>
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
          </div>

          {/* SPRINT 7.6: Unified Activity & Audit Timeline */}
          <FindingActivityTimeline
            findingId={currentFinding.id}
            organizationId={organizationId || currentFinding.organization_id}
            refreshTrigger={activityRefreshTrigger}
            onNavigateToSection={handleNavigateToDrawerSection}
          />
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

      {/* ── Resolve Confirmation Modal (Sprint 7.7) ── */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-background/80 animate-drawer-backdrop">
          <Card className="w-full max-w-lg bg-card p-6 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Resolve Finding?</h3>
                <p className="text-xs text-muted-foreground">
                  Confirm that the remediation and review for this compliance finding have been completed.
                </p>
              </div>
            </div>

            {/* Finding & Verification Summary Snapshot (Sprint 7.10) */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Finding ID:</span>
                <span className="font-mono font-bold text-foreground">#{currentFinding.id.slice(0, 8)}</span>
              </div>
              {currentFinding.regulation_clause_id && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-semibold">Regulation Clause:</span>
                  <span className="font-mono font-semibold text-foreground">{currentFinding.regulation_clause_id}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Severity:</span>
                <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5", severityInfo.badgeClass)}>
                  {severityInfo.label}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Remediation Status:</span>
                <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  {remediation?.status || "APPROVED"}
                </Badge>
              </div>

              {/* Verifier Details */}
              {(remediation?.verifier?.full_name || remediation?.verified_by) && (
                <div className="pt-1.5 border-t border-border/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-semibold">Verified By:</span>
                    <span className="font-semibold text-foreground">
                      {remediation?.verifier?.full_name || remediation?.verified_by}
                    </span>
                  </div>
                  {remediation?.verification_note && (
                    <p className="text-[11px] text-muted-foreground italic bg-background/50 p-2 rounded border border-border/30">
                      "{remediation.verification_note}"
                    </p>
                  )}
                </div>
              )}

              {/* Evidence Summary */}
              <div className="pt-1.5 border-t border-border/40 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground font-semibold flex items-center gap-1">
                    <Paperclip className="h-3 w-3 text-indigo-500" /> Attached Evidence:
                  </span>
                  <span className="font-bold text-foreground">
                    {remediation?.evidence?.length || 0} file(s)
                  </span>
                </div>
                {remediation?.evidence && remediation.evidence.length > 0 ? (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {remediation.evidence.map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between text-[10px] bg-background/60 px-2 py-1 rounded border border-border/30">
                        <span className="truncate font-medium text-foreground max-w-[200px]">{ev.original_filename}</span>
                        <span className="text-muted-foreground">{(ev.file_size / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                    <span>Warning: No supporting evidence attached to this remediation.</span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This will mark the compliance finding as <strong className="text-foreground">RESOLVED</strong> in the report and audit trail. This action is recorded permanently in the Activity timeline.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Resolution Note (Optional)</span>
                <span className="text-[10px] text-muted-foreground font-normal">Stored in audit history</span>
              </label>
              <textarea
                value={resolutionNoteInput}
                onChange={(e) => setResolutionNoteInput(e.target.value)}
                placeholder="e.g., Updated policy verified and deployed. Centralized log retention active."
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsResolveModalOpen(false)}
                disabled={isResolving}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmResolve}
                disabled={isResolving}
                className="text-xs font-semibold cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isResolving ? (
                  <>
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    <span>Resolving Finding...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Resolve Finding</span>
                  </>
                )}
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

      {/* ── Reopen Confirmation Modal (Admins only, Sprint 7.8) ── */}
      {isReopenModalOpen && currentFinding && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-background/80 animate-drawer-backdrop">
          <Card className="w-full max-w-lg bg-card p-6 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Reopen Finding?</h3>
                <p className="text-xs text-muted-foreground">
                  Return this resolved finding to the compliance remediation workflow.
                </p>
              </div>
            </div>

            {/* Finding Summary Snapshot */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Finding:</span>
                <span className="font-mono font-bold text-foreground">#{currentFinding.id.slice(0, 8)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Current Status:</span>
                <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  ✓ RESOLVED
                </Badge>
              </div>
              {currentFinding.resolved_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-semibold">Previously Resolved:</span>
                  <span className="font-mono text-muted-foreground">
                    {format(new Date(currentFinding.resolved_at), "dd MMM yyyy, HH:mm")}
                  </span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Reopening this finding will return it to active remediation and may require additional corrective actions. Historical resolution periods, remediation cycles, and evidence are preserved.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Reason for Reopening <span className="text-rose-500">*</span></span>
                <span className="text-[10px] text-muted-foreground font-normal">Required for audit trail</span>
              </label>
              <textarea
                value={reopenReasonInput}
                onChange={(e) => setReopenReasonInput(e.target.value)}
                placeholder="e.g., New policy revision invalidated escalation clause, or compliance gap re-evaluated."
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReopenModalOpen(false)}
                disabled={isReopening}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmReopen}
                disabled={isReopening || !reopenReasonInput.trim()}
                className="text-xs font-semibold cursor-pointer bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
              >
                {isReopening ? (
                  <>
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    <span>Reopening Finding...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reopen Finding</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Reassessment Review & Comparison Modal (Sprint 7.9) ── */}
      {isReassessmentReviewModalOpen && currentFinding && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-background/80 animate-drawer-backdrop">
          <Card className="w-full max-w-2xl bg-card p-6 border border-border shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Compliance Reassessment Review</h3>
                  <p className="text-xs text-muted-foreground">
                    Compare historical resolution against the new compliance analysis evaluation.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsReassessmentReviewModalOpen(false)}
                className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {isLoadingReassessment ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
                <span className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                <span>Loading reassessment comparison details...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Two-Column Side-by-Side Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Box: Previous Resolution */}
                  <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-700 dark:text-emerald-300 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4" /> Previous Resolution
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                        Resolution #{reassessmentDetail?.previous_resolution?.resolution_number || 1}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">Resolved by: </span>
                        <span>{reassessmentDetail?.previous_resolution?.resolver_name || currentFinding.resolved_by_name || "Administrator"}</span>
                      </div>
                      {(reassessmentDetail?.previous_resolution?.resolved_at || currentFinding.resolved_at) && (
                        <div>
                          <span className="font-medium text-foreground">Resolved on: </span>
                          <span className="font-mono">{format(new Date(reassessmentDetail?.previous_resolution?.resolved_at || currentFinding.resolved_at!), "dd MMM yyyy, HH:mm")}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-1.5 border-t border-emerald-500/20">
                      <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block mb-1">
                        Resolution Note
                      </span>
                      <p className="p-2.5 rounded-lg bg-background/80 border border-emerald-500/20 text-foreground leading-relaxed whitespace-pre-wrap">
                        {reassessmentDetail?.previous_resolution?.resolution_note || currentFinding.resolution_note || "No resolution note provided."}
                      </p>
                    </div>
                  </div>

                  {/* Right Box: New Trigger & Candidate Analysis */}
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-700 dark:text-amber-300 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" /> Triggering Analysis
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40">
                        {currentFinding.reassessment_trigger || "NEW_ANALYSIS"}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-muted-foreground">
                      {currentFinding.reassessment_document_name && (
                        <div>
                          <span className="font-medium text-foreground">Updated Policy: </span>
                          <span className="font-semibold text-foreground">{currentFinding.reassessment_document_name}</span>
                        </div>
                      )}
                      {currentFinding.reassessment_detected_at && (
                        <div>
                          <span className="font-medium text-foreground">Detected at: </span>
                          <span className="font-mono">{format(new Date(currentFinding.reassessment_detected_at), "dd MMM yyyy, HH:mm")}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-1.5 border-t border-amber-500/20">
                      <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block mb-1">
                        Trigger Reason
                      </span>
                      <p className="p-2.5 rounded-lg bg-background/80 border border-amber-500/20 text-foreground leading-relaxed whitespace-pre-wrap">
                        {currentFinding.reassessment_reason || "New evaluation indicates a potential compliance gap in the updated policy document."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Regulation Requirement Reference */}
                <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span>Clause: <strong className="font-mono text-primary">{currentFinding.regulation_clause_id || "N/A"}</strong></span>
                    </span>
                    <Badge variant="outline" className={cn("text-[10px] font-bold", severityInfo.badgeClass)}>
                      {severityInfo.label}
                    </Badge>
                  </div>
                  {currentFinding.recommendation && (
                    <p className="text-muted-foreground leading-relaxed pt-1">
                      <strong className="text-foreground">Recommendation: </strong>
                      {currentFinding.recommendation}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-border/40 flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReassessmentReviewModalOpen(false)}
                className="text-xs cursor-pointer"
              >
                Close
              </Button>

              {permissions.canReopenFindings && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsKeepResolvedModalOpen(true);
                    }}
                    className="text-xs font-semibold cursor-pointer border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Keep Resolved</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setIsReopenFromReassessmentModalOpen(true);
                    }}
                    className="text-xs font-semibold cursor-pointer bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reopen Finding</span>
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Keep Resolved Confirmation Modal (Sprint 7.9) ── */}
      {isKeepResolvedModalOpen && currentFinding && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-background/80 animate-drawer-backdrop">
          <Card className="w-full max-w-md bg-card p-6 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Keep Finding Resolved?</h3>
                <p className="text-xs text-muted-foreground">
                  Confirm that the detected change does not invalidate the previous resolution.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Administrator Note (Optional)</span>
                <span className="text-[10px] text-muted-foreground font-normal">Recorded in audit log</span>
              </label>
              <textarea
                value={keepResolvedAdminNoteInput}
                onChange={(e) => setKeepResolvedAdminNoteInput(e.target.value)}
                placeholder="e.g., Reviewed updated wording; does not affect exemption clause. Retaining RESOLVED status."
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsKeepResolvedModalOpen(false)}
                disabled={isSubmittingReassessmentDecision}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmKeepResolved}
                disabled={isSubmittingReassessmentDecision}
                className="text-xs font-semibold cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isSubmittingReassessmentDecision ? (
                  <>
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Confirm Keep Resolved</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Reopen from Reassessment Confirmation Modal (Sprint 7.9) ── */}
      {isReopenFromReassessmentModalOpen && currentFinding && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-background/80 animate-drawer-backdrop">
          <Card className="w-full max-w-lg bg-card p-6 border border-border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Reopen Finding from Reassessment?</h3>
                <p className="text-xs text-muted-foreground">
                  Acknowledge that the new analysis/document update creates a gap and start active remediation.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This will transition the finding from <strong className="text-amber-600">REASSESSMENT REQUIRED</strong> to <strong className="text-rose-600">REOPENED</strong>. The remediation cycle will resume, preserving all previous cycles and evidence.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Reopening Reason <span className="text-rose-500">*</span></span>
                <span className="text-[10px] text-muted-foreground font-normal">Required for audit trail</span>
              </label>
              <textarea
                value={reopenFromReassessmentReasonInput}
                onChange={(e) => setReopenFromReassessmentReasonInput(e.target.value)}
                placeholder="e.g., New policy revision lacks mandatory external committee representative. Remediation required."
                rows={3}
                className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReopenFromReassessmentModalOpen(false)}
                disabled={isSubmittingReassessmentDecision}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmReopenFromReassessment}
                disabled={isSubmittingReassessmentDecision || !reopenFromReassessmentReasonInput.trim()}
                className="text-xs font-semibold cursor-pointer bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
              >
                {isSubmittingReassessmentDecision ? (
                  <>
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    <span>Reopening...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Confirm Reopen Finding</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );

  return createPortal(drawerContent, document.body);
};
