"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  Shield,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Save,
  ChevronRight,
  Info,
  Check,
  RefreshCw,
  SlidersHorizontal,
  Scale,
  ListTodo,
  ExternalLink,
  Edit3,
  XCircle,
  Eye,
  History,
  AlertCircle,
  Wand2,
  Bookmark,
  ChevronDown,
  Send,
  CheckSquare,
  FileCheck,
  MessageSquare,
  RotateCw,
  Building2,
  Calendar,
  Hash,
  UserCheck,
  Lock,
  Unlock,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import {
  policyFormationService,
  PolicyDraft,
  PolicySectionItem,
  PolicyDraftMetadataProperties,
  EligibleReviewerItem,
  PolicyApprovalAudit,
} from "@/services/api/policy-formation";

interface PolicyDraftEditorViewProps {
  draftId: string;
  organizationId?: string;
  organizationName?: string;
  onBack: () => void;
}

export function PolicyDraftEditorView({
  draftId,
  organizationId = "",
  organizationName = "",
  onBack,
}: PolicyDraftEditorViewProps) {
  const router = useRouter();
  const { user } = useAuth();

  // Main Draft State
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor State
  const [activeSectionId, setActiveSectionId] = useState<string>("sec-core-requirements");
  const [sections, setSections] = useState<PolicySectionItem[]>([]);
  const [title, setTitle] = useState<string>("");
  const [metadataProps, setMetadataProps] = useState<PolicyDraftMetadataProperties>({});
  const [draftStatus, setDraftStatus] = useState<string>("DRAFT_SAVED");

  // Save / Concurrency State
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  // Modals & Panels State
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [regenTargetSection, setRegenTargetSection] = useState<PolicySectionItem | null>(null);
  const [regenInstructions, setRegenInstructions] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historySnapshots, setHistorySnapshots] = useState<any[]>([]);
  const [isReverting, setIsReverting] = useState(false);

  // Stage 5 Workflow Modals
  const [showSubmitReviewModal, setShowSubmitReviewModal] = useState(false);
  const [eligibleReviewers, setEligibleReviewers] = useState<EligibleReviewerItem[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState<string>("");
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvalComments, setApprovalComments] = useState("");
  const [isApproving, setIsApproving] = useState(false);

  const [showRequestRevisionModal, setShowRequestRevisionModal] = useState(false);
  const [revisionComments, setRevisionComments] = useState("");
  const [isRequestingRevision, setIsRequestingRevision] = useState(false);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishEffectiveDate, setPublishEffectiveDate] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  const [isRetryingAi, setIsRetryingAi] = useState(false);
  const [isBranchingRevision, setIsBranchingRevision] = useState(false);

  // Right Drawer Tab State
  const [showRightDrawer, setShowRightDrawer] = useState(true);
  const [rightDrawerTab, setRightDrawerTab] = useState<"provenance" | "audits" | "telemetry">("provenance");
  const [approvalAudits, setApprovalAudits] = useState<PolicyApprovalAudit[]>([]);
  const [isLoadingAudits, setIsLoadingAudits] = useState(false);

  // Autosave timer ref
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load Draft from Backend
  const loadDraft = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await policyFormationService.getDraft(draftId);
      setDraft(data);
      setSections(data.sections || []);
      setTitle(data.title || "Policy Draft");
      setMetadataProps(data.metadata_properties || {});
      setDraftStatus(data.status || "DRAFT_SAVED");
      setHasUnsavedChanges(false);
      setLastSavedTime(new Date(data.updated_at));
      if (data.sections && data.sections.length > 0) {
        const core = data.sections.find((s) => s.section_id === "sec-core-requirements");
        setActiveSectionId(core ? core.section_id : data.sections[0].section_id);
      }
    } catch (err: any) {
      console.error("Failed to load policy draft:", err);
      const detail = err?.response?.data?.detail || "Could not retrieve policy draft.";
      setError(detail);
      toast.error(detail);
    } finally {
      setIsLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  // Load Approval Audits when audit tab is selected
  const loadAudits = useCallback(async () => {
    setIsLoadingAudits(true);
    try {
      const records = await policyFormationService.getApprovalHistory(draftId);
      setApprovalAudits(records || []);
    } catch (err: any) {
      console.error("Failed to load approval audits:", err);
    } finally {
      setIsLoadingAudits(false);
    }
  }, [draftId]);

  useEffect(() => {
    if (showRightDrawer && rightDrawerTab === "audits") {
      loadAudits();
    }
  }, [showRightDrawer, rightDrawerTab, loadAudits]);

  // Warn before unload if unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Determine if draft is locked from direct editing
  const isLocked =
    draft?.status === "READY_FOR_REVIEW" ||
    draft?.status === "APPROVED" ||
    draft?.status === "PUBLISHED" ||
    draft?.status === "SUPERSEDED";

  // Execute Save
  const handleSaveDraft = useCallback(
    async (overrideSections?: PolicySectionItem[], overrideTitle?: string, overrideStatus?: string) => {
      if (!draft || isLocked) return;
      setIsSaving(true);
      try {
        const payload = {
          title: overrideTitle !== undefined ? overrideTitle : title,
          status: overrideStatus !== undefined ? overrideStatus : draftStatus,
          metadata_properties: metadataProps,
          sections: overrideSections !== undefined ? overrideSections : sections,
          expected_version: draft.version,
          change_summary: "User edited draft content",
        };
        const updated = await policyFormationService.updateDraft(draft.id, payload);
        setDraft(updated);
        setSections(updated.sections || []);
        setTitle(updated.title);
        setDraftStatus(updated.status);
        setMetadataProps(updated.metadata_properties || {});
        setHasUnsavedChanges(false);
        setLastSavedTime(new Date());
        toast.success(`Draft saved (v${updated.version}).`);
      } catch (err: any) {
        console.error("Failed to save policy draft:", err);
        if (err?.response?.status === 409) {
          toast.error(
            "Conflict: This draft was modified in another session. Please reload to review the latest changes."
          );
        } else {
          toast.error(err?.response?.data?.detail || "Failed to save draft changes.");
        }
      } finally {
        setIsSaving(false);
      }
    },
    [draft, isLocked, title, draftStatus, metadataProps, sections]
  );

  // Debounced Autosave Trigger
  const triggerAutosave = useCallback(
    (newSections: PolicySectionItem[], newTitle?: string) => {
      if (isLocked) return;
      setHasUnsavedChanges(true);
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(() => {
        handleSaveDraft(newSections, newTitle);
      }, 2500);
    },
    [isLocked, handleSaveDraft]
  );

  // Update Section Content
  const handleSectionContentChange = (sectionId: string, newContent: string) => {
    if (isLocked) return;
    const updated = sections.map((s) => {
      if (s.section_id === sectionId) {
        return { ...s, content: newContent, is_customized: true };
      }
      return s;
    });
    setSections(updated);
    triggerAutosave(updated);
  };

  // Open Regeneration Modal
  const handleOpenRegenModal = (section: PolicySectionItem) => {
    if (isLocked) {
      toast.error("Draft is locked from regeneration. Create a new revision first.");
      return;
    }
    setRegenTargetSection(section);
    setRegenInstructions("");
    setShowRegenModal(true);
  };

  // Execute Section Regeneration
  const handleExecuteRegenerate = async () => {
    if (!draft || !regenTargetSection) return;
    setIsRegenerating(true);
    try {
      const updated = await policyFormationService.regenerateDraftSection(draft.id, {
        section_id: regenTargetSection.section_id,
        custom_instructions: regenInstructions.trim() || undefined,
        expected_version: draft.version,
      });
      setDraft(updated);
      setSections(updated.sections || []);
      setHasUnsavedChanges(false);
      setLastSavedTime(new Date());
      setShowRegenModal(false);
      toast.success(
        `Section '${regenTargetSection.heading}' updated (v${updated.version}).`
      );
    } catch (err: any) {
      console.error("Failed to regenerate section:", err);
      if (err?.response?.status === 409) {
        toast.error("Conflict: Draft was modified. Please refresh before regenerating.");
      } else {
        toast.error(err?.response?.data?.detail || "Failed to regenerate section.");
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  // Retry AI Generation for Template Fallback Drafts
  const handleRetryAiGeneration = async () => {
    if (!draft) return;
    setIsRetryingAi(true);
    try {
      const updated = await policyFormationService.retryAiGeneration(draft.id);
      setDraft(updated);
      setSections(updated.sections || []);
      toast.success("AI enrichment successfully applied to draft!");
    } catch (err: any) {
      console.error("Retry AI generation error:", err);
      toast.error(err?.response?.data?.detail || "AI retry failed. Template fallback remains active.");
    } finally {
      setIsRetryingAi(false);
    }
  };

  // Open Submit Review Modal
  const handleOpenSubmitReview = async () => {
    if (!draft) return;
    try {
      const reviewers = await policyFormationService.getEligibleReviewers();
      setEligibleReviewers(reviewers || []);
      setSelectedReviewerId("");
      setSubmissionNotes("");
      setShowSubmitReviewModal(true);
    } catch (err: any) {
      toast.error("Failed to fetch eligible reviewers for this workspace.");
    }
  };

  // Execute Draft Submission for Review
  const handleExecuteSubmitReview = async () => {
    if (!draft) return;
    setIsSubmittingReview(true);
    try {
      const updated = await policyFormationService.submitDraftForReview(draft.id, {
        assigned_reviewer_id: selectedReviewerId || null,
        notes: submissionNotes.trim() || null,
      });
      setDraft(updated);
      setDraftStatus(updated.status);
      setShowSubmitReviewModal(false);
      loadAudits();
      toast.success(`Draft v${updated.version} submitted for formal review. Ordinary editing is locked.`);
    } catch (err: any) {
      console.error("Submit for review error:", err);
      toast.error(err?.response?.data?.detail || "Failed to submit draft for review.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Execute Approval
  const handleExecuteApprove = async () => {
    if (!draft) return;
    setIsApproving(true);
    try {
      const approved = await policyFormationService.approveDraft(draft.id, {
        expected_version: draft.version,
        comments: approvalComments.trim() || null,
      });
      setDraft(approved);
      setDraftStatus(approved.status);
      setShowApproveModal(false);
      loadAudits();
      toast.success(`Draft v${approved.version} formally APPROVED! Content hash locked.`);
    } catch (err: any) {
      console.error("Approval error:", err);
      toast.error(err?.response?.data?.detail || "Approval failed.");
    } finally {
      setIsApproving(false);
    }
  };

  // Execute Request Revision
  const handleExecuteRequestRevision = async () => {
    if (!draft) return;
    if (!revisionComments.trim()) {
      toast.error("Reviewer comments explaining requested revisions are mandatory.");
      return;
    }
    setIsRequestingRevision(true);
    try {
      const updated = await policyFormationService.requestDraftRevision(draft.id, {
        expected_version: draft.version,
        comments: revisionComments.trim(),
      });
      setDraft(updated);
      setDraftStatus(updated.status);
      setShowRequestRevisionModal(false);
      loadAudits();
      toast.success(`Revisions requested on draft v${updated.version}. Author may now edit and resubmit.`);
    } catch (err: any) {
      console.error("Request revision error:", err);
      toast.error(err?.response?.data?.detail || "Failed to request revision.");
    } finally {
      setIsRequestingRevision(false);
    }
  };

  // Execute Reject
  const handleExecuteReject = async () => {
    if (!draft) return;
    if (!rejectReason.trim()) {
      toast.error("Documented reason is mandatory for rejection.");
      return;
    }
    setIsRejecting(true);
    try {
      const rejected = await policyFormationService.rejectDraft(draft.id, {
        expected_version: draft.version,
        reason: rejectReason.trim(),
      });
      setDraft(rejected);
      setDraftStatus(rejected.status);
      setShowRejectModal(false);
      loadAudits();
      toast.success("Draft submission rejected and returned to editable draft.");
    } catch (err: any) {
      console.error("Reject error:", err);
      toast.error(err?.response?.data?.detail || "Failed to reject submission.");
    } finally {
      setIsRejecting(false);
    }
  };

  // Execute Publish
  const handleExecutePublish = async () => {
    if (!draft) return;
    setIsPublishing(true);
    try {
      const published = await policyFormationService.publishDraft(draft.id, {
        expected_version: draft.version,
        effective_date: publishEffectiveDate ? new Date(publishEffectiveDate).toISOString() : null,
      });
      setDraft(published);
      setDraftStatus(published.status);
      setShowPublishModal(false);
      loadAudits();
      toast.success(
        `Policy successfully published to Policies repository! Document pipeline triggered.`
      );
    } catch (err: any) {
      console.error("Publish error:", err);
      toast.error(err?.response?.data?.detail || "Failed to publish policy.");
    } finally {
      setIsPublishing(false);
    }
  };

  // Execute Create Revision
  const handleCreateRevision = async () => {
    if (!draft) return;
    setIsBranchingRevision(true);
    try {
      const newRev = await policyFormationService.createDraftRevision(draft.id);
      setDraft(newRev);
      setSections(newRev.sections || []);
      setDraftStatus(newRev.status);
      loadAudits();
      toast.success(`New draft revision created: v${newRev.version}. You can now edit and submit for re-approval.`);
    } catch (err: any) {
      console.error("Create revision error:", err);
      toast.error(err?.response?.data?.detail || "Failed to create new revision.");
    } finally {
      setIsBranchingRevision(false);
    }
  };

  // Open History Snapshots
  const handleOpenHistory = async () => {
    if (!draft) return;
    try {
      const hist = await policyFormationService.getDraftHistory(draft.id);
      setHistorySnapshots(hist || []);
      setShowHistoryModal(true);
    } catch (err: any) {
      toast.error("Failed to load draft version history.");
    }
  };

  // Revert to Historical Snapshot
  const handleRevertVersion = async (versionNum: number) => {
    if (!draft || isLocked) {
      toast.error("Draft is locked. Reversion is only permitted in editable draft state.");
      return;
    }
    setIsReverting(true);
    try {
      const reverted = await policyFormationService.revertDraftVersion(draft.id, versionNum);
      setDraft(reverted);
      setSections(reverted.sections || []);
      setTitle(reverted.title);
      setDraftStatus(reverted.status);
      setMetadataProps(reverted.metadata_properties || {});
      setHasUnsavedChanges(false);
      setLastSavedTime(new Date());
      setShowHistoryModal(false);
      toast.success(`Draft successfully reverted to state of v${versionNum} (now active as v${reverted.version}).`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to revert version.");
    } finally {
      setIsReverting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] space-y-4">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Loading Grounded Policy Draft...</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Retrieving structured sections, approval state, and statutory provenance for {organizationName}.
          </p>
        </div>
      </div>
    );
  }

  if (error || !draft) {
    return (
      <Card className="border-destructive/40 bg-card p-6 text-center space-y-4 max-w-xl mx-auto my-12">
        <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground">Draft Retrieval Error</h2>
          <p className="text-xs text-muted-foreground">{error || "Policy draft could not be found."}</p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Analysis
          </Button>
          <Button size="sm" onClick={loadDraft}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
          </Button>
        </div>
      </Card>
    );
  }

  const activeSection = sections.find((s) => s.section_id === activeSectionId) || sections[0];
  const isPreliminary = draft.status === "NEEDS_VERIFICATION";
  const genMeta = draft.generation_metadata || {};
  const isFallback = Boolean(genMeta.is_template_fallback || genMeta.generation_method === "deterministic_rule_based");

  return (
    <div className="space-y-5 animate-in fade-in-50 duration-200">
      {/* ─── 1. TOP BREADCRUMB & HEADER ACTION BAR ─────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div className="space-y-1.5 flex-1">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <button
              onClick={onBack}
              className="hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Policy Formation</span>
            </button>
            <span>/</span>
            <span className="text-foreground font-medium truncate max-w-xs">{title}</span>
            <span>/</span>
            <span className="text-primary font-medium">Stage 5 Lifecycle</span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-primary/25 text-xs font-semibold px-2 py-0.5"
            >
              v{draft.version}
            </Badge>

            {/* Lifecycle Status Badge */}
            <Badge
              className={cn(
                "text-xs font-semibold px-2.5 py-0.5 border flex items-center gap-1",
                draft.status === "READY_FOR_REVIEW"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                  : draft.status === "APPROVED"
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                  : draft.status === "PUBLISHED"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : draft.status === "REVISION_REQUESTED"
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                  : draft.status === "NEEDS_VERIFICATION"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  : "bg-muted text-foreground border-border"
              )}
            >
              {isLocked ? <Lock className="h-3 w-3 shrink-0" /> : <Unlock className="h-3 w-3 shrink-0" />}
              {draft.status === "DRAFT_SAVED" && "Editable Draft"}
              {draft.status === "NEEDS_VERIFICATION" && "Needs Verification"}
              {draft.status === "READY_FOR_REVIEW" && "Under Review"}
              {draft.status === "REVISION_REQUESTED" && "Revision Requested"}
              {draft.status === "APPROVED" && "Approved Version"}
              {draft.status === "PUBLISHED" && "Published Policy"}
              {draft.status === "SUPERSEDED" && "Superseded"}
            </Badge>

            {/* AI Generation Transparency Badge */}
            {isFallback ? (
              <Badge
                variant="outline"
                className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[11px] gap-1 font-medium"
                title={genMeta.fallback_reason || "Deterministic legal template used"}
              >
                <AlertCircle className="h-3 w-3" />
                Deterministic Template Fallback
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] gap-1 font-medium"
              >
                <Sparkles className="h-3 w-3" />
                AI LLM Grounded
              </Badge>
            )}

            {/* Retry AI Action if Fallback */}
            {isFallback && !isLocked && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetryAiGeneration}
                disabled={isRetryingAi}
                className="text-[11px] h-6 px-2 text-primary hover:bg-primary/10 gap-1 cursor-pointer"
              >
                <RotateCw className={cn("h-3 w-3", isRetryingAi && "animate-spin")} />
                {isRetryingAi ? "Retrying AI..." : "Retry AI"}
              </Button>
            )}

            {/* Autosave Status Indicator */}
            {!isLocked && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-1">
                {isSaving ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                    <span>Saving changes...</span>
                  </>
                ) : hasUnsavedChanges ? (
                  <>
                    <Clock className="h-3 w-3 text-amber-500" />
                    <span className="text-amber-500 font-medium">Unsaved changes</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span>
                      Saved{" "}
                      {lastSavedTime
                        ? lastSavedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : ""}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* History Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenHistory}
            className="text-xs gap-1.5 cursor-pointer border-border"
          >
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            History ({draft.history?.length || 0})
          </Button>

          {/* Toggle Right Drawer */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRightDrawer(!showRightDrawer)}
            className="text-xs gap-1.5 cursor-pointer border-border"
          >
            <Scale className="h-3.5 w-3.5 text-primary" />
            {showRightDrawer ? "Hide Details" : "Show Details"}
          </Button>

          {/* ─── STAGE 5 WORKFLOW ACTION BUTTONS ──────────────────────────── */}
          {/* 1. DRAFT STATE ACTIONS: Save or Submit for Review */}
          {(!isLocked || draft.status === "REVISION_REQUESTED") && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSaveDraft()}
                disabled={isSaving}
                className={cn(
                  "text-xs gap-1.5 font-semibold cursor-pointer",
                  hasUnsavedChanges
                    ? "border-primary text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? "Saving..." : hasUnsavedChanges ? "Save Draft" : "Saved"}
              </Button>

              <Button
                size="sm"
                onClick={handleOpenSubmitReview}
                className="text-xs gap-1.5 font-semibold bg-primary text-primary-foreground shadow-sm cursor-pointer hover:bg-primary/90"
              >
                <Send className="h-3.5 w-3.5" />
                Submit for Review
              </Button>
            </>
          )}

          {/* 2. UNDER REVIEW ACTIONS: Approve, Request Revision, Reject */}
          {draft.status === "READY_FOR_REVIEW" && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  setApprovalComments("");
                  setShowApproveModal(true);
                }}
                className="text-xs gap-1.5 font-semibold bg-emerald-600 text-white shadow-sm cursor-pointer hover:bg-emerald-700"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Approve (v{draft.version})
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRevisionComments("");
                  setShowRequestRevisionModal(true);
                }}
                className="text-xs gap-1.5 font-semibold border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Request Changes
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectReason("");
                  setShowRejectModal(true);
                }}
                className="text-xs gap-1.5 font-semibold border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </Button>
            </>
          )}

          {/* 3. APPROVED ACTIONS: Publish or Create Revision */}
          {draft.status === "APPROVED" && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  setPublishEffectiveDate(new Date().toISOString().split("T")[0]);
                  setShowPublishModal(true);
                }}
                className="text-xs gap-1.5 font-semibold bg-purple-600 text-white shadow-md cursor-pointer hover:bg-purple-700"
              >
                <FileCheck className="h-3.5 w-3.5" />
                Publish Policy
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateRevision}
                disabled={isBranchingRevision}
                className="text-xs gap-1.5 font-semibold border-border text-foreground hover:bg-muted cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                {isBranchingRevision ? "Creating Revision..." : `New Revision (v${draft.version + 1})`}
              </Button>
            </>
          )}

          {/* 4. PUBLISHED ACTIONS: View in Policies or Create Revision */}
          {draft.status === "PUBLISHED" && (
            <>
              <Button
                size="sm"
                onClick={() => router.push("/policies")}
                className="text-xs gap-1.5 font-semibold bg-emerald-600 text-white shadow-sm cursor-pointer hover:bg-emerald-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View in Policies Center
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateRevision}
                disabled={isBranchingRevision}
                className="text-xs gap-1.5 font-semibold border-border text-foreground hover:bg-muted cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                {isBranchingRevision ? "Creating Revision..." : `New Revision (v${draft.version + 1})`}
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-xs cursor-pointer text-muted-foreground hover:text-foreground"
          >
            Back
          </Button>
        </div>
      </div>

      {/* ─── 2. STAGE 5 LIFECYCLE STATE BANNER ──────────────────────────────── */}
      {draft.status === "READY_FOR_REVIEW" && (
        <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-200 text-xs flex items-start gap-2.5">
          <Clock className="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <div className="space-y-0.5 flex-1">
            <span className="font-bold">Under Formal Review (Version v{draft.version} Locked):</span>
            <p className="leading-relaxed">
              This policy draft has been submitted for review and is protected against ordinary editing.
              Authorized approvers can review the evidence, grant approval, or request revisions.
            </p>
          </div>
        </div>
      )}

      {draft.status === "APPROVED" && (
        <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-900 dark:text-purple-200 text-xs flex items-start gap-2.5">
          <CheckSquare className="h-4 w-4 shrink-0 mt-0.5 text-purple-600 dark:text-purple-400" />
          <div className="space-y-0.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold">Formally Approved Version v{draft.version}:</span>
              {draft.content_hash && (
                <span className="font-mono text-[10px] bg-purple-500/20 px-1.5 py-0.5 rounded">
                  SHA-256: {draft.content_hash.slice(0, 16)}...
                </span>
              )}
            </div>
            <p className="leading-relaxed">
              This draft version is approved and immutable. Click <strong>Publish Policy</strong> to deploy it directly into the
              LexisGraph Policies repository, or create a new revision to make further edits.
            </p>
          </div>
        </div>
      )}

      {draft.status === "PUBLISHED" && (
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 text-xs flex items-start gap-2.5">
          <FileCheck className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <div className="space-y-0.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold">Published to Policies Repository:</span>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Published on {draft.published_at ? new Date(draft.published_at).toLocaleDateString() : "Active"}
              </span>
            </div>
            <p className="leading-relaxed">
              This policy is actively indexed in the workspace knowledge graph and search indices.
              To revise this policy in the future, click <strong>New Revision</strong> to start a traceable v{draft.version + 1} approval cycle.
            </p>
          </div>
        </div>
      )}

      {draft.status === "REVISION_REQUESTED" && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <div className="space-y-0.5 flex-1">
            <span className="font-bold">Reviewer Requested Revisions:</span>
            <p className="leading-relaxed italic mt-0.5">
              &ldquo;{draft.review_comments || "Please address reviewer comments and resubmit."}&rdquo;
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Editing is unlocked. Make your modifications, save changes, and click <strong>Submit for Review</strong> when ready.
            </p>
          </div>
        </div>
      )}

      {/* Preliminary Warning Banner */}
      {isPreliminary && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <span className="font-bold">Preliminary Draft — Unresolved Statutory Assumptions:</span>
            <p className="leading-relaxed">
              This draft was generated from a policy need marked as <em>Requires Verification</em>.
              Statutory thresholds (e.g. employee thresholds, phased gazette rules) and operational applicability
              have not been confirmed as mandatory obligations. Citations in this draft must be verified by qualified legal counsel.
            </p>
          </div>
        </div>
      )}

      {/* ─── 3. MAIN WORKSPACE: 3-PANE RESILIENT LAYOUT ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ─── LEFT: SECTION OUTLINE NAVIGATION ────────────────────────────── */}
        <div className="lg:col-span-3 space-y-2">
          <div className="p-3 rounded-xl border border-border/70 bg-card shadow-xs space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-border/50">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ListTodo className="h-3.5 w-3.5 text-primary" />
                Policy Sections
              </span>
              <span className="text-[10px] text-muted-foreground font-semibold">
                {sections.length} sections
              </span>
            </div>

            <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {sections.map((sec) => {
                const isActive = sec.section_id === activeSection?.section_id;
                return (
                  <button
                    key={sec.section_id}
                    onClick={() => setActiveSectionId(sec.section_id)}
                    className={cn(
                      "w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-start gap-2 cursor-pointer",
                      isActive
                        ? "bg-primary/10 text-primary font-bold border border-primary/25 shadow-2xs"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                    )}
                  >
                    <span className="font-mono text-[10px] opacity-75 shrink-0 mt-0.5">
                      {sec.section_number}
                    </span>
                    <div className="flex-1 truncate">
                      <span className="truncate block">{sec.heading}</span>
                      {sec.is_customized && (
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block font-normal">
                          Customized
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── CENTER: SECTION CANVAS & EDITOR ─────────────────────────────── */}
        <div className={cn("space-y-4", showRightDrawer ? "lg:col-span-6" : "lg:col-span-9")}>
          {activeSection && (
            <Card className="border border-border/70 bg-card p-5 space-y-4 shadow-xs">
              {/* Section Header Strip */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">
                      Section {activeSection.section_number}
                    </span>
                    {activeSection.is_customized && (
                      <Badge variant="secondary" className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Edited
                      </Badge>
                    )}
                    {activeSection.last_regenerated_at && (
                      <Badge variant="outline" className="text-[9px] font-semibold text-blue-600 dark:text-blue-400">
                        AI Regenerated
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-foreground mt-0.5">
                    {activeSection.heading}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {!isLocked && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenRegenModal(activeSection)}
                      className="text-xs h-7 gap-1 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer"
                    >
                      <Wand2 className="h-3 w-3" />
                      Regenerate Section
                    </Button>
                  )}
                </div>
              </div>

              {/* Rationale & Operational Intent */}
              {activeSection.rationale && (
                <div className="p-2.5 rounded-lg border border-border/50 bg-muted/20 text-xs text-muted-foreground flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="leading-relaxed text-[11px]">{activeSection.rationale}</p>
                </div>
              )}

              {/* Main Content Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Policy Text (Markdown Supported)
                  </label>
                  {isLocked && (
                    <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                      <Lock className="h-2.5 w-2.5" /> Read-only under active lifecycle state
                    </span>
                  )}
                </div>
                <textarea
                  value={activeSection.content}
                  readOnly={isLocked}
                  onChange={(e) => handleSectionContentChange(activeSection.section_id, e.target.value)}
                  rows={14}
                  className={cn(
                    "w-full text-xs font-mono p-3.5 rounded-xl border leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary shadow-inner resize-y",
                    isLocked
                      ? "bg-muted/15 text-foreground/90 border-border/50 cursor-not-allowed"
                      : "bg-background text-foreground border-border"
                  )}
                  placeholder="Enter policy text..."
                />
              </div>

              {/* Linked Grounded Clauses Tag Strip */}
              {activeSection.source_clauses && activeSection.source_clauses.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/50">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Grounded Statutory Clauses
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {activeSection.source_clauses.map((clause, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] font-normal px-2 py-0.5">
                        {clause}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Section Footer Navigation */}
              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={sections.indexOf(activeSection) === 0}
                  onClick={() => {
                    const idx = sections.indexOf(activeSection);
                    if (idx > 0) setActiveSectionId(sections[idx - 1].section_id);
                  }}
                  className="h-7 text-xs text-muted-foreground"
                >
                  ← Previous Section
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={sections.indexOf(activeSection) === sections.length - 1}
                  onClick={() => {
                    const idx = sections.indexOf(activeSection);
                    if (idx < sections.length - 1) setActiveSectionId(sections[idx + 1].section_id);
                  }}
                  className="h-7 text-xs text-primary font-semibold"
                >
                  Next Section →
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* ─── RIGHT: DRAWER WITH TABS (PROVENANCE, AUDIT TRAIL, TELEMETRY) ─── */}
        {showRightDrawer && (
          <div className="lg:col-span-3 space-y-4">
            {/* Tabs Header */}
            <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border border-border/60 text-xs">
              <button
                onClick={() => setRightDrawerTab("provenance")}
                className={cn(
                  "flex-1 py-1 px-2 rounded-lg font-semibold transition-all cursor-pointer text-center text-[11px]",
                  rightDrawerTab === "provenance"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Evidence
              </button>
              <button
                onClick={() => setRightDrawerTab("audits")}
                className={cn(
                  "flex-1 py-1 px-2 rounded-lg font-semibold transition-all cursor-pointer text-center text-[11px]",
                  rightDrawerTab === "audits"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Audits
              </button>
              <button
                onClick={() => setRightDrawerTab("telemetry")}
                className={cn(
                  "flex-1 py-1 px-2 rounded-lg font-semibold transition-all cursor-pointer text-center text-[11px]",
                  rightDrawerTab === "telemetry"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Metadata
              </button>
            </div>

            {/* TAB 1: EVIDENCE & PROVENANCE */}
            {rightDrawerTab === "provenance" && (
              <div className="space-y-4">
                {/* Metadata Card */}
                <Card className="border border-border/70 bg-card p-4 space-y-3 shadow-xs text-xs">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Bookmark className="h-3.5 w-3.5 text-primary" />
                      Policy Metadata
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {draft.status}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                        Policy Code
                      </span>
                      <span className="font-mono font-semibold text-foreground">
                        {metadataProps.policy_identifier || "POL-GENERIC"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                        Responsible Owner
                      </span>
                      <span className="font-semibold text-foreground">
                        {metadataProps.owner_role || "Compliance Officer"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                        Scope &amp; Entity
                      </span>
                      <span className="font-semibold text-foreground">{metadataProps.scope}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                        Review Cadence
                      </span>
                      <span className="font-semibold text-foreground">
                        {metadataProps.review_cadence || "Annual"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                        Effective Date
                      </span>
                      <span className="text-foreground">
                        {draft.effective_date
                          ? new Date(draft.effective_date).toLocaleDateString()
                          : "Unset (Set during Stage 5 publishing)"}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Statutory References Card */}
                <Card className="border border-border/70 bg-card p-4 space-y-3 shadow-xs text-xs">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5 text-primary" />
                      Statutory Sources
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {draft.source_references?.length || 0} cited
                    </Badge>
                  </div>

                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {draft.source_references && draft.source_references.length > 0 ? (
                      draft.source_references.map((src, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg border border-border/50 bg-muted/20 space-y-1 text-[11px]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-primary">{src.act_name}</span>
                            <span className="text-[9px] text-muted-foreground">{src.jurisdiction}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{src.instrument_type}</p>
                          {src.provisions && src.provisions.length > 0 && (
                            <ul className="space-y-0.5 text-[10px] text-foreground pt-1">
                              {src.provisions.slice(0, 2).map((p: string, pIdx: number) => (
                                <li key={pIdx} className="flex items-start gap-1">
                                  <Check className="h-2.5 w-2.5 text-primary shrink-0 mt-0.5" />
                                  <span className="truncate">{p}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-[11px]">
                        No statutory references linked to this draft.
                      </p>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* TAB 2: AUDIT TRAIL & DECISION HISTORY */}
            {rightDrawerTab === "audits" && (
              <Card className="border border-border/70 bg-card p-4 space-y-3 shadow-xs text-xs">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-primary" />
                    Approval Decision History
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadAudits}
                    className="h-6 w-6 p-0"
                    title="Refresh Audit Trail"
                  >
                    <RefreshCw className={cn("h-3 w-3", isLoadingAudits && "animate-spin")} />
                  </Button>
                </div>

                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {approvalAudits && approvalAudits.length > 0 ? (
                    approvalAudits.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-lg border border-border/50 bg-muted/15 space-y-1.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] font-bold px-1.5 py-0.2",
                              item.action === "APPROVAL_GRANTED"
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                                : item.action === "POLICY_PUBLISHED"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                : item.action === "REVISION_REQUESTED"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                : item.action === "SUBMISSION_REJECTED"
                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                            )}
                          >
                            {item.action.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            v{item.draft_version}
                          </span>
                        </div>

                        <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                          <span>By: {item.actor_name || "Workspace User"}</span>
                          <span>{new Date(item.created_at).toLocaleString()}</span>
                        </div>

                        {item.comments && (
                          <p className="text-[11px] text-foreground italic bg-background/50 p-1.5 rounded border border-border/40">
                            &ldquo;{item.comments}&rdquo;
                          </p>
                        )}

                        {item.content_hash && (
                          <div className="font-mono text-[9px] text-muted-foreground truncate">
                            SHA: {item.content_hash}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-muted-foreground text-xs">
                      No approval decision events recorded yet. Actions like review submissions, approvals, and revisions will be preserved here immutably.
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* TAB 3: GENERATION TELEMETRY & TRANSPARENCY */}
            {rightDrawerTab === "telemetry" && (
              <Card className="border border-border/70 bg-card p-4 space-y-3 shadow-xs text-xs">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Generation Transparency
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    Stage 4/5
                  </Badge>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                      Generation Method
                    </span>
                    <span className="font-semibold text-foreground">
                      {isFallback ? "Deterministic Rule-Based Template" : "AI LLM Grounded Generation"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                      Active Provider / Engine
                    </span>
                    <span className="font-mono text-foreground">
                      {genMeta.generator || "lexisgraph-grounded-template-engine"}
                    </span>
                  </div>

                  {genMeta.fallback_reason && (
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/25 space-y-1">
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 block">
                        Fallback Rationale
                      </span>
                      <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
                        {genMeta.fallback_reason}
                      </p>
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                      Prompt Schema Version
                    </span>
                    <span className="font-mono text-foreground">
                      {genMeta.prompt_version || "v5.0-enterprise"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                      Content Immutability Hash
                    </span>
                    <span className="font-mono text-[10px] text-foreground break-all">
                      {draft.content_hash || "Not computed (Requires formal approval)"}
                    </span>
                  </div>

                  {isFallback && !isLocked && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetryAiGeneration}
                      disabled={isRetryingAi}
                      className="w-full text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10 mt-2"
                    >
                      <RotateCw className={cn("h-3.5 w-3.5", isRetryingAi && "animate-spin")} />
                      {isRetryingAi ? "Retrying AI Call..." : "Retry AI Grounding"}
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* ─── 4. SUBMIT FOR REVIEW MODAL ─────────────────────────────────────── */}
      {showSubmitReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Submit Draft for Review</h3>
                  <p className="text-[11px] text-muted-foreground">Version v{draft.version} will be submitted.</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
                onClick={() => setShowSubmitReviewModal(false)}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="p-2.5 rounded-lg border border-primary/20 bg-primary/5 text-muted-foreground leading-relaxed">
                Submitting this draft locks content from further direct edits and notifies eligible workspace approvers.
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">
                  Assign Eligible Reviewer (Optional)
                </label>
                <select
                  value={selectedReviewerId}
                  onChange={(e) => setSelectedReviewerId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="">Any Eligible Approver (Workspace Review Queue)</option>
                  {eligibleReviewers.map((r) => (
                    <option key={r.user_id} value={r.user_id}>
                      {r.full_name} ({r.role}) — {r.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">
                  Submission Notes / Context
                </label>
                <textarea
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Completed initial DPDP Act mandatory provisions. Requesting review for annual policy adoption..."
                />
              </div>
            </div>

            <div className="p-3 border-t border-border bg-muted/10 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowSubmitReviewModal(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSubmittingReview}
                onClick={handleExecuteSubmitReview}
                className="text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
              >
                <Send className="h-3.5 w-3.5" />
                {isSubmittingReview ? "Submitting..." : "Submit for Review"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 5. APPROVE DRAFT MODAL ─────────────────────────────────────────── */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-purple-600" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Approve Policy Draft v{draft.version}</h3>
                  <p className="text-[11px] text-muted-foreground">Immutable approval record generation.</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
                onClick={() => setShowApproveModal(false)}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="p-3 rounded-lg border border-purple-500/25 bg-purple-500/5 text-purple-900 dark:text-purple-200 space-y-1">
                <span className="font-bold block text-[11px]">Approval Governance Notice:</span>
                <p className="leading-relaxed text-[11px]">
                  Approval certifies this exact draft version (v{draft.version}) and computes an immutable SHA-256 content hash.
                  Approval records are permanently logged and tamper-resistant.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">
                  Approval Comments / Executive Endorsement (Optional)
                </label>
                <textarea
                  value={approvalComments}
                  onChange={(e) => setApprovalComments(e.target.value)}
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Approved following compliance review against statutory requirements."
                />
              </div>
            </div>

            <div className="p-3 border-t border-border bg-muted/10 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowApproveModal(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isApproving}
                onClick={handleExecuteApprove}
                className="text-xs gap-1.5 bg-purple-600 text-white font-semibold hover:bg-purple-700"
              >
                <Check className="h-3.5 w-3.5" />
                {isApproving ? "Approving..." : "Confirm Approval"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 6. REQUEST REVISION MODAL ──────────────────────────────────────── */}
      {showRequestRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-amber-600" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Request Changes</h3>
                  <p className="text-[11px] text-muted-foreground">Provide actionable feedback to the author.</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
                onClick={() => setShowRequestRevisionModal(false)}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">
                  Reviewer Comments (Mandatory) <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={revisionComments}
                  onChange={(e) => setRevisionComments(e.target.value)}
                  rows={4}
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Please clarify breach escalation timelines in Section 9.0 to align with 72-hour reporting under DPDP Act..."
                />
              </div>
            </div>

            <div className="p-3 border-t border-border bg-muted/10 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowRequestRevisionModal(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isRequestingRevision}
                onClick={handleExecuteRequestRevision}
                className="text-xs gap-1.5 bg-amber-600 text-white font-semibold hover:bg-amber-700"
              >
                <Send className="h-3.5 w-3.5" />
                {isRequestingRevision ? "Submitting..." : "Send Feedback"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 7. REJECT SUBMISSION MODAL ─────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Reject Submission</h3>
                  <p className="text-[11px] text-muted-foreground">Document the reason for rejecting this draft.</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
                onClick={() => setShowRejectModal(false)}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">
                  Rejection Reason (Mandatory) <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Scope parameters conflict with existing enterprise governance policies..."
                />
              </div>
            </div>

            <div className="p-3 border-t border-border bg-muted/10 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowRejectModal(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isRejecting}
                onClick={handleExecuteReject}
                className="text-xs gap-1.5 bg-destructive text-destructive-foreground font-semibold"
              >
                <XCircle className="h-3.5 w-3.5" />
                {isRejecting ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 8. PUBLISH POLICY MODAL ────────────────────────────────────────── */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Publish to Production Policies Repository</h3>
                  <p className="text-[11px] text-muted-foreground">Deploy approved policy v{draft.version} into {organizationName}.</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
                onClick={() => setShowPublishModal(false)}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="p-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200 space-y-1">
                <span className="font-bold block text-[11px]">Production Publishing Pipeline:</span>
                <p className="leading-relaxed text-[11px]">
                  Publishing stores this approved policy in the live <code>Document</code> repository, supersedes older active versions,
                  and enqueues background processing for embedding extraction and Knowledge Graph indexing.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">
                  Effective Date (Optional)
                </label>
                <input
                  type="date"
                  value={publishEffectiveDate}
                  onChange={(e) => setPublishEffectiveDate(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground block">
                  Leave as today for immediate activation, or select a future date to schedule pending effectiveness.
                </span>
              </div>

              <div className="p-2.5 rounded-lg border border-border bg-muted/20 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-semibold">Policy Identifier:</span>
                  <span className="font-mono font-bold text-foreground">
                    {metadataProps.policy_identifier || "POL-GENERIC"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-semibold">Scheduled Review Cadence:</span>
                  <span className="font-semibold text-foreground">
                    {metadataProps.review_cadence || "Annual"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-border bg-muted/10 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowPublishModal(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isPublishing}
                onClick={handleExecutePublish}
                className="text-xs gap-1.5 bg-emerald-600 text-white font-semibold hover:bg-emerald-700 shadow-sm"
              >
                <FileCheck className="h-3.5 w-3.5" />
                {isPublishing ? "Publishing..." : "Confirm & Publish"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 9. REGENERATE SECTION MODAL ────────────────────────────────────── */}
      {showRegenModal && regenTargetSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Regenerate Section {regenTargetSection.section_number}: {regenTargetSection.heading}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    AI will re-draft this specific section using grounded evidence and your guidance.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
                onClick={() => setShowRegenModal(false)}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-foreground space-y-1">
                <span className="font-bold flex items-center gap-1 text-[11px] text-primary">
                  <Shield className="h-3.5 w-3.5" /> Evidence Grounding Protection
                </span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Only this section will be updated. Your edits across all other {sections.length - 1} sections
                  remain preserved. A prior version snapshot will be archived before applying changes.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">
                  Custom Drafting Instructions (Optional)
                </label>
                <textarea
                  value={regenInstructions}
                  onChange={(e) => setRegenInstructions(e.target.value)}
                  rows={4}
                  className="w-full text-xs p-3 rounded-xl border border-border bg-background text-foreground leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Expand on cryptographic key rotation schedules, specify 72-hour incident notifications, and add remote-work access controls..."
                />
              </div>
            </div>

            <div className="p-3 border-t border-border bg-muted/10 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowRegenModal(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                disabled={isRegenerating}
                onClick={handleExecuteRegenerate}
              >
                <Wand2 className={cn("h-3.5 w-3.5", isRegenerating && "animate-spin")} />
                {isRegenerating ? "Regenerating..." : "Regenerate Section"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 10. VERSION HISTORY & REVERT MODAL ──────────────────────────────── */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Draft Revision History</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Previous draft versions are preserved and recoverable.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
                onClick={() => setShowHistoryModal(false)}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 text-xs">
              {/* Current Active Version */}
              <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary text-primary-foreground text-[10px]">
                      v{draft.version} (Active)
                    </Badge>
                    <span className="font-semibold text-foreground">{draft.title}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground block mt-1">
                    Last modified {new Date(draft.updated_at).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Historical Snapshots */}
              {historySnapshots && historySnapshots.length > 0 ? (
                historySnapshots.map((snap, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-border/60 bg-muted/20 hover:border-border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-bold">
                          v{snap.version}
                        </Badge>
                        <span className="font-semibold text-foreground">
                          {snap.change_summary || "Revision snapshot"}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground block">
                        Archived {new Date(snap.archived_at).toLocaleString()} • {snap.sections?.length || 0} sections
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 text-primary hover:bg-primary/10"
                        disabled={isReverting || isLocked}
                        onClick={() => handleRevertVersion(snap.version)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Revert to v{snap.version}
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  No prior version snapshots yet. Version snapshots are archived automatically upon saving revisions or regenerating sections.
                </div>
              )}
            </div>

            <div className="p-3 border-t border-border bg-muted/10 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowHistoryModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
