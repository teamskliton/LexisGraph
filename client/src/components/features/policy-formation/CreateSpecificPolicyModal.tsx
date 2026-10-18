"use client";

import React, { useState, useId } from "react";
import {
  ShieldCheck,
  Lock,
  Sparkles,
  Users,
  Building2,
  FileEdit,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  Scale,
  Calendar,
  UserCheck,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  policyFormationService,
  PolicyDraft,
  PolicyDirectDraftCreateRequest,
} from "@/services/api/policy-formation";

interface SuggestedCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeText: string;
  presets: Array<{
    title: string;
    purpose: string;
    ownerRole: string;
    linkedRegulations: string[];
  }>;
}

const SUGGESTED_CATEGORIES: SuggestedCategory[] = [
  {
    id: "data-protection",
    name: "Data Protection & Privacy",
    description: "Statutory governance for personal data processing, data principal rights, and privacy obligations under DPDP and GDPR.",
    icon: ShieldCheck,
    badgeText: "DPDP / GDPR Grounded",
    presets: [
      {
        title: "Personal Data Protection & Privacy Policy",
        purpose: "Establish mandatory organizational commitments, security safeguards, and data processing procedures aligned with the DPDP Act 2023 and GDPR.",
        ownerRole: "Data Protection Officer",
        linkedRegulations: ["DPDP Act", "Information Technology Act", "GDPR"],
      },
      {
        title: "Data Subject Rights & Grievance Redressal Policy",
        purpose: "Provide clear operational procedures for data principals to exercise statutory rights of access, correction, erasure, and grievance redressal.",
        ownerRole: "Grievance Officer",
        linkedRegulations: ["DPDP Act", "GDPR"],
      },
      {
        title: "Data Retention & Secure Disposal Policy",
        purpose: "Define lawful retention schedules, archival criteria, and cryptographic erasure procedures for all corporate data assets.",
        ownerRole: "Compliance Officer",
        linkedRegulations: ["DPDP Act", "Information Technology Act"],
      },
    ],
  },
  {
    id: "infosec",
    name: "Information Security & Cyber",
    description: "Access controls, cryptographic safeguards, asset management, and CERT-In cyber incident reporting mandates.",
    icon: Lock,
    badgeText: "CERT-In & ISO 27001",
    presets: [
      {
        title: "Access Control & Authentication Policy",
        purpose: "Enforce multi-factor authentication, principle of least privilege, and privileged account access governance across all digital systems.",
        ownerRole: "Chief Information Security Officer (CISO)",
        linkedRegulations: ["Information Technology Act"],
      },
      {
        title: "Information Security Management Policy",
        purpose: "Establish organization-wide ISMS directives, data classification tiers, and baseline technological safeguards.",
        ownerRole: "Chief Information Security Officer (CISO)",
        linkedRegulations: ["Information Technology Act"],
      },
      {
        title: "Cyber Incident Notification & Response Policy",
        purpose: "Define incident categorization, internal escalation protocols, and mandatory 6-hour CERT-In incident notification procedures.",
        ownerRole: "CISO / Incident Response Lead",
        linkedRegulations: ["Information Technology Act"],
      },
    ],
  },
  {
    id: "ai-use",
    name: "AI & Acceptable Use",
    description: "Responsible usage guidelines for Generative AI systems, workstation security, and company network assets.",
    icon: Sparkles,
    badgeText: "Responsible AI",
    presets: [
      {
        title: "Responsible AI & GenAI Acceptable Use Policy",
        purpose: "Regulate the ethical use of Generative AI tools and LLMs, prohibiting unauthorized disclosure of customer data, proprietary IP, or source code.",
        ownerRole: "Chief Technology Officer / CISO",
        linkedRegulations: ["Information Technology Act"],
      },
      {
        title: "Acceptable Use & Workstation Security Policy",
        purpose: "Define permissible usage parameters for corporate hardware, electronic communications, remote workstation security, and software installation.",
        ownerRole: "IT Operations Director",
        linkedRegulations: ["Information Technology Act"],
      },
    ],
  },
  {
    id: "hr-ethics",
    name: "HR & Workplace Governance",
    description: "Workplace conduct, anti-harassment POSH mandates, ethical standards, and whistleblower protection.",
    icon: Users,
    badgeText: "POSH & Companies Act",
    presets: [
      {
        title: "Code of Business Conduct & Ethics",
        purpose: "Establish unambiguous standards of professional integrity, fair dealing, anti-corruption, and conflict-of-interest disclosures for all staff.",
        ownerRole: "Head of People Operations",
        linkedRegulations: ["Companies Act"],
      },
      {
        title: "Prevention of Sexual Harassment (POSH) Policy",
        purpose: "Mandate zero tolerance for workplace harassment and constitute an Internal Complaints Committee (ICC) pursuant to the POSH Act 2013.",
        ownerRole: "Presiding Officer / HR Director",
        linkedRegulations: ["POSH Act"],
      },
      {
        title: "Whistleblower Protection & Vigil Mechanism Policy",
        purpose: "Provide a confidential, non-retaliatory reporting mechanism for financial improprieties and statutory violations under Section 177 of the Companies Act.",
        ownerRole: "Audit Committee Chair / Legal Counsel",
        linkedRegulations: ["Companies Act"],
      },
    ],
  },
  {
    id: "vendor-risk",
    name: "Vendor & Third-Party Risk",
    description: "Third-party vendor due diligence, cloud supplier compliance covenants, and outsourcing risk oversight.",
    icon: Building2,
    badgeText: "Supply Chain Governance",
    presets: [
      {
        title: "Third-Party & Vendor Risk Management Policy",
        purpose: "Define mandatory risk screening, periodic security assessments, and contractual compliance covenants for all external suppliers and SaaS vendors.",
        ownerRole: "Head of Procurement & Vendor Risk",
        linkedRegulations: ["Companies Act", "Information Technology Act"],
      },
      {
        title: "Cloud Service Provider Compliance Policy",
        purpose: "Establish mandatory security controls, data residency constraints, and operational SLA verifications for cloud infrastructure providers.",
        ownerRole: "Cloud Security Architect",
        linkedRegulations: ["Information Technology Act"],
      },
    ],
  },
  {
    id: "custom",
    name: "Custom Governance Policy",
    description: "Create a bespoke organizational policy with custom titles, objectives, and tailored operational scope.",
    icon: FileEdit,
    badgeText: "Bespoke Architecture",
    presets: [],
  },
];

interface CreateSpecificPolicyModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  onSuccess: (draft: PolicyDraft) => void;
}

export function CreateSpecificPolicyModal({
  isOpen,
  onOpenChange,
  organizationId,
  organizationName,
  onSuccess,
}: CreateSpecificPolicyModalProps) {
  // Setup State
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("data-protection");
  const [selectedPresetTitle, setSelectedPresetTitle] = useState<string>(
    SUGGESTED_CATEGORIES[0].presets[0].title
  );
  const [customTitle, setCustomTitle] = useState<string>("");
  const [purpose, setPurpose] = useState<string>(SUGGESTED_CATEGORIES[0].presets[0].purpose);
  const [scopeType, setScopeType] = useState<"ORGANIZATION" | "BRANCH" | "DEPARTMENT">("ORGANIZATION");
  const [branchName, setBranchName] = useState<string>("");
  const [departmentName, setDepartmentName] = useState<string>("");
  const [ownerRole, setOwnerRole] = useState<string>(SUGGESTED_CATEGORIES[0].presets[0].ownerRole);
  const [reviewCadence, setReviewCadence] = useState<string>("Annual");
  const [primaryJurisdiction, setPrimaryJurisdiction] = useState<string>("India");
  const [specificContext, setSpecificContext] = useState<string>("");
  const [linkedRegulations, setLinkedRegulations] = useState<string[]>(
    SUGGESTED_CATEGORIES[0].presets[0].linkedRegulations
  );
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Submitting state
  const [isDrafting, setIsDrafting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Accessible Form Control IDs
  const searchInputId = useId();
  const customTitleInputId = useId();
  const branchInputId = useId();
  const departmentInputId = useId();
  const purposeTextareaId = useId();
  const ownerRoleInputId = useId();
  const cadenceSelectId = useId();
  const jurisdictionInputId = useId();
  const contextTextareaId = useId();

  // Active Category & Presets
  const activeCategory = SUGGESTED_CATEGORIES.find((c) => c.id === selectedCategoryId) || SUGGESTED_CATEGORIES[0];

  const handleSelectCategory = (category: SuggestedCategory) => {
    setSelectedCategoryId(category.id);
    setValidationError(null);
    if (category.presets.length > 0) {
      const first = category.presets[0];
      setSelectedPresetTitle(first.title);
      setCustomTitle("");
      setPurpose(first.purpose);
      setOwnerRole(first.ownerRole);
      setLinkedRegulations(first.linkedRegulations);
    } else {
      setSelectedPresetTitle("__custom__");
      setCustomTitle("");
      setPurpose("");
      setOwnerRole("Compliance Officer");
      setLinkedRegulations([]);
    }
  };

  const handleSelectPreset = (preset: {
    title: string;
    purpose: string;
    ownerRole: string;
    linkedRegulations: string[];
  }) => {
    setSelectedPresetTitle(preset.title);
    setCustomTitle("");
    setPurpose(preset.purpose);
    setOwnerRole(preset.ownerRole);
    setLinkedRegulations(preset.linkedRegulations);
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDrafting) return;
    setValidationError(null);

    // Resolve title
    let titleToUse = "";
    if (selectedCategoryId === "custom" || selectedPresetTitle === "__custom__") {
      titleToUse = customTitle.trim();
    } else {
      titleToUse = selectedPresetTitle.trim();
    }

    // Required Field Validation
    if (!titleToUse || titleToUse.length < 3) {
      setValidationError("Please enter or select a valid policy title (at least 3 characters).");
      return;
    }

    if (!purpose.trim() || purpose.trim().length < 5) {
      setValidationError("Please provide a brief policy purpose or objective (at least 5 characters).");
      return;
    }

    if (scopeType === "BRANCH" && (!branchName || branchName.trim().length === 0)) {
      setValidationError("Please specify the branch or regional office name for branch-scoped policy.");
      return;
    }

    if (scopeType === "DEPARTMENT" && (!departmentName || departmentName.trim().length === 0)) {
      setValidationError("Please specify the department name for department-scoped policy.");
      return;
    }

    setIsDrafting(true);

    const payload: PolicyDirectDraftCreateRequest = {
      title: titleToUse,
      category: activeCategory.name,
      purpose: purpose.trim(),
      scope_type: scopeType,
      branch_name: scopeType === "BRANCH" ? branchName.trim() : null,
      department_name: scopeType === "DEPARTMENT" ? departmentName.trim() : null,
      primary_jurisdiction: primaryJurisdiction.trim() || "India",
      owner_role: ownerRole.trim() || "Compliance Officer",
      review_cadence: reviewCadence,
      specific_context: specificContext.trim() || null,
      linked_regulations: linkedRegulations,
    };

    try {
      const draft = await policyFormationService.createDirectDraft(payload);
      toast.success("Policy draft initialized successfully", {
        description: `"${draft.title}" is ready for editing and review.`,
      });
      onOpenChange(false);
      onSuccess(draft);
    } catch (err: any) {
      let msg = "Failed to create policy draft. Please try again.";
      if (err.response?.data?.detail) {
        msg = err.response.data.detail;
      } else if (err.response?.status === 400) {
        msg = "Validation failed: please review your policy details.";
      } else if (err.response?.status === 401 || err.response?.status === 403) {
        msg = "You do not have permission to create policies in this workspace.";
      } else if (err.code === "ECONNABORTED" || err.message?.toLowerCase().includes("timeout")) {
        msg = "The drafting service took too long to respond. Please check your connection and retry.";
      } else if (err.message === "Network Error") {
        msg = "Unable to reach the LexisGraph server. Please check that the backend service is running and retry.";
      } else if (err.message) {
        msg = err.message;
      }
      setValidationError(msg);
      toast.error("Drafting Failed", { description: msg });
    } finally {
      setIsDrafting(false);
    }
  };

  // Filter presets based on optional search
  const filteredPresets = activeCategory.presets.filter((p) =>
    searchQuery
      ? p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.purpose.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  return (
    <Dialog open={isOpen} onOpenChange={isDrafting ? undefined : onOpenChange}>
      <DialogContent
        className={cn(
          "w-[95vw] max-w-[95vw] sm:max-w-[960px] lg:max-w-[1000px] max-h-[90vh] flex flex-col p-0 gap-0 border-border/70 bg-card shadow-2xl overflow-hidden"
        )}
      >
        {/* Compact, Clean Header */}
        <DialogHeader className="px-5 py-4 sm:px-6 sm:py-4 border-b border-border/60 bg-muted/10 shrink-0 pr-12">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs shrink-0">
                <FileEdit className="h-4.5 w-4.5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                  Create a Specific Policy
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Direct policy drafting with grounded statutory citations for{" "}
                  <span className="font-semibold text-foreground">{organizationName}</span>.
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="hidden sm:inline-flex bg-primary/10 text-primary border-primary/25 font-semibold text-xs py-0.5 px-2.5"
            >
              Direct Drafting
            </Badge>
          </div>
        </DialogHeader>

        {/* Form and Single Scrollable Content Container */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0 px-5 py-5 sm:px-6 sm:py-6 space-y-6">
            {validationError && (
              <div className="p-3.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5 animate-in fade-in-50 duration-200">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            {/* ─── SECTION 1: POLICY DETAILS ─────────────────────────────────── */}
            <div className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4 sm:p-5">
              <div className="border-b border-border/50 pb-2.5">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                    1
                  </span>
                  <span>Policy Details &amp; Governance Domain</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select a recognized policy category or specify a custom governance charter.
                </p>
              </div>

              {/* Category Grid: 3 balanced cols on desktop, 2 on medium, 1 on narrow */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Governance Category
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {SUGGESTED_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = selectedCategoryId === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelectCategory(cat)}
                        className={cn(
                          "flex flex-col text-left p-4 rounded-xl border transition-all cursor-pointer relative",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/40"
                            : "border-border/60 bg-card hover:bg-muted/20 hover:border-border"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2 w-full">
                          <Icon className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted border border-border/60 text-muted-foreground">
                            {cat.badgeText}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-foreground leading-snug">{cat.name}</span>
                        <span className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                          {cat.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Policy Selection or Custom Title */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Policy Selection
                  </label>
                  {activeCategory.presets.length > 0 && (
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                      <input
                        id={searchInputId}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter suggested policies..."
                        className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-64"
                      />
                    </div>
                  )}
                </div>

                {activeCategory.presets.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-foreground">
                      Suggested Policies in {activeCategory.name}:
                    </span>
                    <div className="grid grid-cols-1 gap-2.5">
                      {filteredPresets.map((preset) => {
                        const isPresetSelected = selectedPresetTitle === preset.title;
                        return (
                          <div
                            key={preset.title}
                            onClick={() => handleSelectPreset(preset)}
                            className={cn(
                              "p-3.5 rounded-lg border text-xs cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5",
                              isPresetSelected
                                ? "border-primary bg-primary/10 text-foreground font-medium shadow-xs"
                                : "border-border/60 bg-card hover:bg-muted/30 text-muted-foreground"
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <CheckCircle2
                                className={cn(
                                  "h-4 w-4 shrink-0",
                                  isPresetSelected ? "text-primary" : "text-muted-foreground/30"
                                )}
                              />
                              <span className={cn(isPresetSelected && "text-foreground font-semibold", "text-sm")}>
                                {preset.title}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0 pl-6 sm:pl-0">
                              Owner: <span className="text-foreground/80 font-medium">{preset.ownerRole}</span>
                            </span>
                          </div>
                        );
                      })}
                      <div
                        onClick={() => {
                          setSelectedPresetTitle("__custom__");
                          setValidationError(null);
                        }}
                        className={cn(
                          "p-3.5 rounded-lg border text-xs cursor-pointer transition-colors flex items-center gap-2.5",
                          selectedPresetTitle === "__custom__"
                            ? "border-primary bg-primary/10 text-foreground font-semibold"
                            : "border-dashed border-border/80 bg-card hover:bg-muted/20 text-muted-foreground"
                        )}
                      >
                        <FileEdit className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm">Specify a custom policy title instead...</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Custom Title Input */}
                {(selectedCategoryId === "custom" || selectedPresetTitle === "__custom__") && (
                  <div className="space-y-1.5 pt-1">
                    <label htmlFor={customTitleInputId} className="text-xs font-semibold text-foreground">
                      Custom Policy Title <span className="text-destructive">*</span>
                    </label>
                    <input
                      id={customTitleInputId}
                      type="text"
                      value={customTitle}
                      onChange={(e) => {
                        setCustomTitle(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="e.g., Clean Desk and Workstation Security Policy"
                      className="w-full h-10 px-3.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                      required
                    />
                  </div>
                )}

                {/* Policy Purpose */}
                <div className="space-y-1.5 pt-1">
                  <label htmlFor={purposeTextareaId} className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>
                      Policy Purpose &amp; Strategic Objective <span className="text-destructive">*</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground font-normal">Grounded into Section 2.0</span>
                  </label>
                  <textarea
                    id={purposeTextareaId}
                    rows={3}
                    value={purpose}
                    onChange={(e) => {
                      setPurpose(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder="State the core objective, compliance imperative, and risk mitigation rationale..."
                    className="w-full min-h-[90px] p-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed shadow-xs"
                    required
                  />
                </div>
              </div>
            </div>

            {/* ─── SECTION 2: SCOPE AND OWNERSHIP ────────────────────────────── */}
            <div className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4 sm:p-5">
              <div className="border-b border-border/50 pb-2.5">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                    2
                  </span>
                  <span>Scope and Ownership</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define organizational applicability boundaries and designated administrative ownership.
                </p>
              </div>

              {/* Scope Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Operational Applicability Scope
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: "ORGANIZATION",
                      label: "Entire Organization",
                      desc: "Applies enterprise-wide across all offices and subsidiaries.",
                    },
                    {
                      id: "BRANCH",
                      label: "Branch / Regional Office",
                      desc: "Restricted to a specific geographical branch or center.",
                    },
                    {
                      id: "DEPARTMENT",
                      label: "Specific Department",
                      desc: "Applies exclusively to a functional business unit or department.",
                    },
                  ].map((scopeOption) => {
                    const isSelected = scopeType === scopeOption.id;
                    return (
                      <button
                        key={scopeOption.id}
                        type="button"
                        onClick={() => {
                          setScopeType(scopeOption.id as any);
                          setValidationError(null);
                        }}
                        className={cn(
                          "p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                            : "border-border/60 bg-card hover:bg-muted/20"
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-semibold text-foreground">{scopeOption.label}</span>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{scopeOption.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conditional Branch Scope Input */}
              {scopeType === "BRANCH" && (
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-1.5 animate-in fade-in-50 duration-150">
                  <label htmlFor={branchInputId} className="text-xs font-semibold text-foreground">
                    Branch / Regional Office Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    id={branchInputId}
                    type="text"
                    value={branchName}
                    onChange={(e) => {
                      setBranchName(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder="e.g., Bangalore Engineering & Development Center"
                    className="w-full h-10 px-3.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                    required
                  />
                </div>
              )}

              {/* Conditional Department Scope Input */}
              {scopeType === "DEPARTMENT" && (
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-1.5 animate-in fade-in-50 duration-150">
                  <label htmlFor={departmentInputId} className="text-xs font-semibold text-foreground">
                    Department / Business Unit Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    id={departmentInputId}
                    type="text"
                    value={departmentName}
                    onChange={(e) => {
                      setDepartmentName(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder="e.g., Human Resources & People Operations"
                    className="w-full h-10 px-3.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                    required
                  />
                </div>
              )}

              {/* Designated Owner Role */}
              <div className="space-y-1.5 pt-1">
                <label htmlFor={ownerRoleInputId} className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <span>Designated Policy Owner Role</span>
                </label>
                <input
                  id={ownerRoleInputId}
                  type="text"
                  value={ownerRole}
                  onChange={(e) => setOwnerRole(e.target.value)}
                  placeholder="e.g., Compliance Officer, Chief Information Security Officer, Head of HR"
                  className="w-full h-10 px-3.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                />
              </div>
            </div>

            {/* ─── SECTION 3: REVIEW AND LEGAL CONTEXT ───────────────────────── */}
            <div className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4 sm:p-5">
              <div className="border-b border-border/50 pb-2.5">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                    3
                  </span>
                  <span>Review and Legal Context</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set audit frequencies, statutory jurisdiction, and organization-specific controls.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor={cadenceSelectId} className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Review Frequency</span>
                  </label>
                  <select
                    id={cadenceSelectId}
                    value={reviewCadence}
                    onChange={(e) => setReviewCadence(e.target.value)}
                    className="w-full h-10 px-3.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  >
                    <option value="Annual">Annual Review (365 days)</option>
                    <option value="Semi-Annual">Semi-Annual Review (182 days)</option>
                    <option value="Biennial">Biennial Review (2 years)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={jurisdictionInputId} className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Scale className="h-4 w-4 text-muted-foreground" />
                    <span>Primary Jurisdiction</span>
                  </label>
                  <input
                    id={jurisdictionInputId}
                    type="text"
                    value={primaryJurisdiction}
                    onChange={(e) => setPrimaryJurisdiction(e.target.value)}
                    placeholder="e.g., India, United States, European Union"
                    className="w-full h-10 px-3.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  />
                </div>
              </div>

              {/* Additional Context */}
              <div className="space-y-1.5 pt-1">
                <label htmlFor={contextTextareaId} className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Additional Operational Context or Controls (Optional)</span>
                  <span className="text-[11px] text-muted-foreground font-normal">Grounded into Sections 3.0 &amp; 7.0</span>
                </label>
                <textarea
                  id={contextTextareaId}
                  rows={3}
                  value={specificContext}
                  onChange={(e) => setSpecificContext(e.target.value)}
                  placeholder="e.g., Mandatory two-factor authentication for remote personnel; all customer data stored strictly within Indian cloud data centers..."
                  className="w-full min-h-[90px] p-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed shadow-xs"
                />
              </div>

              {/* Notice Banner */}
              <div className="p-3.5 rounded-lg border border-border/50 bg-card flex items-start gap-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>
                  Drafting will generate a structured 12-section legal policy using verified statutory citations. You can edit, customize, regenerate sections, and submit for executive review in the next step.
                </span>
              </div>
            </div>
          </div>

          {/* Fixed Footer */}
          <DialogFooter className="px-5 py-4 sm:px-6 sm:py-4 border-t border-border/60 bg-muted/20 shrink-0 flex flex-row items-center justify-between sm:justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isDrafting}
              onClick={() => onOpenChange(false)}
              className="text-xs cursor-pointer border-border"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isDrafting}
              className="text-xs font-semibold cursor-pointer gap-2 bg-primary text-primary-foreground shadow-sm"
            >
              {isDrafting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Drafting Grounded Policy...</span>
                </>
              ) : (
                <>
                  <span>Generate Policy Draft</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
