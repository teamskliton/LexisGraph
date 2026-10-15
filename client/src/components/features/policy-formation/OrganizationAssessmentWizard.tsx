"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Globe,
  Zap,
  Layers,
  Shield,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Save,
  Clock,
  AlertCircle,
  Sparkles,
  Info,
  Check,
  RefreshCw,
  X,
  FileText,
  HelpCircle,
  Building,
  Briefcase,
  Users,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  policyFormationService,
  OrganizationAssessment,
  AssessmentAnswers,
  AvailablePolicyItem,
} from "@/services/api/policy-formation";

interface OrganizationAssessmentWizardProps {
  initialAssessment?: OrganizationAssessment | null;
  organizationId: string;
  organizationName: string;
  onExit: () => void;
  onCompleted?: (assessment: OrganizationAssessment) => void;
  onAnalyzePolicyNeeds?: (assessmentId: string) => void;
}

const STEPS = [
  { id: 1, label: "Profile", title: "Organization Profile", icon: Building2 },
  { id: 2, label: "Jurisdictions", title: "Jurisdiction & Locations", icon: Globe },
  { id: 3, label: "Activities", title: "Business Activities & Risk", icon: Zap },
  { id: 4, label: "Scope", title: "Operational Scope", icon: Layers },
  { id: 5, label: "Policies", title: "Existing Policies", icon: Shield },
  { id: 6, label: "Review", title: "Review & Complete", icon: CheckCircle2 },
];

const INDUSTRIES = [
  "Technology & Software (SaaS)",
  "Financial Services & FinTech",
  "Healthcare & Life Sciences",
  "E-Commerce & Retail",
  "Professional Services & Legal",
  "Manufacturing & Industrial",
  "Education & EdTech",
  "Hospitality & Real Estate",
  "Media & Entertainment",
  "Government & Non-Profit",
  "Other",
];

const STANDARD_CERTIFICATIONS = [
  "ISO 27001",
  "SOC 2 (Type I / II)",
  "GDPR Compliant",
  "HIPAA",
  "PCI-DSS",
  "NIST CSF",
  "ISO 9001",
  "CCPA / CPRA",
];

const COMMON_COUNTRIES = [
  "United States",
  "United Kingdom",
  "European Union",
  "India",
  "Canada",
  "Australia",
  "Singapore",
  "Germany",
  "France",
  "United Arab Emirates",
  "Other",
];

export function OrganizationAssessmentWizard({
  initialAssessment,
  organizationId,
  organizationName,
  onExit,
  onCompleted,
  onAnalyzePolicyNeeds,
}: OrganizationAssessmentWizardProps) {
  const router = useRouter();

  // Assessment state
  const [assessment, setAssessment] = useState<OrganizationAssessment | null>(initialAssessment || null);
  const [currentStep, setCurrentStep] = useState<number>(initialAssessment?.current_step || 1);
  const [answers, setAnswers] = useState<AssessmentAnswers>(() => {
    const defaultAnswers: AssessmentAnswers = {
      profile: {
        organization_name: organizationName || "",
        org_type: "Startup",
        industry: "Technology & Software (SaaS)",
        employee_count: "1-10",
      },
      jurisdiction: {
        primary_country: "United States",
        other_countries: [],
      },
      activities: {
        personal_data: false,
        sensitive_data: false,
        cloud_services: true,
        ai_systems: false,
        payments: false,
        employment_types: ["Direct full-time"],
        vendors: false,
        physical_facilities: false,
        licensed_activities: false,
      },
      scope: {
        scope_type: "ORGANIZATION",
      },
      existing_policies: {
        has_existing_policies: false,
        starting_mode: "scratch",
        selected_policy_ids: [],
        certifications: [],
      },
    };

    if (initialAssessment?.answers) {
      return {
        profile: { ...defaultAnswers.profile, ...initialAssessment.answers.profile },
        jurisdiction: { ...defaultAnswers.jurisdiction, ...initialAssessment.answers.jurisdiction },
        activities: { ...defaultAnswers.activities, ...initialAssessment.answers.activities },
        scope: { ...defaultAnswers.scope, ...initialAssessment.answers.scope },
        existing_policies: { ...defaultAnswers.existing_policies, ...initialAssessment.answers.existing_policies },
      };
    }
    return defaultAnswers;
  });

  // Available policies in this workspace
  const [availablePolicies, setAvailablePolicies] = useState<AvailablePolicyItem[]>([]);
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(false);

  // Autosave status
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);
  const [isCompletedSuccess, setIsCompletedSuccess] = useState(initialAssessment?.status === "COMPLETED");

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirtyRef = useRef(false);

  // Load available policies once
  useEffect(() => {
    setIsLoadingPolicies(true);
    policyFormationService
      .getAvailablePolicies()
      .then((pols) => setAvailablePolicies(pols || []))
      .catch((err) => console.warn("Failed to load available policies:", err))
      .finally(() => setIsLoadingPolicies(false));
  }, []);

  // Ensure assessment record exists on backend
  useEffect(() => {
    if (!assessment) {
      policyFormationService
        .createOrResumeAssessment({ resume_if_exists: true })
        .then((created) => {
          setAssessment(created);
          if (created.current_step && created.current_step >= 1 && created.current_step <= 6) {
            setCurrentStep(created.current_step);
          }
          if (created.answers) {
            setAnswers((prev) => ({
              profile: { ...prev.profile, ...created.answers.profile },
              jurisdiction: { ...prev.jurisdiction, ...created.answers.jurisdiction },
              activities: { ...prev.activities, ...created.answers.activities },
              scope: { ...prev.scope, ...created.answers.scope },
              existing_policies: { ...prev.existing_policies, ...created.answers.existing_policies },
            }));
          }
        })
        .catch((err) => {
          console.error("Failed to initialize assessment session:", err);
          setSaveStatus("error");
          toast.error("Could not initialize assessment session. Please retry.");
        });
    }
  }, [assessment]);

  // Debounced Autosave function
  const triggerSave = useCallback(
    (newStep?: number, forcedAnswers?: AssessmentAnswers) => {
      const targetAnswers = forcedAnswers || answers;
      const targetStep = newStep || currentStep;
      if (!assessment?.id) return;

      setSaveStatus("saving");

      policyFormationService
        .updateAssessment(assessment.id, {
          current_step: targetStep,
          scope_type: targetAnswers.scope.scope_type,
          answers: targetAnswers,
        })
        .then((updated) => {
          setAssessment(updated);
          setSaveStatus("saved");
          setLastSavedAt(new Date());
          isDirtyRef.current = false;
        })
        .catch((err) => {
          console.error("Autosave failed:", err);
          setSaveStatus("error");
        });
    },
    [assessment?.id, answers, currentStep]
  );

  // Track answer updates
  const updateAnswers = <K extends keyof AssessmentAnswers>(
    section: K,
    patch: Partial<AssessmentAnswers[K]>
  ) => {
    isDirtyRef.current = true;
    setSaveStatus("unsaved");

    setAnswers((prev) => {
      const updatedSection = { ...prev[section], ...patch };
      const updatedAnswers = { ...prev, [section]: updatedSection };

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        triggerSave(currentStep, updatedAnswers);
      }, 1000);

      return updatedAnswers;
    });
  };

  // Step change navigation
  const handleGoToStep = (stepNumber: number) => {
    if (stepNumber < 1 || stepNumber > 6) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    triggerSave(stepNumber);
    setCurrentStep(stepNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!answers.profile.organization_name.trim()) {
        toast.error("Please enter your organization or business name.");
        return;
      }
    }
    handleGoToStep(currentStep + 1);
  };

  const handlePrev = () => {
    handleGoToStep(currentStep - 1);
  };

  // Final Completion Handler
  const handleCompleteAssessment = async () => {
    if (!assessment?.id) return;
    if (!answers.profile.organization_name.trim()) {
      toast.error("Organization name in Step 1 is required to complete the assessment.");
      handleGoToStep(1);
      return;
    }

    setIsSubmittingCompletion(true);
    try {
      // First ensure final answers are flushed
      await policyFormationService.updateAssessment(assessment.id, {
        current_step: 6,
        scope_type: answers.scope.scope_type,
        answers,
      });

      const completed = await policyFormationService.completeAssessment(assessment.id);
      setAssessment(completed);
      setIsCompletedSuccess(true);
      toast.success("Policy Formation Assessment completed successfully!");
      if (onCompleted) onCompleted(completed);
    } catch (err: any) {
      console.error("Failed to complete assessment:", err);
      const detail = err?.response?.data?.detail || "Failed to complete assessment. Please review required fields.";
      toast.error(detail);
    } finally {
      setIsSubmittingCompletion(false);
    }
  };

  // Safe Exit warning
  const handleExitClick = () => {
    if (isDirtyRef.current) {
      if (confirm("You have unsaved changes in your assessment. Are you sure you want to leave?")) {
        onExit();
      }
    } else {
      onExit();
    }
  };

  // If completed success view
  if (isCompletedSuccess) {
    return (
      <Card className="border border-border/60 bg-card p-8 md:p-12 text-center max-w-2xl mx-auto space-y-6 shadow-sm animate-in zoom-in-95 duration-200">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 mx-auto">
          <CheckCircle2 className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/25 px-2.5 py-0.5 text-xs font-semibold">
            Stage 2 Complete
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Assessment Complete &amp; Saved
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
            Your circumspect profile for <span className="font-semibold text-foreground">{answers.profile.organization_name || organizationName}</span> has been securely stored in your workspace.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-muted/20 text-left space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Scope:</span>
            <span className="font-semibold text-foreground">{answers.scope.scope_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Industry:</span>
            <span className="font-semibold text-foreground">{answers.profile.industry}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Primary Location:</span>
            <span className="font-semibold text-foreground">{answers.jurisdiction.primary_country}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Policy Baseline:</span>
            <span className="font-semibold text-foreground">
              {answers.existing_policies.starting_mode === "scratch" ? "Start from Scratch" : "Build on Existing Policies"}
            </span>
          </div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          {onAnalyzePolicyNeeds && assessment && (
            <Button
              onClick={() => onAnalyzePolicyNeeds(assessment.id)}
              className="w-full sm:w-auto gap-2 font-semibold cursor-pointer bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" />
              <span>Analyze Policy Needs</span>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onExit()}
            className="w-full sm:w-auto gap-2 font-semibold cursor-pointer border-border"
          >
            <span>Return to Policy Formation</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setIsCompletedSuccess(false)}
            className="w-full sm:w-auto text-xs cursor-pointer text-muted-foreground hover:text-foreground"
          >
            Review Answers
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* ─── 1. TOP NAVBAR / BAR ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExitClick}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Exit
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {assessment?.title || "Organization Policy Assessment"}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-semibold px-2 py-0.5",
                assessment?.status === "COMPLETED"
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : "bg-primary/10 text-primary border-primary/20"
              )}
            >
              {assessment?.status || "DRAFT"}
            </Badge>
          </div>
        </div>

        {/* Autosave and Workspace Pill */}
        <div className="flex items-center gap-3 self-end sm:self-auto text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
            {saveStatus === "saving" && (
              <>
                <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                <span>Saving...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span>
                  Saved{lastSavedAt ? ` ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                </span>
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <Clock className="h-3 w-3 text-amber-500" />
                <span>Unsaved changes</span>
              </>
            )}
            {saveStatus === "error" && (
              <>
                <AlertCircle className="h-3 w-3 text-destructive" />
                <span className="text-destructive font-medium">Save error</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => triggerSave()}
                  className="h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/10"
                >
                  Retry
                </Button>
              </>
            )}
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border/60 text-xs">
            <span className="text-muted-foreground">Workspace:</span>
            <span className="font-semibold text-foreground">{organizationName}</span>
          </div>
        </div>
      </div>

      {/* ─── 2. STEP PROGRESS INDICATOR ─────────────────────────────────── */}
      <div className="p-3 md:p-4 rounded-xl border border-border/60 bg-card shadow-2xs">
        <div className="grid grid-cols-6 gap-1 md:gap-2">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id || assessment?.status === "COMPLETED";

            return (
              <button
                key={step.id}
                onClick={() => handleGoToStep(step.id)}
                className={cn(
                  "flex flex-col items-center text-center p-2 rounded-lg transition-all cursor-pointer group",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/25"
                    : isCompleted
                    ? "text-foreground hover:bg-muted/40"
                    : "text-muted-foreground hover:bg-muted/20"
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all mb-1",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : isCompleted
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/25"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.id}
                </div>
                <span className="text-[10px] md:text-xs font-semibold truncate max-w-full">
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 3. STEP CONTENT PANELS ─────────────────────────────────────── */}
      <Card className="border border-border/60 bg-card p-6 md:p-8 shadow-xs">
        {/* ── STEP 1: ORGANIZATION PROFILE ── */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">Step 1 — Organization Profile</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Tell us about your organization&apos;s identity, operating scale, and nature of business.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Organization Name */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="org-name" className="text-xs font-semibold">
                  Organization or Business Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="org-name"
                  value={answers.profile.organization_name}
                  onChange={(e) => updateAnswers("profile", { organization_name: e.target.value })}
                  placeholder="e.g. Acme Innovations Corp"
                  className="bg-background text-sm"
                />
              </div>

              {/* Organization Type */}
              <div className="space-y-1.5">
                <Label htmlFor="org-type" className="text-xs font-semibold">
                  Organization Structure Type
                </Label>
                <select
                  id="org-type"
                  value={answers.profile.org_type}
                  onChange={(e) => updateAnswers("profile", { org_type: e.target.value })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="Startup">Startup (Seed to Growth)</option>
                  <option value="Established company">Established Private Company</option>
                  <option value="Public-sector organization">Public-Sector / Enterprise</option>
                  <option value="Nonprofit">Nonprofit / NGO</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Workforce Size */}
              <div className="space-y-1.5">
                <Label htmlFor="employee-count" className="text-xs font-semibold">
                  Approximate Workforce Size
                </Label>
                <select
                  id="employee-count"
                  value={answers.profile.employee_count}
                  onChange={(e) => updateAnswers("profile", { employee_count: e.target.value })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="1-10">1 – 10 employees</option>
                  <option value="11-50">11 – 50 employees</option>
                  <option value="51-200">51 – 200 employees</option>
                  <option value="201-1000">201 – 1,000 employees</option>
                  <option value="1000+">1,000+ employees</option>
                </select>
              </div>

              {/* Custom Org Type if Other */}
              {answers.profile.org_type === "Other" && (
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="custom-org-type" className="text-xs font-semibold">
                    Specify Organization Type
                  </Label>
                  <Input
                    id="custom-org-type"
                    value={answers.profile.custom_org_type || ""}
                    onChange={(e) => updateAnswers("profile", { custom_org_type: e.target.value })}
                    placeholder="Describe organization structure..."
                    className="bg-background text-sm"
                  />
                </div>
              )}

              {/* Industry */}
              <div className="space-y-1.5">
                <Label htmlFor="industry" className="text-xs font-semibold">
                  Primary Industry
                </Label>
                <select
                  id="industry"
                  value={answers.profile.industry}
                  onChange={(e) => updateAnswers("profile", { industry: e.target.value })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sub-industry */}
              <div className="space-y-1.5">
                <Label htmlFor="sub-industry" className="text-xs font-semibold">
                  Sub-Industry / Domain Niche (Optional)
                </Label>
                <Input
                  id="sub-industry"
                  value={answers.profile.sub_industry || ""}
                  onChange={(e) => updateAnswers("profile", { sub_industry: e.target.value })}
                  placeholder="e.g. AI diagnostics, Payments gateway, B2B CRM"
                  className="bg-background text-sm"
                />
              </div>

              {/* Products & Services */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="products-services" className="text-xs font-semibold">
                  Core Products or Services Offered
                </Label>
                <Input
                  id="products-services"
                  value={answers.profile.products_services || ""}
                  onChange={(e) => updateAnswers("profile", { products_services: e.target.value })}
                  placeholder="Brief summary of offerings (e.g. Cloud API platform, Medical device hardware, Financial advisory)"
                  className="bg-background text-sm"
                />
              </div>

              {/* Business Description */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="description" className="text-xs font-semibold">
                  Business Description &amp; Mission (Optional)
                </Label>
                <textarea
                  id="description"
                  rows={3}
                  value={answers.profile.description || ""}
                  onChange={(e) => updateAnswers("profile", { description: e.target.value })}
                  placeholder="Provide brief context regarding your organization's operations, primary customers, and objectives..."
                  className="w-full p-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Optional Parent Org */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="parent-org" className="text-xs font-semibold">
                  Parent Organization / Group Holding (If applicable)
                </Label>
                <Input
                  id="parent-org"
                  value={answers.profile.parent_org || ""}
                  onChange={(e) => updateAnswers("profile", { parent_org: e.target.value })}
                  placeholder="Name of parent corporate group or holding entity..."
                  className="bg-background text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: JURISDICTION & OPERATING LOCATIONS ── */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">
                  Step 2 — Jurisdiction and Operating Locations
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Identify where your organization operates and where your customers or staff are based.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Primary Country */}
              <div className="space-y-1.5">
                <Label htmlFor="primary-country" className="text-xs font-semibold">
                  Primary Country of Incorporation / Headquarters <span className="text-destructive">*</span>
                </Label>
                <select
                  id="primary-country"
                  value={answers.jurisdiction.primary_country}
                  onChange={(e) => updateAnswers("jurisdiction", { primary_country: e.target.value })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {COMMON_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* State / Province */}
              <div className="space-y-1.5">
                <Label htmlFor="state-province" className="text-xs font-semibold">
                  State, Province, or Regional Jurisdiction
                </Label>
                <Input
                  id="state-province"
                  value={answers.jurisdiction.state_province || ""}
                  onChange={(e) => updateAnswers("jurisdiction", { state_province: e.target.value })}
                  placeholder="e.g. California, Delaware, Maharashtra, Ontario"
                  className="bg-background text-sm"
                />
              </div>

              {/* Other Countries Multi-select Pills */}
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs font-semibold">
                  Other Countries or Global Regions with Operations
                </Label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_COUNTRIES.filter((c) => c !== answers.jurisdiction.primary_country && c !== "Other").map((c) => {
                    const isSelected = answers.jurisdiction.other_countries.includes(c);
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() => {
                          const updated = isSelected
                            ? answers.jurisdiction.other_countries.filter((item) => item !== c)
                            : [...answers.jurisdiction.other_countries, c];
                          updateAnswers("jurisdiction", { other_countries: updated });
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Operating / Staff Locations */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="operating-locations" className="text-xs font-semibold">
                  Physical Office Locations or Remote Work Hubs
                </Label>
                <Input
                  id="operating-locations"
                  value={answers.jurisdiction.operating_locations || ""}
                  onChange={(e) => updateAnswers("jurisdiction", { operating_locations: e.target.value })}
                  placeholder="e.g. Headquarters in San Francisco, R&D in London, Remote staff across EU"
                  className="bg-background text-sm"
                />
              </div>

              {/* Markets Served */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="markets-served" className="text-xs font-semibold">
                  Customer Markets &amp; User Base Locations Served
                </Label>
                <Input
                  id="markets-served"
                  value={answers.jurisdiction.markets_served || ""}
                  onChange={(e) => updateAnswers("jurisdiction", { markets_served: e.target.value })}
                  placeholder="e.g. North American enterprise clients, European B2C consumers"
                  className="bg-background text-sm"
                />
              </div>

              {/* Regulated Activities */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="regulated-activities" className="text-xs font-semibold">
                  Relevant Licenses, Registrations, or Regulated Activities (If known)
                </Label>
                <textarea
                  id="regulated-activities"
                  rows={2}
                  value={answers.jurisdiction.regulated_activities || ""}
                  onChange={(e) => updateAnswers("jurisdiction", { regulated_activities: e.target.value })}
                  placeholder="e.g. Registered broker-dealer, FDA medical compliance, FINRA member, State money transmitter"
                  className="w-full p-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-border/50 bg-muted/20 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                Operating locations help determine regulatory reach (e.g. GDPR cross-border transfer requirements, CCPA residency rules) in later policy recommendation stages. No statutory conclusions are drawn yet.
              </span>
            </div>
          </div>
        )}

        {/* ── STEP 3: BUSINESS ACTIVITIES & RISK CONTEXT ── */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">
                  Step 3 — Business Activities and Risk Context
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Select the activities your organization performs. Each activity influences which corporate policies you will need.
              </p>
            </div>

            <div className="space-y-3">
              {/* Activity Cards */}
              {[
                {
                  key: "personal_data" as const,
                  title: "Personal Data Collection & Processing",
                  desc: "Does your company collect, store, or process personal customer, visitor, or user data?",
                  why: "Triggers Data Protection, Privacy Policy, and Subject Access Request (SAR) policy requirements.",
                },
                {
                  key: "sensitive_data" as const,
                  title: "Handling of Sensitive Information",
                  desc: "Do you handle healthcare (PHI), credit cards/banking, biometric, or classified confidential data?",
                  why: "Requires Information Security, Data Classification, and Access Control policies.",
                },
                {
                  key: "cloud_services" as const,
                  title: "Cloud Infrastructure & Software Hosting",
                  desc: "Do you deploy code to public cloud providers (AWS, Azure, GCP) or operate SaaS services?",
                  why: "Triggers Cloud Security, Backup & Disaster Recovery, and Change Management policies.",
                },
                {
                  key: "ai_systems" as const,
                  title: "AI Systems & Automated Decision Making",
                  desc: "Does your organization develop, train, or integrate AI/LLM models or automated decision algorithms?",
                  why: "Influences Responsible AI, Algorithmic Transparency, and Acceptable Use policies.",
                },
                {
                  key: "payments" as const,
                  title: "Payments & Financial Transactions",
                  desc: "Do you directly accept credit cards, process payments, or handle client financial assets?",
                  why: "Triggers Payment Card Security, Anti-Money Laundering (AML), and Anti-Fraud policies.",
                },
                {
                  key: "vendors" as const,
                  title: "Vendors & External Service Providers",
                  desc: "Do third-party vendors or subcontractors connect to your internal network or data?",
                  why: "Requires Third-Party Vendor Risk Management and Supplier Due Diligence policies.",
                },
                {
                  key: "physical_facilities" as const,
                  title: "Physical Facilities, Laboratories, or Warehousing",
                  desc: "Do you maintain commercial offices, manufacturing lines, or storage facilities?",
                  why: "Requires Physical Security, Workplace Safety (OSHA), and Environmental Health policies.",
                },
                {
                  key: "licensed_activities" as const,
                  title: "Statutory / Sector-Specific Licensed Operations",
                  desc: "Are any operations governed by specialized regulatory bodies (e.g. SEC, FDA, FAA)?",
                  why: "Requires specific Statutory Compliance and Whistleblower Protection procedures.",
                },
              ].map((act) => {
                const isChecked = Boolean(answers.activities[act.key]);
                return (
                  <div
                    key={act.key}
                    onClick={() => updateAnswers("activities", { [act.key]: !isChecked })}
                    className={cn(
                      "p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5",
                      isChecked
                        ? "bg-primary/5 border-primary/40 shadow-xs"
                        : "bg-background border-border/70 hover:border-border"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-5 w-5 rounded-md border items-center justify-center shrink-0 mt-0.5 transition-colors",
                        isChecked
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-input bg-card"
                      )}
                    >
                      {isChecked && <Check className="h-3.5 w-3.5" />}
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs md:text-sm font-semibold text-foreground">
                          {act.title}
                        </h4>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {isChecked ? "Active" : "Not applicable"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{act.desc}</p>
                      <p className="text-[11px] text-primary/80 pt-0.5">
                        <span className="font-semibold">Why this matters: </span>
                        {act.why}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STEP 4: OPERATIONAL SCOPE ── */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Layers className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">
                  Step 4 — Organization, Branch, or Department Scope
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Specify whether this policy framework will apply company-wide or to a specific operational branch/department.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: "ORGANIZATION",
                  title: "Entire Organization",
                  desc: "Company-wide framework covering all subsidiaries, staff, and global operations.",
                  icon: Building2,
                },
                {
                  id: "BRANCH",
                  title: "Branch or Regional Office",
                  desc: "Specific office or regional branch that may have distinct local jurisdiction requirements.",
                  icon: Building,
                },
                {
                  id: "DEPARTMENT",
                  title: "Specific Department",
                  desc: "Targeted to an operational department (e.g. Engineering, Sales, HR, Legal).",
                  icon: Briefcase,
                },
              ].map((item) => {
                const isSelected = answers.scope.scope_type === item.id;
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    onClick={() => updateAnswers("scope", { scope_type: item.id })}
                    className={cn(
                      "p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3",
                      isSelected
                        ? "bg-primary/5 border-primary/40 shadow-xs"
                        : "bg-background border-border/70 hover:border-border"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className={cn("p-2 rounded-lg", isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className={cn("h-4 w-4 rounded-full border flex items-center justify-center", isSelected ? "border-primary bg-primary" : "border-border")}>
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs md:text-sm font-semibold text-foreground">{item.title}</h4>
                      <p className="text-xs text-muted-foreground pt-1 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Conditional Branch Fields */}
            {answers.scope.scope_type === "BRANCH" && (
              <div className="p-4 rounded-xl border border-border/60 bg-muted/10 space-y-4 animate-in fade-in-50">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                  Branch Office Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="branch-name" className="text-xs font-semibold">
                      Branch or Entity Name
                    </Label>
                    <Input
                      id="branch-name"
                      value={answers.scope.branch_name || ""}
                      onChange={(e) => updateAnswers("scope", { branch_name: e.target.value })}
                      placeholder="e.g. London Office, Asia-Pac Operations"
                      className="bg-background text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="branch-loc" className="text-xs font-semibold">
                      Branch Location
                    </Label>
                    <Input
                      id="branch-loc"
                      value={answers.scope.branch_location || ""}
                      onChange={(e) => updateAnswers("scope", { branch_location: e.target.value })}
                      placeholder="e.g. London, United Kingdom"
                      className="bg-background text-sm"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-xs font-semibold">
                      Does this branch adopt central headquarters policies?
                    </Label>
                    <div className="flex gap-4 pt-1">
                      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                        <input
                          type="radio"
                          name="central-policies"
                          checked={answers.scope.follows_central_policies === true}
                          onChange={() => updateAnswers("scope", { follows_central_policies: true })}
                        />
                        <span>Follows company-wide policies with local addenda</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                        <input
                          type="radio"
                          name="central-policies"
                          checked={answers.scope.follows_central_policies === false}
                          onChange={() => updateAnswers("scope", { follows_central_policies: false })}
                        />
                        <span>Requires dedicated, separate local policies</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Conditional Department Fields */}
            {answers.scope.scope_type === "DEPARTMENT" && (
              <div className="p-4 rounded-xl border border-border/60 bg-muted/10 space-y-4 animate-in fade-in-50">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                  Department Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="dept-name" className="text-xs font-semibold">
                      Department Name
                    </Label>
                    <Input
                      id="dept-name"
                      value={answers.scope.department_name || ""}
                      onChange={(e) => updateAnswers("scope", { department_name: e.target.value })}
                      placeholder="e.g. Software Engineering, People Operations"
                      className="bg-background text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dept-activities" className="text-xs font-semibold">
                      Principal Activities
                    </Label>
                    <Input
                      id="dept-activities"
                      value={answers.scope.department_activities || ""}
                      onChange={(e) => updateAnswers("scope", { department_activities: e.target.value })}
                      placeholder="e.g. Cloud infrastructure deployment, hiring & compensation"
                      className="bg-background text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 5: EXISTING POLICIES & COMMITMENTS ── */}
        {currentStep === 5 && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">
                  Step 5 — Existing Policies and Commitments
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Determine whether your organization is establishing policies from scratch or building upon an existing policy inventory.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Start From Scratch */}
              <div
                onClick={() => updateAnswers("existing_policies", { starting_mode: "scratch", has_existing_policies: false })}
                className={cn(
                  "p-5 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5",
                  answers.existing_policies.starting_mode === "scratch"
                    ? "bg-primary/5 border-primary/40 shadow-xs"
                    : "bg-background border-border/70 hover:border-border"
                )}
              >
                <div className={cn("flex h-5 w-5 rounded-full border items-center justify-center shrink-0 mt-0.5", answers.existing_policies.starting_mode === "scratch" ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {answers.existing_policies.starting_mode === "scratch" && <Check className="h-3 w-3" />}
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground">Start from Scratch</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Build a complete, fresh corporate governance baseline with guided templates and AI assistance.
                  </p>
                </div>
              </div>

              {/* Option 2: Build on Existing */}
              <div
                onClick={() => updateAnswers("existing_policies", { starting_mode: "build_on_existing", has_existing_policies: true })}
                className={cn(
                  "p-5 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5",
                  answers.existing_policies.starting_mode === "build_on_existing"
                    ? "bg-primary/5 border-primary/40 shadow-xs"
                    : "bg-background border-border/70 hover:border-border"
                )}
              >
                <div className={cn("flex h-5 w-5 rounded-full border items-center justify-center shrink-0 mt-0.5", answers.existing_policies.starting_mode === "build_on_existing" ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {answers.existing_policies.starting_mode === "build_on_existing" && <Check className="h-3 w-3" />}
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground">Build on Existing Policies</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Integrate active policies already uploaded to your workspace Policy Center to uncover gaps and missing frameworks.
                  </p>
                </div>
              </div>
            </div>

            {/* If Building on Existing: Show Available Workspace Policies */}
            {answers.existing_policies.starting_mode === "build_on_existing" && (
              <div className="p-4 rounded-xl border border-border/60 bg-muted/10 space-y-3 animate-in fade-in-50">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Select Relevant Workspace Policies
                  </h4>
                  <span className="text-[11px] text-muted-foreground">
                    {availablePolicies.length} policy documents found
                  </span>
                </div>

                {availablePolicies.length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed border-border/60 text-center text-xs text-muted-foreground space-y-1.5">
                    <p>No policy files uploaded to this workspace yet.</p>
                    <p className="text-[11px]">
                      You can continue with assessment and link policies later from the Policy Center.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {availablePolicies.map((pol) => {
                      const isSelected = answers.existing_policies.selected_policy_ids.includes(pol.id);
                      return (
                        <div
                          key={pol.id}
                          onClick={() => {
                            const updated = isSelected
                              ? answers.existing_policies.selected_policy_ids.filter((id) => id !== pol.id)
                              : [...answers.existing_policies.selected_policy_ids, pol.id];
                            updateAnswers("existing_policies", { selected_policy_ids: updated });
                          }}
                          className={cn(
                            "p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors",
                            isSelected
                              ? "bg-primary/10 border-primary text-foreground"
                              : "bg-background border-border/70 hover:bg-muted/40"
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="font-medium truncate">{pol.title}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {isSelected ? "Selected" : "Select"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Certifications and Compliance Standards */}
            <div className="space-y-2.5">
              <Label className="text-xs font-semibold">
                Recognized Certifications or Standards Followed
              </Label>
              <div className="flex flex-wrap gap-2">
                {STANDARD_CERTIFICATIONS.map((cert) => {
                  const isChecked = answers.existing_policies.certifications.includes(cert);
                  return (
                    <button
                      type="button"
                      key={cert}
                      onClick={() => {
                        const updated = isChecked
                          ? answers.existing_policies.certifications.filter((c) => c !== cert)
                          : [...answers.existing_policies.certifications, cert];
                        updateAnswers("existing_policies", { certifications: updated });
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer",
                        isChecked
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60"
                      )}
                    >
                      {isChecked && <Check className="h-3 w-3 inline mr-1" />}
                      {cert}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes / Commitments */}
            <div className="space-y-1.5">
              <Label htmlFor="commitments" className="text-xs font-semibold">
                Contractual or Governance Commitments (Optional)
              </Label>
              <textarea
                id="commitments"
                rows={2}
                value={answers.existing_policies.commitments || ""}
                onChange={(e) => updateAnswers("existing_policies", { commitments: e.target.value })}
                placeholder="e.g. Enterprise SLA requirement to maintain ISO 27001, customer audit clauses..."
                className="w-full p-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {/* ── STEP 6: REVIEW & COMPLETE ── */}
        {currentStep === 6 && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="text-lg font-bold text-foreground">Step 6 — Review and Complete</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Review your collected organization profile before marking the assessment complete.
              </p>
            </div>

            <div className="space-y-4">
              {/* Group 1: Profile */}
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      1. Organization Profile
                    </h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGoToStep(1)}
                    className="h-6 px-2 text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Edit
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Name</span>
                    <span className="font-semibold text-foreground">{answers.profile.organization_name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Type</span>
                    <span className="font-semibold text-foreground">{answers.profile.org_type || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Industry</span>
                    <span className="font-semibold text-foreground">{answers.profile.industry || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Workforce</span>
                    <span className="font-semibold text-foreground">{answers.profile.employee_count || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Group 2: Jurisdictions */}
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      2. Jurisdictions &amp; Locations
                    </h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGoToStep(2)}
                    className="h-6 px-2 text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Edit
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Primary Country</span>
                    <span className="font-semibold text-foreground">{answers.jurisdiction.primary_country || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">State / Region</span>
                    <span className="font-semibold text-foreground">{answers.jurisdiction.state_province || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Other Operating Regions</span>
                    <span className="font-semibold text-foreground">
                      {answers.jurisdiction.other_countries.length > 0 ? answers.jurisdiction.other_countries.join(", ") : "None specified"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Group 3: Business Activities */}
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      3. Business Activities &amp; Risks
                    </h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGoToStep(3)}
                    className="h-6 px-2 text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Edit
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(answers.activities)
                    .filter(([k, v]) => v === true)
                    .map(([k]) => (
                      <Badge key={k} variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[11px] capitalize">
                        {k.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  {Object.values(answers.activities).filter((v) => v === true).length === 0 && (
                    <span className="text-muted-foreground text-xs">No sensitive activities checked.</span>
                  )}
                </div>
              </div>

              {/* Group 4: Operational Scope */}
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      4. Operational Scope
                    </h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGoToStep(4)}
                    className="h-6 px-2 text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Edit
                  </Button>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Scope: </span>
                  <span className="font-semibold text-foreground capitalize">{answers.scope.scope_type.toLowerCase()}</span>
                  {answers.scope.scope_type === "BRANCH" && (
                    <span className="text-muted-foreground"> ({answers.scope.branch_name || "Branch"})</span>
                  )}
                  {answers.scope.scope_type === "DEPARTMENT" && (
                    <span className="text-muted-foreground"> ({answers.scope.department_name || "Department"})</span>
                  )}
                </div>
              </div>

              {/* Group 5: Existing Policies */}
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      5. Existing Policies &amp; Standards
                    </h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGoToStep(5)}
                    className="h-6 px-2 text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Edit
                  </Button>
                </div>
                <div className="text-xs space-y-1.5">
                  <div>
                    <span className="text-muted-foreground">Starting Mode: </span>
                    <span className="font-semibold text-foreground">
                      {answers.existing_policies.starting_mode === "scratch" ? "Start from Scratch" : "Build on Existing Policies"}
                    </span>
                  </div>
                  {answers.existing_policies.certifications.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-muted-foreground">Certifications:</span>
                      {answers.existing_policies.certifications.map((c) => (
                        <Badge key={c} variant="outline" className="text-[10px]">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Explanation Note */}
            <div className="p-4 rounded-xl border border-border/50 bg-primary/5 text-xs text-muted-foreground leading-relaxed space-y-1">
              <span className="font-semibold text-foreground block">
                Stage 2 Completion Notice:
              </span>
              <span>
                Completing this step records your organization baseline in your workspace database. This data will feed into subsequent stages for regulatory mapping and policy discovery. No compliance claims are certified at this stage.
              </span>
            </div>
          </div>
        )}

        {/* ─── 4. CARD FOOTER NAVIGATION ─────────────────────────────────── */}
        <div className="flex items-center justify-between pt-6 border-t border-border/60 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="text-xs cursor-pointer border-border"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <span className="text-xs font-mono text-muted-foreground">
            Step {currentStep} of 6
          </span>

          {currentStep < 6 ? (
            <Button
              size="sm"
              onClick={handleNext}
              className="text-xs font-semibold gap-1.5 cursor-pointer shadow-xs"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleCompleteAssessment}
              disabled={isSubmittingCompletion}
              className="text-xs font-semibold gap-1.5 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              {isSubmittingCompletion ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />
                  Saving Completion...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Complete Assessment
                </>
              )}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
