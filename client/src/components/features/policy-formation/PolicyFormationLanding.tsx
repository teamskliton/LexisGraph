"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Sparkles,
  Layers,
  FilePlus,
  ArrowRight,
  Shield,
  Clock,
  Compass,
  CheckCircle2,
  BookOpen,
  Info,
  FolderGit2,
  Play,
  RotateCcw,
  Trash2,
  PlusCircle,
  FileText,
  AlertCircle,
  RefreshCw,
  Download,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  policyFormationService,
  OrganizationAssessment,
  PolicyDraftListItem,
} from "@/services/api/policy-formation";
import { OrganizationAssessmentWizard } from "./OrganizationAssessmentWizard";
import { PolicyNeedsAnalysisView } from "./PolicyNeedsAnalysisView";
import { PolicyDraftEditorView } from "./PolicyDraftEditorView";
import { CreateSpecificPolicyModal } from "./CreateSpecificPolicyModal";

interface PolicyFormationLandingProps {
  organizationId: string;
  organizationName: string;
}

export function PolicyFormationLanding({
  organizationId,
  organizationName,
}: PolicyFormationLandingProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Mode: "landing" vs "wizard" vs "analysis" vs "draft"
  const [activeAssessment, setActiveAssessment] = useState<OrganizationAssessment | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [analysisAssessmentId, setAnalysisAssessmentId] = useState<string | null>(null);
  const [isDraftEditorOpen, setIsDraftEditorOpen] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  // Data
  const [assessments, setAssessments] = useState<OrganizationAssessment[]>([]);
  const [draftsList, setDraftsList] = useState<PolicyDraftListItem[]>([]);
  const [latestDraft, setLatestDraft] = useState<OrganizationAssessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingNew, setIsStartingNew] = useState(false);
  const [downloadingDraftId, setDownloadingDraftId] = useState<string | null>(null);

  // Stage 3 preview modal for "Create a Specific Policy"
  const [isSpecificPolicyModalOpen, setIsSpecificPolicyModalOpen] = useState(false);

  // Fetch assessments and drafts for active workspace
  const fetchDrafts = useCallback(async () => {
    try {
      const drafts = await policyFormationService.listDrafts();
      setDraftsList(drafts || []);
    } catch (err) {
      console.error("Failed to load drafts:", err);
    }
  }, []);

  const fetchAssessments = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, latest] = await Promise.all([
        policyFormationService.listAssessments().catch(() => []),
        policyFormationService.getLatestDraft().catch(() => null),
      ]);
      setAssessments(list || []);
      setLatestDraft(latest);
    } catch (err) {
      console.error("Failed to load assessments:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssessments();
    fetchDrafts();
  }, [fetchAssessments, fetchDrafts]);

  // Sync with URL query parameter for browser refresh and direct linking
  useEffect(() => {
    const viewParam = searchParams.get("view");
    const idParam = searchParams.get("id");

    if (viewParam === "draft" && idParam) {
      setIsDraftEditorOpen(true);
      setActiveDraftId(idParam);
      setIsAnalysisOpen(false);
      setIsWizardOpen(false);
    } else if (viewParam === "analysis" && idParam) {
      setIsDraftEditorOpen(false);
      setActiveDraftId(null);
      setIsAnalysisOpen(true);
      setIsWizardOpen(false);
      setAnalysisAssessmentId(idParam);
    } else if (viewParam === "wizard") {
      setIsDraftEditorOpen(false);
      setActiveDraftId(null);
      setIsAnalysisOpen(false);
      setAnalysisAssessmentId(null);
      if (idParam && (!activeAssessment || activeAssessment.id !== idParam)) {
        policyFormationService
          .getAssessment(idParam)
          .then((a) => {
            setActiveAssessment(a);
            setIsWizardOpen(true);
          })
          .catch(() => {
            setIsWizardOpen(true);
          });
      } else {
        setIsWizardOpen(true);
      }
    } else {
      setIsDraftEditorOpen(false);
      setActiveDraftId(null);
      setIsAnalysisOpen(false);
      setIsWizardOpen(false);
      setAnalysisAssessmentId(null);
      setActiveAssessment(null);
    }
  }, [searchParams]);

  // Open Draft Handler
  const handleOpenDraft = (draftId: string) => {
    setActiveDraftId(draftId);
    setIsDraftEditorOpen(true);
    setIsAnalysisOpen(false);
    setIsWizardOpen(false);
    router.push(`${pathname}?view=draft&id=${draftId}`);
  };

  // Exit Draft Handler
  const handleExitDraft = () => {
    setIsDraftEditorOpen(false);
    setActiveDraftId(null);
    if (analysisAssessmentId) {
      setIsAnalysisOpen(true);
      router.push(`${pathname}?view=analysis&id=${analysisAssessmentId}`);
    } else {
      router.push(pathname);
    }
    fetchAssessments();
    fetchDrafts();
  };

  // Delete Draft Handler
  const handleDeleteDraft = async (draftId: string) => {
    if (!confirm("Are you sure you want to delete this policy draft?")) return;
    try {
      await policyFormationService.deleteDraft(draftId);
      toast.success("Policy draft deleted.");
      fetchDrafts();
    } catch (err: any) {
      console.error("Failed to delete draft:", err);
      toast.error(err?.response?.data?.detail || "Failed to delete draft.");
    }
  };

  // Download Draft PDF Handler
  const handleDownloadDraftPdf = async (draftId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloadingDraftId) return;
    try {
      setDownloadingDraftId(draftId);
      await policyFormationService.downloadDraftPdf(draftId);
      toast.success("Policy PDF downloaded successfully.");
    } catch (err: any) {
      console.error("Failed to download draft PDF:", err);
      toast.error(err?.response?.data?.detail || "Failed to download policy PDF.");
    } finally {
      setDownloadingDraftId(null);
    }
  };

  // Open Policy Needs Analysis Handler
  const handleOpenAnalysis = (assessmentId: string) => {
    setAnalysisAssessmentId(assessmentId);
    setIsAnalysisOpen(true);
    setIsWizardOpen(false);
    setIsDraftEditorOpen(false);
    setActiveDraftId(null);
    router.push(`${pathname}?view=analysis&id=${assessmentId}`);
  };

  // Exit Analysis Handler
  const handleExitAnalysis = () => {
    setIsAnalysisOpen(false);
    setAnalysisAssessmentId(null);
    router.push(pathname);
    fetchAssessments();
    fetchDrafts();
  };

  // Launch Wizard Handler
  const handleLaunchWizard = async (resume = true, specificAssessment?: OrganizationAssessment) => {
    if (specificAssessment) {
      setActiveAssessment(specificAssessment);
      setIsWizardOpen(true);
      router.push(`${pathname}?view=wizard&id=${specificAssessment.id}`);
      return;
    }

    setIsStartingNew(true);
    try {
      const assessmentToOpen = await policyFormationService.createOrResumeAssessment({
        resume_if_exists: resume,
      });
      setActiveAssessment(assessmentToOpen);
      setIsWizardOpen(true);
      router.push(`${pathname}?view=wizard&id=${assessmentToOpen.id}`);
    } catch (err: any) {
      console.error("Failed to start/resume assessment:", err);
      const detail = err?.response?.data?.detail || "Could not launch assessment session. Please retry.";
      toast.error(detail);
    } finally {
      setIsStartingNew(false);
    }
  };

  // Exit Wizard Handler
  const handleExitWizard = () => {
    setIsWizardOpen(false);
    setActiveAssessment(null);
    router.push(pathname);
    fetchAssessments();
  };

  // Delete Assessment Handler
  const handleDeleteAssessment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this assessment? This action cannot be undone.")) {
      return;
    }

    try {
      await policyFormationService.deleteAssessment(id);
      toast.success("Assessment deleted.");
      fetchAssessments();
    } catch (err) {
      console.error("Failed to delete assessment:", err);
      toast.error("Failed to delete assessment.");
    }
  };

  // ─── IF DRAFT EDITOR IS ACTIVE, RENDER DRAFT VIEW ─────────────────
  if (isDraftEditorOpen && activeDraftId) {
    return (
      <PolicyDraftEditorView
        draftId={activeDraftId}
        organizationId={organizationId}
        organizationName={organizationName}
        onBack={handleExitDraft}
      />
    );
  }

  // ─── IF ANALYSIS IS ACTIVE, RENDER ANALYSIS VIEW ──────────────────
  if (isAnalysisOpen && analysisAssessmentId) {
    return (
      <PolicyNeedsAnalysisView
        assessmentId={analysisAssessmentId}
        organizationId={organizationId}
        organizationName={organizationName}
        onBack={handleExitAnalysis}
        onOpenDraft={handleOpenDraft}
      />
    );
  }

  // ─── IF WIZARD IS ACTIVE, RENDER WIZARD VIEW ──────────────────────
  if (isWizardOpen) {
    return (
      <OrganizationAssessmentWizard
        initialAssessment={activeAssessment}
        organizationId={organizationId}
        organizationName={organizationName}
        onExit={handleExitWizard}
        onCompleted={(completed) => {
          setActiveAssessment(completed);
          fetchAssessments();
        }}
        onAnalyzePolicyNeeds={(id) => handleOpenAnalysis(id)}
      />
    );
  }

  // ─── LANDING VIEW ────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* ─── 1. PAGE HEADER ──────────────────────────────────────────────── */}
      <Card className="border border-border/60 bg-card p-6 md:p-8 shadow-xs relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                Policy Formation
              </h1>
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/25 text-xs font-semibold px-2.5 py-0.5"
              >
                AI-Assisted Drafting
              </Badge>
            </div>

            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              Identify the policies your organization needs and build a tailored policy framework
              with guided, AI-assisted drafting.
            </p>
          </div>

          {/* Active Workspace Pill */}
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0 px-3.5 py-1.5 rounded-xl border border-border/70 bg-muted/30">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <div className="text-xs">
              <span className="text-muted-foreground">Active Workspace: </span>
              <span className="font-semibold text-foreground">{organizationName}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── 2. PRIMARY ACTIONS ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Getting Started
            </h2>
            <p className="text-xs text-muted-foreground">
              Choose an approach to begin developing your organization&apos;s governance policies.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Card 1: Build a Policy Framework */}
          <Card className="border border-border/60 bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 flex flex-col justify-between group">
            <CardHeader className="p-6 pb-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 group-hover:scale-105 transition-transform">
                  <Compass className="h-6 w-6" />
                </div>
                {latestDraft ? (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/25 text-[11px] font-semibold">
                    Draft in Progress
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border text-[11px] font-medium">
                    Full Assessment
                  </Badge>
                )}
              </div>

              <div className="space-y-1.5">
                <CardTitle className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                  Build a Policy Framework
                </CardTitle>
                <CardDescription className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                  Assess your organization, identify relevant policy needs, and build a structured
                  policy plan.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="px-6 py-2">
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Discover industry &amp; statutory policy requirements</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Cross-reference with existing workspace policy inventory</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Generate a prioritized policy roadmap and drafting sequence</span>
                </li>
              </ul>
            </CardContent>

            <CardFooter className="p-6 pt-4 flex flex-col sm:flex-row gap-2">
              {latestDraft ? (
                <>
                  <Button
                    onClick={() => handleLaunchWizard(true, latestDraft)}
                    disabled={isStartingNew}
                    className="flex-1 gap-2 font-semibold cursor-pointer shadow-xs"
                  >
                    <Play className="h-4 w-4" />
                    <span>Resume Assessment (Step {latestDraft.current_step}/6)</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleLaunchWizard(false)}
                    disabled={isStartingNew}
                    className="text-xs cursor-pointer border-border hover:border-primary/40"
                    title="Start fresh new assessment"
                  >
                    <RotateCcw className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">New Assessment</span>
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => handleLaunchWizard(true)}
                  disabled={isStartingNew}
                  className="w-full gap-2 font-semibold cursor-pointer shadow-xs"
                >
                  {isStartingNew ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Initializing...</span>
                    </>
                  ) : (
                    <>
                      <span>Start Assessment</span>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* Card 2: Create a Specific Policy */}
          <Card className="border border-border/60 bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 flex flex-col justify-between group">
            <CardHeader className="p-6 pb-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-subtle/40 text-accent-foreground border border-border group-hover:scale-105 transition-transform">
                  <FilePlus className="h-6 w-6 text-primary" />
                </div>
                <Badge
                  variant="outline"
                  className="bg-muted/50 text-muted-foreground border-border text-[11px] font-medium"
                >
                  Direct Drafting
                </Badge>
              </div>

              <div className="space-y-1.5">
                <CardTitle className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                  Create a Specific Policy
                </CardTitle>
                <CardDescription className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                  Start drafting an individual policy when you already know what your organization
                  needs.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="px-6 py-2">
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Select from standard corporate governance and HR templates</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Align clauses directly with mapped statutory regulations</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Publish directly into your workspace Policy Center</span>
                </li>
              </ul>
            </CardContent>

            <CardFooter className="p-6 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsSpecificPolicyModalOpen(true)}
                className="w-full gap-2 font-semibold cursor-pointer border-border hover:border-primary/40"
              >
                <span>Create Policy</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* ─── STAGE 4: ACTIVE POLICY DRAFTS ───────────────────────────────── */}
      {draftsList.length > 0 && (
        <section className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Policy Drafts in Progress
              </h2>
              <Badge variant="outline" className="text-[10px] font-semibold bg-primary/10 text-primary border-primary/25">
                {draftsList.length} Active {draftsList.length === 1 ? "Draft" : "Drafts"}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {draftsList.map((draft) => {
              const status = draft.status || "DRAFTING";
              return (
                <div
                  key={draft.id}
                  onClick={() => handleOpenDraft(draft.id)}
                  className="rounded-xl border border-border/70 bg-card p-4.5 space-y-3 hover:border-primary/50 hover:shadow-sm transition-all duration-200 cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold",
                            status === "DRAFT_SAVED" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
                            status === "READY_FOR_REVIEW" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
                            status === "NEEDS_VERIFICATION" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
                            status === "DRAFTING" && "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25"
                          )}
                        >
                          {status.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-semibold border-border">
                          v{draft.version}
                        </Badge>
                      </div>
                      <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {draft.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleDownloadDraftPdf(draft.id, e)}
                        disabled={downloadingDraftId === draft.id}
                        className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors cursor-pointer"
                        title="Download PDF"
                      >
                        <Download className={cn("h-3.5 w-3.5", downloadingDraftId === draft.id && "animate-bounce text-primary")} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDraft(draft.id);
                        }}
                        className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
                        title="Delete draft"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(draft.updated_at).toLocaleDateString()}
                    </span>

                    <span className="text-[11px] text-primary font-medium flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Resume Editing
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── 3. RECENT WORK SECTION ──────────────────────────────────────── */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Recent Work
            </h2>
            <p className="text-xs text-muted-foreground">
              Saved assessments, in-progress drafts, and recently formed policies for {organizationName}.
            </p>
          </div>
          {assessments.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleLaunchWizard(false)}
              className="text-xs gap-1.5 cursor-pointer border-border"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Start New Assessment
            </Button>
          )}
        </div>

        {/* Dynamic State: Real Assessment Cards vs Empty State */}
        {assessments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assessments.map((item) => {
              const isCompleted = item.status === "COMPLETED";
              const dateStr = item.updated_at
                ? new Date(item.updated_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Recently";

              return (
                <div
                  key={item.id}
                  onClick={() => handleLaunchWizard(true, item)}
                  className="p-5 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                        {isCompleted ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Compass className="h-5 w-5" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                          {item.title}
                        </h4>
                        <span className="text-xs text-muted-foreground">
                          Updated {dateStr}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5",
                          isCompleted
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/25"
                        )}
                      >
                        {isCompleted ? "Completed" : `Step ${item.current_step}/6`}
                      </Badge>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteAssessment(item.id, e)}
                        className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete assessment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">Scope</span>
                      <span className="font-medium text-foreground capitalize">
                        {item.scope_type.toLowerCase()}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">Industry</span>
                      <span className="font-medium text-foreground truncate block">
                        {item.answers?.profile?.industry || "Technology"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2">
                    {isCompleted ? (
                      <>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAnalysis(item.id);
                          }}
                          className="text-xs h-7 gap-1.5 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs cursor-pointer"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>Analyze Policy Needs</span>
                        </Button>
                        <span className="text-[11px] text-muted-foreground hover:text-foreground font-medium flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          Review Answers
                          <ArrowRight className="h-3 w-3" />
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] text-primary font-medium flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        Resume Incomplete Draft
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State Card */
          <Card className="border border-dashed border-border/70 bg-card/40 p-10 md:p-14 text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground border border-border/60 mx-auto">
              <FolderGit2 className="h-7 w-7 text-primary/80" />
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-base font-semibold text-foreground">
                No Policy Formation Activity Yet
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Saved assessments and policy drafts will appear here once you begin. Start by
                assessing your organization&apos;s policy needs or drafting an individual policy.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => handleLaunchWizard(true)}
                className="gap-1.5 text-xs font-semibold cursor-pointer shadow-xs"
              >
                <Compass className="h-3.5 w-3.5" /> Start Assessment
              </Button>
              <Link
                href="/policies"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "gap-1.5 text-xs cursor-pointer border-border"
                )}
              >
                <Shield className="h-3.5 w-3.5" /> View Policy Center
              </Link>
            </div>
          </Card>
        )}
      </section>

      {/* ─── 4. FUNCTIONAL "CREATE SPECIFIC POLICY" MODAL ────────────────── */}
      <CreateSpecificPolicyModal
        isOpen={isSpecificPolicyModalOpen}
        onOpenChange={setIsSpecificPolicyModalOpen}
        organizationId={organizationId}
        organizationName={organizationName}
        onSuccess={(draft) => {
          fetchDrafts();
          handleOpenDraft(draft.id);
        }}
      />
    </div>
  );
}
