"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Filter,
  Layers,
  BookOpen,
  Info,
  Building,
  MapPin,
  Check,
  RefreshCw,
  Search,
  AlertCircle,
  SlidersHorizontal,
  XCircle,
  Tag,
  Scale,
  ListTodo,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  PolicyNeedsAnalysis,
  PolicyNeedItem,
  RegulatoryDiscoveryItem,
  CoverageFindingItem,
  UserDecisionItem,
} from "@/services/api/policy-formation";

interface PolicyNeedsAnalysisViewProps {
  assessmentId: string;
  organizationId: string;
  organizationName: string;
  onBack: () => void;
  onOpenDraft?: (draftId: string) => void;
}

type TabType = "plan" | "discovery" | "needs" | "coverage" | "summary" | "evidence";

export function PolicyNeedsAnalysisView({
  assessmentId,
  organizationId,
  organizationName,
  onBack,
  onOpenDraft,
}: PolicyNeedsAnalysisViewProps) {
  const [analysis, setAnalysis] = useState<PolicyNeedsAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRerunning, setIsRerunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>("plan");

  // Local state for user decisions in Policy Plan (need_id -> UserDecisionItem)
  const [decisions, setDecisions] = useState<Record<string, UserDecisionItem>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Filters for Plan tab
  const [decisionFilter, setDecisionFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [coverageFilter, setCoverageFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Stage 4 Drafting State
  const [isDraftingNeedId, setIsDraftingNeedId] = useState<string | null>(null);
  const [verificationModalNeed, setVerificationModalNeed] = useState<PolicyNeedItem | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // Expanded evidence drawer / modal item
  const [selectedDiscoveryForModal, setSelectedDiscoveryForModal] = useState<RegulatoryDiscoveryItem | null>(null);
  const [selectedNeedForModal, setSelectedNeedForModal] = useState<PolicyNeedItem | null>(null);

  // Fetch or execute analysis
  const loadAnalysis = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Calls POST /policy-formation/analyses (starts new or retrieves existing)
      const data = await policyFormationService.startOrGetAnalysis(assessmentId);
      setAnalysis(data);
      setDecisions(data.user_decisions || {});
      setHasUnsavedChanges(false);
    } catch (err: any) {
      console.error("Failed to load policy analysis:", err);
      const detail = err?.response?.data?.detail || "Could not generate or retrieve Policy Needs Analysis.";
      setError(detail);
      toast.error(detail);
    } finally {
      setIsLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  // Handle Rerun Analysis
  const handleRerun = async () => {
    if (!analysis) return;
    setIsRerunning(true);
    try {
      const refreshed = await policyFormationService.rerunAnalysis(analysis.id);
      setAnalysis(refreshed);
      setDecisions(refreshed.user_decisions || {});
      setHasUnsavedChanges(false);
      toast.success(`Analysis rerun complete (v${refreshed.version}). Human review decisions were preserved.`);
    } catch (err: any) {
      console.error("Failed to rerun analysis:", err);
      toast.error(err?.response?.data?.detail || "Failed to rerun analysis.");
    } finally {
      setIsRerunning(false);
    }
  };

  // Selected history snapshot to preview (null if viewing active version)
  const [historySnapshot, setHistorySnapshot] = useState<any | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Handle Save User Decisions with Optimistic Concurrency Control
  const handleSaveDecisions = async () => {
    if (!analysis) return;
    setIsSaving(true);
    try {
      const updated = await policyFormationService.updateDecisions(
        analysis.id,
        decisions,
        analysis.version
      );
      setAnalysis(updated);
      setDecisions(updated.user_decisions || {});
      setHasUnsavedChanges(false);
      toast.success("Policy Plan decisions saved successfully.");
    } catch (err: any) {
      console.error("Failed to save decisions:", err);
      if (err?.response?.status === 409) {
        toast.error(
          "Conflict: The analysis was rerun or modified concurrently. Please refresh the page to load the latest version."
        );
      } else {
        toast.error(err?.response?.data?.detail || "Failed to save decisions.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Stage 4: Trigger Policy Draft Creation / Navigation
  const handleDraftPolicy = async (need: PolicyNeedItem, forcePreliminary = false) => {
    if (!analysis) return;
    const currentDecision = decisions[need.need_id]?.decision || "ACCEPTED";
    if (currentDecision === "REQUIRES_VERIFICATION" && !forcePreliminary) {
      setVerificationModalNeed(need);
      setShowVerificationModal(true);
      return;
    }
    if (currentDecision === "REJECTED" || currentDecision === "DEFERRED") {
      toast.error(`This policy need is marked as '${currentDecision}'. Change review status to 'Accepted' first.`);
      return;
    }

    setIsDraftingNeedId(need.need_id);
    try {
      const draft = await policyFormationService.createOrGetDraft({
        assessment_id: analysis.assessment_id,
        analysis_id: analysis.id,
        need_id: need.need_id,
        force_preliminary: forcePreliminary,
      });
      toast.success(`Policy draft opened for '${need.title}' (v${draft.version}).`);
      if (onOpenDraft) {
        onOpenDraft(draft.id);
      }
    } catch (err: any) {
      console.error("Failed to create/open draft:", err);
      toast.error(err?.response?.data?.detail || "Failed to create or open policy draft.");
    } finally {
      setIsDraftingNeedId(null);
      setShowVerificationModal(false);
    }
  };

  // Update a single decision in state
  const handleUpdateDecision = (needId: string, updates: Partial<UserDecisionItem>) => {
    setDecisions((prev) => {
      const current = prev[needId] || {
        decision: "ACCEPTED",
        priority_override: null,
        notes: "",
      };
      return {
        ...prev,
        [needId]: {
          ...current,
          ...updates,
          updated_at: new Date().toISOString(),
        },
      };
    });
    setHasUnsavedChanges(true);
  };

  // Filtered Policy Needs
  const filteredNeeds = useMemo(() => {
    if (!analysis) return [];
    return analysis.policy_needs.filter((need) => {
      const userDecision = decisions[need.need_id]?.decision || "ACCEPTED";
      const userPriority = decisions[need.need_id]?.priority_override || need.suggested_priority;
      const coverageItem = analysis.coverage_findings.find((c) => c.need_id === need.need_id);
      const coverageStatus = coverageItem?.coverage_status || "Not found";

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = need.title.toLowerCase().includes(query);
        const matchesCategory = need.category.toLowerCase().includes(query);
        const matchesRationale = need.business_rationale.toLowerCase().includes(query);
        if (!matchesTitle && !matchesCategory && !matchesRationale) return false;
      }

      // Decision filter
      if (decisionFilter !== "ALL" && userDecision !== decisionFilter) {
        return false;
      }

      // Priority filter
      if (priorityFilter !== "ALL" && userPriority !== priorityFilter) {
        return false;
      }

      // Coverage filter
      if (coverageFilter !== "ALL" && coverageStatus !== coverageFilter) {
        return false;
      }

      return true;
    });
  }, [analysis, decisions, searchQuery, decisionFilter, priorityFilter, coverageFilter]);

  // Loading State
  if (isLoading) {
    return (
      <Card className="border border-border/60 bg-card p-12 text-center space-y-4 max-w-3xl mx-auto shadow-xs">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 mx-auto animate-pulse">
          <Sparkles className="h-7 w-7 animate-spin" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-foreground">Performing Regulatory Discovery &amp; Policy Needs Analysis</h3>
          <p className="text-xs text-muted-foreground">
            Evaluating statutory obligations, existing workspace coverage, and organizational risks for {organizationName}...
          </p>
        </div>
      </Card>
    );
  }

  // Error State
  if (error || !analysis) {
    return (
      <Card className="border border-destructive/30 bg-destructive/5 p-8 text-center space-y-4 max-w-xl mx-auto">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive mx-auto">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">Analysis Unavailable</h3>
          <p className="text-xs text-muted-foreground">{error || "Could not retrieve policy formation analysis."}</p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Return
          </Button>
          <Button size="sm" onClick={loadAnalysis}>
            <RotateCcw className="h-4 w-4 mr-1.5" /> Retry
          </Button>
        </div>
      </Card>
    );
  }

  const { summary } = analysis;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ─── 1. TOP HEADER & BREADCRUMBS ────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button
              onClick={onBack}
              className="hover:text-foreground inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Policy Formation
            </button>
            <span>/</span>
            <span className="text-foreground font-medium truncate max-w-xs">{summary.assessment_title}</span>
            <span>/</span>
            <span className="text-primary font-medium">Stage 3 Analysis</span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Policy Needs Analysis &amp; Regulatory Discovery
            </h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/25 text-xs font-semibold px-2 py-0.5">
              v{historySnapshot ? historySnapshot.version : analysis.version}
            </Badge>
            {historySnapshot ? (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs font-semibold px-2 py-0.5">
                Archived Snapshot
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/25 text-xs font-semibold px-2 py-0.5">
                Completed
              </Badge>
            )}
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">
            Evidence-backed regulatory discovery, proposed policy needs, and workspace coverage analysis for{" "}
            <span className="font-semibold text-foreground">{organizationName}</span>.
          </p>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {analysis.history && analysis.history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistoryModal(true)}
              className="text-xs gap-1.5 cursor-pointer border-border"
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              History ({analysis.history.length} {analysis.history.length === 1 ? "prior run" : "prior runs"})
            </Button>
          )}

          {historySnapshot ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHistorySnapshot(null);
                setDecisions(analysis.user_decisions || {});
                toast.info(`Returned to active version v${analysis.version}.`);
              }}
              className="text-xs gap-1.5 cursor-pointer bg-primary/10 text-primary border-primary/30"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Back to Active (v{analysis.version})
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRerun}
                disabled={isRerunning}
                className="text-xs gap-1.5 cursor-pointer border-border"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRerunning && "animate-spin")} />
                {isRerunning ? "Rerunning..." : "Rerun Analysis"}
              </Button>

              <Button
                size="sm"
                onClick={handleSaveDecisions}
                disabled={isSaving || !hasUnsavedChanges}
                className={cn(
                  "text-xs gap-1.5 font-semibold cursor-pointer transition-all",
                  hasUnsavedChanges
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted cursor-not-allowed"
                )}
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? "Saving..." : hasUnsavedChanges ? "Save Plan Decisions" : "Decisions Saved"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Snapshot Preview Warning Banner */}
      {historySnapshot && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>Viewing Historical Snapshot v{historySnapshot.version}</strong> archived on{" "}
              {new Date(historySnapshot.archived_at).toLocaleString()}. This snapshot is read-only.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 border-amber-500/40 text-amber-900 dark:text-amber-100 bg-amber-500/20 hover:bg-amber-500/30"
            onClick={() => {
              setHistorySnapshot(null);
              setDecisions(analysis.user_decisions || {});
            }}
          >
            Return to Active v{analysis.version}
          </Button>
        </div>
      )}

      {/* ─── 2. HIGH-LEVEL METRICS CARDS ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border border-border/60 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Regulatory Findings</span>
            <Scale className="h-4 w-4 text-primary/80" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{summary.total_regulatory_discoveries}</span>
            <span className="text-[11px] text-muted-foreground">statutory sources</span>
          </div>
        </Card>

        <Card className="border border-border/60 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Proposed Needs</span>
            <Shield className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{summary.total_policy_needs}</span>
            <span className="text-[11px] text-amber-500 font-medium">
              {summary.high_or_urgent_count} high/urgent
            </span>
          </div>
        </Card>

        <Card className="border border-border/60 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Workspace Coverage</span>
            <FileText className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-500">
              {summary.coverage_breakdown?.Covered || 0}
            </span>
            <span className="text-[11px] text-muted-foreground">
              / {summary.total_policy_needs} covered ({summary.coverage_breakdown?.["Not found"] || 0} gaps)
            </span>
          </div>
        </Card>

        <Card className="border border-border/60 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Human Decisions</span>
            <ListTodo className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {summary.decision_breakdown?.ACCEPTED || 0}
            </span>
            <span className="text-[11px] text-muted-foreground">
              accepted ({summary.decision_breakdown?.REQUIRES_VERIFICATION || 0} to verify)
            </span>
          </div>
        </Card>
      </div>

      {/* ─── 3. NAVIGABLE STAGE TABS ───────────────────────────────────────── */}
      <div className="border-b border-border/60 flex items-center gap-1 overflow-x-auto pb-px">
        {[
          { id: "plan", label: "Prioritized Policy Plan", count: analysis.policy_needs.length, icon: ListTodo },
          { id: "discovery", label: "Regulatory Discovery", count: analysis.regulatory_discoveries.length, icon: Scale },
          { id: "needs", label: "Recommended Policy Needs", count: analysis.policy_needs.length, icon: Shield },
          { id: "coverage", label: "Policy Coverage & Gaps", count: analysis.coverage_findings.length, icon: Layers },
          { id: "summary", label: "Assessment Profile", icon: Building },
          { id: "evidence", label: "Evidence & Assumptions", icon: Info },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all cursor-pointer",
                isActive
                  ? "border-primary text-primary bg-primary/5 rounded-t-lg"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-t-lg"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                    isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── 4. TAB CONTENTS ──────────────────────────────────────────────── */}

      {/* ─── TAB 1: PRIORITIZED POLICY PLAN (PRIMARY INTERACTIVE WORKSPACE) ─── */}
      {activeTab === "plan" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-card/60">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search policy needs, categories, risks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <SlidersHorizontal className="h-3 w-3" /> Filters:
              </span>

              {/* Decision Filter */}
              <select
                value={decisionFilter}
                onChange={(e) => setDecisionFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">All Decisions</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="REQUIRES_VERIFICATION">Requires Verification</option>
                <option value="DEFERRED">Deferred</option>
                <option value="REJECTED">Rejected</option>
              </select>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">All Priorities</option>
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              {/* Coverage Filter */}
              <select
                value={coverageFilter}
                onChange={(e) => setCoverageFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">All Coverage</option>
                <option value="Covered">Covered</option>
                <option value="Requires review">Requires Review</option>
                <option value="Not found">Gaps (Not found)</option>
              </select>
            </div>
          </div>

          {/* Policy Plan Table / Cards */}
          {filteredNeeds.length === 0 ? (
            <Card className="p-8 text-center border-dashed border-border/70 space-y-2">
              <p className="text-sm font-medium text-foreground">No policy needs match the selected filters.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setDecisionFilter("ALL");
                  setPriorityFilter("ALL");
                  setCoverageFilter("ALL");
                }}
                className="text-xs"
              >
                Clear Filters
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredNeeds.map((need) => {
                const needId = need.need_id;
                const userDecisionState = decisions[needId] || {
                  decision: "ACCEPTED",
                  priority_override: null,
                  notes: "",
                };
                const activePriority = userDecisionState.priority_override || need.suggested_priority;
                const coverageItem = analysis.coverage_findings.find((c) => c.need_id === needId);
                const isOverridden = userDecisionState.priority_override && userDecisionState.priority_override !== need.suggested_priority;

                return (
                  <Card
                    key={needId}
                    className="border border-border/70 bg-card p-5 space-y-4 hover:border-primary/40 transition-all shadow-xs"
                  >
                    {/* Top row: Title, Category, Priority, Decision */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-foreground">{need.title}</h3>
                          <Badge variant="outline" className="text-[10px] font-medium border-border/70 text-muted-foreground">
                            {need.category}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-semibold capitalize",
                              need.driver === "regulatory-driven"
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25"
                                : need.driver === "risk-driven"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25"
                            )}
                          >
                            {need.driver.replace("-", " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {need.business_rationale}
                        </p>
                      </div>

                      {/* Controls: Priority Override & Human Decision */}
                      <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0 flex-wrap">
                        {/* Priority Selector */}
                        <div className="flex flex-col items-end text-right">
                          <span className="text-[10px] text-muted-foreground uppercase font-medium">
                            Priority {isOverridden && <span className="text-primary">(Custom)</span>}
                          </span>
                          <select
                            value={activePriority}
                            onChange={(e) => handleUpdateDecision(needId, { priority_override: e.target.value as any })}
                            className={cn(
                              "text-xs font-semibold px-2 py-1 rounded-md border focus:outline-none focus:ring-1 focus:ring-primary",
                              activePriority === "Urgent" && "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
                              activePriority === "High" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
                              activePriority === "Medium" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
                              activePriority === "Low" && "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30"
                            )}
                          >
                            <option value="Urgent">Urgent</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                          </select>
                        </div>

                        {/* Review Decision Selector */}
                        <div className="flex flex-col items-end text-right">
                          <span className="text-[10px] text-muted-foreground uppercase font-medium">Review Status</span>
                          <select
                            value={userDecisionState.decision}
                            onChange={(e) => handleUpdateDecision(needId, { decision: e.target.value as any })}
                            className={cn(
                              "text-xs font-semibold px-2.5 py-1 rounded-md border focus:outline-none focus:ring-1 focus:ring-primary",
                              userDecisionState.decision === "ACCEPTED" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                              userDecisionState.decision === "REQUIRES_VERIFICATION" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
                              userDecisionState.decision === "DEFERRED" && "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
                              userDecisionState.decision === "REJECTED" && "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                            )}
                          >
                            <option value="ACCEPTED">Accepted into Plan</option>
                            <option value="REQUIRES_VERIFICATION">Requires Verification</option>
                            <option value="DEFERRED">Deferred</option>
                            <option value="REJECTED">Rejected</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Metadata Strip: Owner, Cadence, Existing Coverage, Evidence */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg border border-border/50 bg-muted/20 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase">Recommended Owner</span>
                        <span className="font-semibold text-foreground truncate block">{need.recommended_owner_role}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase">Review Cadence</span>
                        <span className="font-semibold text-foreground">{need.suggested_review_frequency}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase">Workspace Coverage</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold mt-0.5",
                            coverageItem?.coverage_status === "Covered"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : coverageItem?.coverage_status === "Requires review"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          )}
                        >
                          {coverageItem?.coverage_status || "Not found"}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase">Evidence Confidence</span>
                        <span className="font-medium text-foreground">{need.evidence_confidence}</span>
                      </div>
                    </div>

                    {/* Notes & Justification */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                        <span>Reviewer Notes &amp; Rationale:</span>
                        {userDecisionState.updated_at && (
                          <span className="text-[10px] text-muted-foreground">
                            Updated {new Date(userDecisionState.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        placeholder="Add decision notes (e.g. approved for drafting, waiting for legal sign-off, or custom scope exceptions)..."
                        value={userDecisionState.notes || ""}
                        onChange={(e) => handleUpdateDecision(needId, { notes: e.target.value })}
                        className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {/* Stage 4 Drafting Action Bar */}
                    <div className="pt-2.5 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-xs">
                        {userDecisionState.decision === "ACCEPTED" && (
                          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Accepted into Policy Plan — Ready for AI Drafting</span>
                          </span>
                        )}
                        {userDecisionState.decision === "REQUIRES_VERIFICATION" && (
                          <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>Unresolved questions — preliminary draft requires human verification</span>
                          </span>
                        )}
                        {userDecisionState.decision === "DEFERRED" && (
                          <span className="text-muted-foreground italic">
                            Drafting deferred. Switch review status to Accepted when ready.
                          </span>
                        )}
                        {userDecisionState.decision === "REJECTED" && (
                          <span className="text-muted-foreground italic">
                            Policy need excluded from organizational plan.
                          </span>
                        )}
                      </div>

                      {(userDecisionState.decision === "ACCEPTED" || userDecisionState.decision === "REQUIRES_VERIFICATION") && (
                        <Button
                          size="sm"
                          onClick={() => handleDraftPolicy(need, false)}
                          disabled={isDraftingNeedId === needId}
                          className={cn(
                            "text-xs h-7.5 px-3 gap-1.5 font-semibold cursor-pointer shrink-0 shadow-2xs",
                            userDecisionState.decision === "ACCEPTED"
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                          )}
                        >
                          {isDraftingNeedId === needId ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              <span>Generating Draft...</span>
                            </>
                          ) : userDecisionState.decision === "ACCEPTED" ? (
                            <>
                              <Sparkles className="h-3.5 w-3.5" />
                              <span>Draft Policy</span>
                            </>
                          ) : (
                            <>
                              <FileText className="h-3.5 w-3.5" />
                              <span>Draft Preliminary Policy</span>
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: REGULATORY DISCOVERY & PROVENANCE ───────────────────────── */}
      {activeTab === "discovery" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border/60 bg-muted/15 space-y-1">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" /> Traceable Statutory Obligations &amp; Legal Standards
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              These statutory regulations and benchmark standards were discovered from the authorized regulation repository
              and canonical legal registry matching your operating jurisdictions and activities. No obligations were fabricated.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.regulatory_discoveries.map((discovery) => (
              <Card
                key={discovery.regulation_id}
                className="border border-border/70 bg-card p-5 space-y-3.5 hover:border-primary/40 transition-all shadow-xs flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] font-medium">
                          {discovery.legal_instrument_type || "Statutory Act"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold",
                            discovery.source_origin === "uploaded_document"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {discovery.source_origin === "uploaded_document"
                            ? "Uploaded Document"
                            : "Canonical Statutory Registry"}
                        </Badge>
                      </div>
                      <h4 className="text-sm font-bold text-foreground leading-snug">{discovery.title}</h4>
                      <span className="text-[11px] font-semibold text-primary">{discovery.act_name}</span>
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-semibold shrink-0",
                        discovery.evidence_status === "verified_source_requirement"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : discovery.evidence_status === "potentially_applicable"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      )}
                    >
                      {discovery.evidence_status.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  {/* Commencement Warning Notice if rules are pending or phased */}
                  {discovery.commencement_status && (
                    <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[11px] flex items-start gap-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <div>
                        <strong>Commencement Status:</strong> {discovery.commencement_status}
                      </div>
                    </div>
                  )}

                  {/* Applicability Threshold Banner */}
                  {discovery.applicability_thresholds && (
                    <div className="p-2 rounded-lg border border-border/50 bg-muted/20 text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <strong>Applicability Threshold:</strong> {discovery.applicability_thresholds}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {discovery.relevance_explanation}
                  </p>

                  {/* Trigger answers */}
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Trigger Answers</span>
                    <div className="flex flex-wrap gap-1">
                      {discovery.trigger_answers.map((trig, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[10px] font-normal px-2 py-0.5">
                          {trig}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Relevant provisions */}
                  {discovery.relevant_provisions && discovery.relevant_provisions.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Verified Statutory Provisions</span>
                      <ul className="space-y-1 text-xs text-foreground bg-muted/30 p-2.5 rounded-lg border border-border/50">
                        {discovery.relevant_provisions.slice(0, 3).map((prov, idx) => (
                          <li key={idx} className="flex items-start gap-1.5 text-[11px]">
                            <Check className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                            <span>{prov}</span>
                          </li>
                        ))}
                        {discovery.relevant_provisions.length > 3 && (
                          <li className="text-[10px] text-muted-foreground italic pl-4">
                            + {discovery.relevant_provisions.length - 3} additional clauses in statutory source
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Jurisdiction: <strong className="text-foreground">{discovery.jurisdiction}</strong></span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2 text-primary hover:text-primary cursor-pointer gap-1"
                    onClick={() => setSelectedDiscoveryForModal(discovery)}
                  >
                    <span>View Provenance</span>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 3: RECOMMENDED POLICY NEEDS ───────────────────────────────── */}
      {activeTab === "needs" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border/60 bg-muted/15 space-y-1">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-500" /> Proposed Organizational Policies
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Policies define high-level commitments, responsibilities, and operational governance expectations.
              Individual implementation procedures, standards, and technical runbooks should be maintained separately under these core policies.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.policy_needs.map((need) => (
              <Card key={need.need_id} className="border border-border/70 bg-card p-5 space-y-3.5 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{need.title}</h4>
                    <span className="text-[11px] text-muted-foreground font-medium">{need.category}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-semibold">
                    {need.suggested_priority} Priority
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {need.business_rationale}
                </p>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Linked Statutory Standards</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {need.linked_regulations.map((reg, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[10px] font-medium">
                          {reg}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Key Mitigated Risks</span>
                    <ul className="space-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
                      {need.linked_risks.map((risk, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-amber-500 font-bold">•</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Recommended Owner</span>
                    <span className="font-semibold text-foreground">{need.recommended_owner_role}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Review Cadence</span>
                    <span className="font-semibold text-foreground">{need.suggested_review_frequency}</span>
                  </div>
                </div>

                {/* Stage 4 Drafting Button on Needs Tab */}
                <div className="pt-2 border-t border-border/40 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDraftPolicy(need, false)}
                    disabled={isDraftingNeedId === need.need_id}
                    className="text-xs h-7 gap-1.5 font-medium cursor-pointer"
                  >
                    {isDraftingNeedId === need.need_id ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 text-primary" />
                        <span>Draft This Policy</span>
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 4: EXISTING POLICY COVERAGE & GAP ANALYSIS ─────────────────── */}
      {activeTab === "coverage" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border/60 bg-muted/15 space-y-1">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-500" /> Workspace Policy Gap Analysis
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Identifies which policy needs are already addressed by documents in your workspace repository and where gaps remain.
            </p>
          </div>

          {/* Statutory and Legal Disclaimer Banner */}
          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Legal Notice on Repository Coverage:</p>
              <p className="leading-relaxed">
                Repository search results and document keyword matches do not establish formal legal compliance.
                A status of <em>Requires review</em> signifies that a candidate policy file was detected, but substantive
                human and legal review of its text and operational implementation is required to confirm compliance.
                Only verified substantive text alignments qualify for covered status.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {analysis.coverage_findings.map((finding) => {
              const matchingNeed = analysis.policy_needs.find((n) => n.need_id === finding.need_id);
              const isCovered = finding.coverage_status === "Covered";
              const isNotFound = finding.coverage_status === "Not found";
              const isRequiresReview = finding.coverage_status === "Requires review";

              return (
                <Card
                  key={finding.need_id}
                  className="border border-border/70 bg-card p-5 space-y-3 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-foreground">
                        {matchingNeed?.title || finding.need_id}
                      </h4>
                      <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
                        {matchingNeed?.category}
                      </Badge>
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-semibold self-start sm:self-auto",
                        isCovered
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : isRequiresReview
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                          : isNotFound
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      )}
                    >
                      {finding.coverage_status}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {finding.reason}
                  </p>

                  <div className="p-3 rounded-lg border border-border/50 bg-muted/20 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Matched Repository Document</span>
                      <span className="font-semibold text-foreground block truncate">
                        {finding.policy_title !== "None" ? finding.policy_title : "No matching document in repository"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Evidence Excerpt / Reference</span>
                      <span className="text-muted-foreground block truncate">
                        {finding.evidence_excerpt || "Document upload or drafting required"}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-[11px] text-muted-foreground leading-relaxed flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{finding.limitations_note}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB 5: ASSESSMENT SUMMARY ─────────────────────────────────────── */}
      {activeTab === "summary" && (
        <Card className="border border-border/70 bg-card p-6 space-y-6 shadow-xs max-w-4xl mx-auto">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Underlying Assessment Profile</h3>
              <p className="text-xs text-muted-foreground">
                Circumspect answers and organizational declarations used to produce this Policy Needs Analysis.
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-semibold bg-primary/10 text-primary border-primary/25">
              Completed Assessment
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5 p-3.5 rounded-xl border border-border/50 bg-muted/20">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Organization &amp; Industry</span>
              <p className="text-sm font-bold text-foreground">{organizationName}</p>
              <p className="text-muted-foreground">Scope: <strong>{summary.scope_type}</strong></p>
            </div>

            <div className="space-y-1.5 p-3.5 rounded-xl border border-border/50 bg-muted/20">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Analysis Provenance</span>
              <p className="text-muted-foreground">Run Version: <strong>v{analysis.version}</strong></p>
              <p className="text-muted-foreground">Completed: <strong>{new Date(analysis.updated_at).toLocaleString()}</strong></p>
            </div>
          </div>
        </Card>
      )}

      {/* ─── TAB 6: EVIDENCE & LIMITATIONS NOTICE ─────────────────────────── */}
      {activeTab === "evidence" && (
        <Card className="border border-border/70 bg-card p-6 space-y-6 shadow-xs max-w-3xl mx-auto">
          <div className="space-y-1 border-b border-border/60 pb-3">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" /> Legal Evidence Assumptions &amp; Disclaimers
            </h3>
            <p className="text-xs text-muted-foreground">
              Traceability constraints, assumptions, and multi-tenant security verification.
            </p>
          </div>

          <div className="space-y-4 text-xs text-muted-foreground leading-relaxed">
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-1.5 text-foreground">
              <h4 className="font-bold flex items-center gap-1.5 text-xs text-primary">
                <CheckCircle2 className="h-4 w-4" /> Multi-Tenant Workspace Isolation
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                All analysis findings, workspace policy matches, and user review decisions are strictly isolated to workspace{" "}
                <span className="font-semibold text-foreground">{organizationName}</span>. No data is shared with or accessible by other organizations.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-foreground">Evidence Standard</h4>
              <p>
                Regulatory discovery uses verified legislation and standards from LexisGraph&apos;s statutory repository.
                Citations, sections, and effective dates are only presented when present in verified legal metadata.
                Unconfirmed requirements are flagged as <em>Requires Verification</em> rather than stated as definitive obligations.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-foreground">Coverage Limitations</h4>
              <p>
                Workspace policy coverage compares repository document metadata and content against identified policy needs.
                A status of <em>Not found</em> does not constitute legal proof that operational procedures do not exist.
                Similarly, a status of <em>Requires review</em> or <em>Covered</em> indicates thematic or partial alignment and does not constitute formal legal compliance certification.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ─── 5. PROVENANCE & STATUTORY CITATION MODAL ───────────────────────── */}
      {selectedDiscoveryForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Statutory Provenance &amp; Verification Details</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
                onClick={() => setSelectedDiscoveryForModal(null)}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div>
                <h4 className="text-base font-bold text-foreground">{selectedDiscoveryForModal.title}</h4>
                <p className="text-primary font-medium">{selectedDiscoveryForModal.act_name}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Instrument Type</span>
                  <span className="font-semibold text-foreground">{selectedDiscoveryForModal.legal_instrument_type || "Statute"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Issuing Authority</span>
                  <span className="font-semibold text-foreground">{selectedDiscoveryForModal.issuing_authority || "Parliament / Legislature"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Jurisdiction</span>
                  <span className="font-semibold text-foreground">{selectedDiscoveryForModal.jurisdiction}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Official Citation / Gazette</span>
                  <span className="font-mono text-[11px] text-foreground">{selectedDiscoveryForModal.source_reference || "Official Gazette"}</span>
                </div>
              </div>

              {/* Source Origin Information */}
              <div className="p-3 rounded-lg border border-border/50 bg-card space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Source Origin &amp; Traceability</span>
                <p className="text-foreground leading-relaxed">
                  {selectedDiscoveryForModal.source_origin === "uploaded_document" ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Sourced from an official regulatory PDF document uploaded and indexed in your workspace repository.
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      ℹ Sourced from LexisGraph&apos;s canonical statutory registry based on verified parliamentary legislation.
                      No local PDF file is uploaded for this entry; obligations are cited directly from the statutory text.
                    </span>
                  )}
                </p>
              </div>

              {/* Commencement Notice */}
              {selectedDiscoveryForModal.commencement_status && (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 space-y-1">
                  <span className="text-[10px] uppercase font-bold flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Commencement &amp; Enforcement Notice
                  </span>
                  <p className="leading-relaxed">{selectedDiscoveryForModal.commencement_status}</p>
                </div>
              )}

              {/* Applicability Thresholds */}
              {selectedDiscoveryForModal.applicability_thresholds && (
                <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1 text-foreground">
                  <span className="text-[10px] uppercase font-bold text-primary block">Applicability Threshold</span>
                  <p className="leading-relaxed">{selectedDiscoveryForModal.applicability_thresholds}</p>
                </div>
              )}

              {/* Verified Provisions */}
              {selectedDiscoveryForModal.relevant_provisions && selectedDiscoveryForModal.relevant_provisions.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Verified Statutory Provisions &amp; Clauses</span>
                  <ul className="space-y-1 bg-muted/30 p-3 rounded-lg border border-border/50">
                    {selectedDiscoveryForModal.relevant_provisions.map((prov, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-xs text-foreground">
                        <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <span>{prov}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-border bg-muted/10 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setSelectedDiscoveryForModal(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 6. VERSION HISTORY MODAL ───────────────────────────────────────── */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Analysis Version History</h3>
                  <p className="text-[11px] text-muted-foreground">Previous run snapshots remain preserved and recoverable.</p>
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

            <div className="p-4 overflow-y-auto space-y-2.5 text-xs">
              {/* Current Active Version */}
              <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Badge className="bg-primary text-primary-foreground text-[10px]">v{analysis.version} (Active)</Badge>
                    <span className="font-semibold text-foreground">Current Analysis</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground block mt-1">
                    Updated {new Date(analysis.updated_at).toLocaleString()}
                  </span>
                </div>
                {historySnapshot && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => {
                      setHistorySnapshot(null);
                      setDecisions(analysis.user_decisions || {});
                      setShowHistoryModal(false);
                      toast.info(`Switched to active version v${analysis.version}.`);
                    }}
                  >
                    View Active
                  </Button>
                )}
              </div>

              {/* Historical Snapshots */}
              {analysis.history && analysis.history.length > 0 ? (
                analysis.history.map((hist: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-border/60 bg-muted/20 hover:border-border transition-all flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-bold">v{hist.version}</Badge>
                        <span className="font-medium text-foreground">Archived Run</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        Archived {new Date(hist.archived_at).toLocaleString()} • {hist.policy_needs?.length || 0} needs
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => {
                        setHistorySnapshot(hist);
                        setDecisions(hist.user_decisions || {});
                        setShowHistoryModal(false);
                        toast.info(`Loaded historical snapshot v${hist.version} (read-only).`);
                      }}
                    >
                      View Snapshot
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  No previous run snapshots exist yet. Prior versions will appear here when you rerun this analysis.
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

      {/* ─── STAGE 4: VERIFICATION REQUIRED MODAL ───────────────────────── */}
      <Dialog open={showVerificationModal} onOpenChange={setShowVerificationModal}>
        <DialogContent className="sm:max-w-lg border-border/70 bg-card">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-bold text-foreground">
                Policy Need Requires Human Verification
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              This policy need has unresolved applicability questions or conditional statutory requirements.
            </DialogDescription>
          </DialogHeader>

          {verificationModalNeed && (
            <div className="space-y-3 my-2 text-xs">
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-1.5">
                <h4 className="font-semibold text-amber-900 dark:text-amber-200">
                  {verificationModalNeed.title}
                </h4>
                <p className="text-muted-foreground leading-relaxed text-[11px]">
                  {verificationModalNeed.business_rationale}
                </p>
              </div>

              {verificationModalNeed.assumptions_and_questions &&
                verificationModalNeed.assumptions_and_questions.length > 0 && (
                  <div className="space-y-1.5 p-3 rounded-xl border border-border/60 bg-muted/20">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Unresolved Applicability Questions / Caveats:
                    </span>
                    <ul className="space-y-1 text-muted-foreground text-[11px]">
                      {verificationModalNeed.assumptions_and_questions.map((q, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-500 font-bold">•</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              <div className="p-3 rounded-lg border border-border bg-card text-[11px] text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Preliminary Draft Notice:</p>
                <p>
                  Proceeding will generate a <strong>preliminary policy draft</strong> marked with a status of{" "}
                  <Badge variant="outline" className="text-[10px] mx-1 bg-amber-500/10 text-amber-600 border-amber-500/30">
                    Needs Verification
                  </Badge>.
                  Unconfirmed legal assumptions and verification warnings will be preserved in Section 11 of the draft.
                  It will not be treated as a confirmed regulatory mandate.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowVerificationModal(false)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs cursor-pointer bg-amber-600 hover:bg-amber-700 text-white font-medium"
              disabled={isDraftingNeedId !== null}
              onClick={() => {
                if (verificationModalNeed) {
                  handleDraftPolicy(verificationModalNeed, true);
                }
              }}
            >
              {isDraftingNeedId ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
                  Generating...
                </>
              ) : (
                "Proceed with Preliminary Draft"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
