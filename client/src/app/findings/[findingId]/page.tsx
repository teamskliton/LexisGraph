"use client";

import React, { useEffect, useState, useCallback, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  FileText,
  Clock,
  UserCheck,
  Calendar,
  CheckCircle,
  RotateCcw,
  MessageSquare,
  History,
  Send,
  RefreshCw,
  Layers,
  Sparkles,
  Network,
  CornerDownRight,
  Check,
  CheckCircle2,
  Flag,
  SendHorizontal,
  XCircle,
  Trash2,
  Copy,
  AtSign,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/layout/protected-route";
import {
  findingsService,
  FindingDetail,
  FindingComment,
  FindingActivity,
} from "@/services/api/findings";
import {
  remediationsService,
  RemediationDetail,
} from "@/services/api/remediations";
import { organizationsService, OrganizationMember } from "@/services/api/organizations";
import { formatRoleLabel } from "@/utils/role-utils";
import { RemediationSection } from "@/components/compliance/RemediationSection";
import { FindingActivityTimeline } from "@/components/compliance/FindingActivityTimeline";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
        label: "REMEDIATION",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      };
    case "POTENTIAL_FALSE_POSITIVE":
      return {
        label: "FALSE POSITIVE REVIEW",
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

interface FindingDetailPageProps {
  params: Promise<{ findingId: string }>;
}

export default function FindingDetailPage({ params }: FindingDetailPageProps) {
  const resolvedParams = use(params);
  const findingId = resolvedParams.findingId;

  return (
    <ProtectedRoute>
      <FindingDetailContent findingId={findingId} />
    </ProtectedRoute>
  );
}

function FindingDetailContent({ findingId }: { findingId: string }) {
  const router = useRouter();
  const { user, permissions } = useAuth();

  const [finding, setFinding] = useState<FindingDetail | null>(null);
  const [comments, setComments] = useState<FindingComment[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Remediation state (Sprint 7.7 resolution eligibility)
  const [remediation, setRemediation] = useState<RemediationDetail | null>(null);

  // Confirmation Modals (Sprint 7.1 & 7.7)
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolutionNoteInput, setResolutionNoteInput] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  const [reopenReasonInput, setReopenReasonInput] = useState("");
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [isReopening, setIsReopening] = useState(false);

  const [submissionNoteInput, setSubmissionNoteInput] = useState("");
  const [isSubmitReviewModalOpen, setIsSubmitReviewModalOpen] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Comment input (Sprint 7.2)
  const [commentInput, setCommentInput] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const [discussionFilter, setDiscussionFilter] = useState<"ALL" | "UNRESOLVED" | "RESOLVED">("ALL");
  const [activityRefreshTrigger, setActivityRefreshTrigger] = useState(0);

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

  const filteredCommentThreads = useMemo(() => {
    if (discussionFilter === "UNRESOLVED") {
      return comments.filter((c) => !c.is_resolved);
    }
    if (discussionFilter === "RESOLVED") {
      return comments.filter((c) => Boolean(c.is_resolved));
    }
    return comments;
  }, [comments, discussionFilter]);

  const fetchFindingData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [data, comms, rem] = await Promise.all([
        findingsService.getFinding(findingId),
        findingsService.getComments(findingId).catch(() => []),
        remediationsService.getRemediation(findingId).catch(() => null),
      ]);
      setFinding(data);
      setComments(comms);
      setRemediation(rem);
      setActivityRefreshTrigger((p) => p + 1);

      const activeOrg =
        data.organization_id ||
        (typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null);
      if (activeOrg) {
        try {
          const members = await organizationsService.getMembers(activeOrg);
          setOrgMembers(members || []);
        } catch (e) {
          console.warn("Failed loading org members", e);
        }
      }
    } catch (err: any) {
      console.error("Failed loading finding details:", err);
      const rawDetail = err?.response?.data?.detail || "Finding not found or access denied.";
      setError(typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail));
    } finally {
      setIsLoading(false);
    }
  }, [findingId]);

  useEffect(() => {
    fetchFindingData();
  }, [fetchFindingData]);

  // Deep-link scroll to discussion section if URL contains tab=discussion or commentId
  useEffect(() => {
    if (typeof window !== "undefined" && !isLoading) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "discussion" || params.get("commentId")) {
        setTimeout(() => {
          const el = document.getElementById("discussion-section");
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 150);
      }
    }
  }, [isLoading]);

  // Resolution Eligibility (Sprint 7.7)
  const resolutionEligibility = useMemo(() => {
    if (!permissions.canResolveFindings) {
      return {
        isEligible: false,
        reason: "Only Organization Administrators can resolve compliance findings.",
      };
    }

    const lifecycleStatus = (finding?.lifecycle_status || "OPEN").toUpperCase();
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
  }, [permissions.canResolveFindings, finding?.lifecycle_status, remediation]);

  const handleStatusChange = async (newStatus: string) => {
    if (!finding) return;

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
      const updated = await findingsService.updateStatus(finding.id, newStatus);
      setFinding(updated);
      toast.success(`Status updated to ${updated.lifecycle_status}`);
      setActivityRefreshTrigger((p) => p + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleConfirmSubmitReview = async () => {
    if (!finding) return;
    setIsSubmittingReview(true);
    try {
      const updated = await findingsService.submitForAdminReview(finding.id, submissionNoteInput);
      setFinding(updated);
      setIsSubmitReviewModalOpen(false);
      setSubmissionNoteInput("");
      toast.success("Finding submitted for Administrator review.");
      setActivityRefreshTrigger((p) => p + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to submit for review.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!finding) return;
    setIsRejecting(true);
    try {
      const updated = await findingsService.rejectFalsePositive(finding.id, rejectionReasonInput);
      setFinding(updated);
      setIsRejectModalOpen(false);
      setRejectionReasonInput("");
      toast.success("Finding rejected as confirmed false positive.");
      setActivityRefreshTrigger((p) => p + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to reject finding.");
    } finally {
      setIsRejecting(false);
    }
  };

  const handleConfirmResolve = async () => {
    if (!finding) return;
    setIsResolving(true);
    try {
      const updated = await findingsService.resolveFinding(finding.id, resolutionNoteInput);
      setFinding(updated);
      setIsResolveModalOpen(false);
      setResolutionNoteInput("");
      toast.success("Finding marked as RESOLVED.");
      setActivityRefreshTrigger((p) => p + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to resolve finding.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleConfirmReopen = async () => {
    if (!finding) return;
    setIsReopening(true);
    try {
      const updated = await findingsService.reopenFinding(finding.id, reopenReasonInput);
      setFinding(updated);
      setIsReopenModalOpen(false);
      setReopenReasonInput("");
      toast.success("Finding REOPENED.");
      setActivityRefreshTrigger((p) => p + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to reopen finding.");
    } finally {
      setIsReopening(false);
    }
  };

  const handleCommentTextChange = (val: string) => {
    setCommentInput(val);
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
      const newText = commentInput.replace(/@([a-zA-Z0-9_.-]*)$/, `@${handleName} `);
      setCommentInput(newText);
      setMentionQuery(null);
    }
    setMentionedUserIds((prev) => Array.from(new Set([...prev, m.user_id])));
  };

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

  const handlePostComment = async (e: React.FormEvent, parentId?: string) => {
    e.preventDefault();
    if (!finding) return;
    const textToSend = parentId ? replyText : commentInput;
    if (!textToSend.trim()) return;

    setIsPostingComment(true);
    try {
      await findingsService.postComment(
        finding.id,
        textToSend.trim(),
        parentId,
        mentionedUserIds.length > 0 ? mentionedUserIds : undefined
      );
      if (parentId) {
        setReplyText("");
        setReplyingToId(null);
        setReplyMentionQuery(null);
      } else {
        setCommentInput("");
        setMentionQuery(null);
      }
      setMentionedUserIds([]);
      toast.success(parentId ? "Reply posted." : "Comment posted.");
      const comms = await findingsService.getComments(finding.id).catch(() => []);
      setComments(comms);
      setActivityRefreshTrigger((p) => p + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to post comment.");
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleToggleResolveComment = async (commentId: string, currentResolved: boolean) => {
    if (!finding) return;
    try {
      await findingsService.resolveComment(finding.id, commentId, !currentResolved);
      toast.success(!currentResolved ? "Discussion resolved." : "Discussion reopened.");
      const comms = await findingsService.getComments(finding.id).catch(() => []);
      setComments(comms);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to toggle discussion resolution.");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!finding) return;
    try {
      await findingsService.deleteComment(finding.id, commentId);
      toast.success("Comment deleted.");
      const comms = await findingsService.getComments(finding.id).catch(() => []);
      setComments(comms);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to delete comment.");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !finding) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10 max-w-2xl mx-auto flex flex-col items-center justify-center text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-rose-500" />
        <h2 className="text-xl font-bold text-foreground">Finding Unavailable</h2>
        <p className="text-sm text-muted-foreground">{error || "Finding not found."}</p>
        <Button onClick={() => router.push("/compliance/my-work?view=all")} className="gap-2 cursor-pointer">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to All Findings</span>
        </Button>
      </div>
    );
  }

  const sevInfo = deriveSeverityBadge(finding.severity, finding.status);
  const lifeInfo = deriveLifecycleBadge(finding.lifecycle_status);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 space-y-6">
      {/* Top Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/compliance/my-work?view=all")}
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-foreground">
                  Finding #{finding.id.slice(0, 8)}
                </h1>
                <Badge variant="outline" className={cn("gap-1 text-xs uppercase font-bold", sevInfo.badgeClass)}>
                  {sevInfo.icon}
                  {sevInfo.label}
                </Badge>
                <Badge variant="outline" className={cn("text-xs font-bold uppercase", lifeInfo.className)}>
                  {lifeInfo.label}
                </Badge>
                {finding.is_overdue && (
                  <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 gap-1 font-bold text-[10px]">
                    <AlertTriangle className="h-3 w-3" />
                    <span>OVERDUE</span>
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Created on {format(new Date(finding.created_at), "dd MMM yyyy")} • Report #{finding.report_id.slice(0, 8)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const q = encodeURIComponent(`Explain why this finding (${finding.id}) exists and what should be done.`);
                router.push(`/ai-assistant?findingId=${finding.id}&question=${q}`);
              }}
              className="gap-1.5 text-xs border-indigo-500/30 text-indigo-600 dark:text-indigo-400 cursor-pointer hover:bg-indigo-500/10"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Explain with AI</span>
            </Button>

            <Button
              size="sm"
              onClick={() => {
                const searchTerm = finding.policy_clause_id || finding.regulation_clause_id || "";
                router.push(searchTerm ? `/knowledge-graph?search=${encodeURIComponent(searchTerm)}` : "/knowledge-graph");
              }}
              className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer font-semibold"
            >
              <Network className="h-3.5 w-3.5" />
              <span>Explore Graph</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchFindingData}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 space-y-6">
        {/* SPRINT 7.7: Resolved Finding Summary Card */}
        {finding.lifecycle_status === "RESOLVED" && (
          <Card className="p-4 bg-emerald-500/10 border border-emerald-500/30 space-y-2 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-4 w-4" />
                </div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase text-xs tracking-wider">
                  ✓ Finding Resolved
                </span>
              </div>
              {finding.resolved_at && (
                <span className="text-xs font-mono text-muted-foreground">
                  {format(new Date(finding.resolved_at), "dd MMM yyyy, HH:mm")}
                </span>
              )}
            </div>
            {finding.resolved_by_name && (
              <p className="text-xs text-foreground/90 font-medium">
                Resolved by: <span className="font-semibold text-foreground">{finding.resolved_by_name}</span>
              </p>
            )}
            {finding.resolution_note && (
              <div className="pt-1">
                <span className="font-bold text-emerald-700 dark:text-emerald-300 block uppercase text-[10px] tracking-wider mb-1">
                  Resolution Note
                </span>
                <p className="text-xs text-foreground/90 bg-card/60 p-3 rounded-lg border border-emerald-500/20 leading-relaxed whitespace-pre-wrap">
                  {finding.resolution_note}
                </p>
              </div>
            )}
          </Card>
        )}

        {/* Status Actions Banner */}
        <Card className="p-4 border border-border/60 bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-muted-foreground">Lifecycle State</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-foreground">{lifeInfo.label}</span>
              {finding.resolution_note && (
                <span className="text-xs text-muted-foreground truncate max-w-xs">
                  — &quot;{finding.resolution_note}&quot;
                </span>
              )}
            </div>
          </div>

          {/* Role-governed action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* OPEN or REOPENED -> Start Review */}
            {(finding.lifecycle_status === "OPEN" || finding.lifecycle_status === "REOPENED") && (
              <Button
                size="sm"
                onClick={() => handleStatusChange("IN_REVIEW")}
                disabled={isUpdatingStatus}
                className="h-8 text-xs font-semibold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Start Review</span>
              </Button>
            )}

            {/* IN_REVIEW -> Move to Remediation, Potential False Positive, Submit for Admin Review, Return to Open */}
            {finding.lifecycle_status === "IN_REVIEW" && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleStatusChange("REMEDIATION")}
                  disabled={isUpdatingStatus}
                  className="h-8 text-xs font-semibold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>Move to Remediation</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStatusChange("POTENTIAL_FALSE_POSITIVE")}
                  disabled={isUpdatingStatus}
                  className="h-8 text-xs font-semibold gap-1.5 border-purple-500/40 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 cursor-pointer"
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>Potential False Positive</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleStatusChange("ADMIN_REVIEW")}
                  disabled={isUpdatingStatus}
                  className="h-8 text-xs font-semibold gap-1.5 bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                >
                  <SendHorizontal className="h-3.5 w-3.5" />
                  <span>Submit for Admin Review</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange("OPEN")}
                  disabled={isUpdatingStatus}
                  className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Return to Open</span>
                </Button>
              </>
            )}

            {/* REMEDIATION -> Submit for Admin Review, Return to Review, (Admin: Resolve Finding if Eligible) */}
            {(finding.lifecycle_status === "REMEDIATION" || finding.lifecycle_status === "REMEDIATION_REQUIRED") && (
              <>
                {permissions.canResolveFindings && (
                  <div className="relative group">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (resolutionEligibility.isEligible) {
                          setIsResolveModalOpen(true);
                        }
                      }}
                      disabled={isUpdatingStatus || !resolutionEligibility.isEligible}
                      className={cn(
                        "h-8 text-xs font-semibold gap-1.5 text-white cursor-pointer transition-all",
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
                  size="sm"
                  onClick={() => handleStatusChange("ADMIN_REVIEW")}
                  disabled={isUpdatingStatus}
                  className="h-8 text-xs font-semibold gap-1.5 bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                >
                  <SendHorizontal className="h-3.5 w-3.5" />
                  <span>Submit for Admin Review</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange("IN_REVIEW")}
                  disabled={isUpdatingStatus}
                  className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Return to Review</span>
                </Button>
              </>
            )}

            {/* POTENTIAL_FALSE_POSITIVE -> Submit for Admin Review, Return to Review, (Admin: Reject False Positive) */}
            {finding.lifecycle_status === "POTENTIAL_FALSE_POSITIVE" && (
              <>
                {permissions.canResolveFindings && (
                  <Button
                    size="sm"
                    onClick={() => handleStatusChange("REJECTED")}
                    disabled={isUpdatingStatus}
                    className="h-8 text-xs font-semibold gap-1.5 bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Reject (False Positive)</span>
                  </Button>
                )}

                <Button
                  size="sm"
                  onClick={() => handleStatusChange("ADMIN_REVIEW")}
                  disabled={isUpdatingStatus}
                  className="h-8 text-xs font-semibold gap-1.5 bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                >
                  <SendHorizontal className="h-3.5 w-3.5" />
                  <span>Submit for Admin Review</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange("IN_REVIEW")}
                  disabled={isUpdatingStatus}
                  className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Return to Review</span>
                </Button>
              </>
            )}

            {/* ADMIN_REVIEW -> Admin can Approve & Resolve if Eligible, Reject, Return. Reviewer sees pending. */}
            {finding.lifecycle_status === "ADMIN_REVIEW" && (
              <>
                {permissions.canResolveFindings ? (
                  <>
                    <div className="relative group">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (resolutionEligibility.isEligible) {
                            setIsResolveModalOpen(true);
                          }
                        }}
                        disabled={isUpdatingStatus || !resolutionEligibility.isEligible}
                        className={cn(
                          "h-8 text-xs font-semibold gap-1.5 text-white cursor-pointer transition-all",
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
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange("REJECTED")}
                      disabled={isUpdatingStatus}
                      className="h-8 text-xs font-semibold gap-1.5 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Reject (False Positive)</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange("IN_REVIEW")}
                      disabled={isUpdatingStatus}
                      className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Return to Reviewer</span>
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
            {finding.lifecycle_status === "RESOLVED" && (
              permissions.canReopenFindings ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange("REOPENED")}
                  disabled={isUpdatingStatus}
                  className="h-8 text-xs font-semibold gap-1.5 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reopen Finding</span>
                </Button>
              ) : (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  <span>Resolved (Read-only)</span>
                </span>
              )
            )}

            {/* REJECTED -> Admin can Reopen. Reviewer sees read-only rejected. */}
            {finding.lifecycle_status === "REJECTED" && (
              permissions.canReopenFindings ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange("IN_REVIEW")}
                  disabled={isUpdatingStatus}
                  className="h-8 text-xs font-semibold gap-1.5 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 cursor-pointer"
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
          </div>
        </Card>

        {/* Evaluation & Reasoning */}
        <Card className="p-6 border border-border/60 bg-card space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-500" />
              Compliance Gap Evaluation
            </h2>
            <div className="flex items-center gap-2 text-xs font-semibold">
              {finding.policy_clause_id && <Badge variant="secondary">{finding.policy_clause_id}</Badge>}
              {finding.regulation_clause_id && <Badge variant="outline">{finding.regulation_clause_id}</Badge>}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-xs font-bold text-muted-foreground uppercase">Citation / Regulatory Requirement</span>
              <p className="text-xs text-foreground font-medium mt-1 p-3 rounded-xl bg-muted/20 border border-border/40 leading-relaxed">
                {finding.citation || "Statutory clause requirements."}
              </p>
            </div>

            {finding.reasoning && (
              <div>
                <span className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> AI Compliance Reasoning
                </span>
                <p className="text-xs text-foreground font-medium mt-1 p-3 rounded-xl bg-muted/20 border border-border/40 leading-relaxed">
                  {finding.reasoning}
                </p>
              </div>
            )}

            {finding.recommendation && (
              <div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">Recommended Remediation</span>
                <p className="text-xs text-foreground font-medium mt-1 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 leading-relaxed">
                  {finding.recommendation}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* SPRINT 7.4: Remediation Management & Evidence Tracking */}
        <RemediationSection
          findingId={finding.id}
          recommendation={finding.recommendation}
          reasoning={finding.reasoning}
          severity={finding.severity}
          organizationId={finding.organization_id}
          onRemediationChanged={() => {
            fetchFindingData();
          }}
        />

        {/* SPRINT 7.2: Upgraded Comments & Collaboration Section */}
        <Card id="discussion-section" className="p-6 border border-border/60 bg-card space-y-6 shadow-xs">
          {/* Discussion Header with Dynamic Counts & Filter Tabs */}
          <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-3 flex-wrap">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-indigo-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Reviewer Discussion & Collaboration
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                {discussionStats.totalCount} {discussionStats.totalCount === 1 ? "comment" : "comments"} · {discussionStats.unresolvedThreads} unresolved
              </p>
            </div>

            {/* Discussion Filter Pills (Sprint 7.2) */}
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/40">
              <button
                type="button"
                onClick={() => setDiscussionFilter("ALL")}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer",
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
                  "px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer",
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
                  "px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer",
                  discussionFilter === "RESOLVED"
                    ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Resolved ({discussionStats.resolvedThreads})
              </button>
            </div>
          </div>

          {/* New Comment Input */}
          {permissions.canCommentOnFindings ? (
            <form onSubmit={(e) => handlePostComment(e)} className="space-y-2">
              <div className="relative">
                <textarea
                  value={commentInput}
                  onChange={(e) => handleCommentTextChange(e.target.value)}
                  placeholder="Write a comment, share findings, or type @ to mention a colleague..."
                  rows={3}
                  className="w-full p-3 text-xs rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />

                {/* Mentions dropdown for top-level comments */}
                {mentionQuery !== null && getFilteredMembers(mentionQuery).length > 0 && (
                  <div className="absolute left-0 bottom-full mb-1 w-72 max-h-48 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-xl z-30 p-1.5 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <AtSign className="h-3 w-3 text-indigo-500" /> Mention Team Member ({getFilteredMembers(mentionQuery).length})
                    </div>
                    {getFilteredMembers(mentionQuery).map((m) => (
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
                    setCommentInput((prev) => (prev.endsWith("@") ? prev : `${prev}@`));
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
                  disabled={isPostingComment || !commentInput.trim()}
                  className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer font-semibold"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isPostingComment ? "Adding..." : "Post Comment"}</span>
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground italic py-1">Viewers have read-only access to finding discussions.</p>
          )}

          {/* Comments Thread List with 1-Level Threading & Resolution */}
          {comments.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-muted/10 border border-dashed border-border/60 space-y-1.5">
              <MessageSquare className="h-6 w-6 text-muted-foreground mx-auto" />
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
            <div className="space-y-4 divide-y divide-border/30">
              {filteredCommentThreads.map((c) => (
                <div key={c.id} className="pt-3 space-y-2 first:pt-0">
                  <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {c.user_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-foreground">{c.user_name}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium">
                        {formatRoleLabel(c.user_role || "Team Member")}
                      </Badge>
                      {c.is_resolved && (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                          <Check className="h-3 w-3" /> Discussion Resolved
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
                          className="text-rose-500 hover:text-rose-700 cursor-pointer p-0.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap pl-8">{c.content}</p>

                  <div className="flex items-center gap-3 pt-1 text-[11px] pl-8">
                    {permissions.canCommentOnFindings && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingToId(replyingToId === c.id ? null : c.id);
                          setReplyText("");
                          setReplyMentionQuery(null);
                        }}
                        className="text-indigo-500 hover:text-indigo-600 font-semibold flex items-center gap-1 cursor-pointer"
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
                        title="Resolving a comment discussion does not resolve the finding."
                      >
                        <CheckCircle2 className={cn("h-3 w-3", c.is_resolved ? "text-emerald-500" : "")} />
                        <span>{c.is_resolved ? "Reopen Discussion" : "Resolve Discussion"}</span>
                      </button>
                    )}
                  </div>

                  {replyingToId === c.id && (
                    <form onSubmit={(e) => handlePostComment(e, c.id)} className="ml-8 pt-2 space-y-2 border-l-2 border-indigo-500/30 pl-3 relative bg-muted/20 rounded-r-xl pr-3 pb-2">
                      <div className="relative">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => handleReplyTextChange(e.target.value)}
                          placeholder={`Reply to ${c.user_name} or type @...`}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          autoFocus
                        />

                        {/* Mentions dropdown for inline reply */}
                        {replyMentionQuery !== null && getFilteredMembers(replyMentionQuery).length > 0 && (
                          <div className="absolute left-0 bottom-full mb-1 w-72 max-h-48 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-xl z-30 p-1.5 space-y-1">
                            <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                              <AtSign className="h-3 w-3 text-indigo-500" /> Mention Team Member ({getFilteredMembers(replyMentionQuery).length})
                            </div>
                            {getFilteredMembers(replyMentionQuery).map((m) => (
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
                          disabled={isPostingComment || !replyText.trim()}
                          className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                        >
                          {isPostingComment ? "Posting..." : "Post Reply"}
                        </Button>
                      </div>
                    </form>
                  )}

                  {c.replies && c.replies.length > 0 && (
                    <div className="ml-8 pt-2 space-y-2 border-l-2 border-border/50 pl-3 mt-2">
                      {c.replies.map((reply) => (
                        <div key={reply.id} className="bg-muted/20 p-2.5 rounded-lg space-y-1">
                          <div className="flex items-center justify-between text-[10px] gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <div className="h-5 w-5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[9px] font-bold shrink-0">
                                {reply.user_name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-bold text-foreground">{reply.user_name}</span>
                              <Badge variant="outline" className="text-[8px] px-1 py-0 font-medium">
                                {formatRoleLabel(reply.user_role || "Team Member")}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground font-mono">
                                {format(new Date(reply.created_at), "dd MMM, HH:mm")}
                              </span>
                              {(reply.user_id === user?.id || user?.is_superuser) && (
                                <button
                                  onClick={() => handleDeleteComment(reply.id)}
                                  className="text-rose-500 hover:text-rose-700 cursor-pointer"
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

        {/* SPRINT 7.6: Activity History & Audit Trail */}
        <FindingActivityTimeline
          findingId={findingId}
          organizationId={finding?.organization_id}
          refreshTrigger={activityRefreshTrigger}
        />
      </div>

      {/* ── Submit for Admin Review Modal ── */}
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

            {/* Finding Summary Snapshot */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Finding:</span>
                <span className="font-mono font-bold text-foreground">#{finding.id.slice(0, 8)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Severity:</span>
                <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5", sevInfo.badgeClass)}>
                  {sevInfo.label}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Remediation Status:</span>
                <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  {remediation?.status || "APPROVED"}
                </Badge>
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

      {/* ── Reject False Positive Modal (Admins only) ── */}
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

      {/* ── Reopen Confirmation Modal (Admins only) ── */}
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
}
