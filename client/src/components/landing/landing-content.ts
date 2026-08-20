// ==========================================================================
// LexisGraph Landing Page — Static Content Configuration
// All copy, nav links, capabilities, roles, use cases, and security items
// ==========================================================================

// ---- Navigation ----------------------------------------------------------

export const NAV_LINKS = [
  { label: "Product",        href: "#product" },
  { label: "How It Works",  href: "#how-it-works" },
  { label: "Capabilities",  href: "#capabilities" },
  { label: "Security",      href: "#security" },
  { label: "About",         href: "#about" },
] as const;

// ---- Hero ----------------------------------------------------------------

export const HERO = {
  headline: "Turn Regulatory Complexity Into Compliance Clarity.",
  subheadline:
    "LexisGraph connects regulations, requirements, policies, evidence, findings, and remediation — so your compliance team works from a single source of truth instead of scattered documents.",
  ctaPrimary:   { label: "Get Started",      href: "/register" },
  ctaSecondary: { label: "See How It Works", href: "#how-it-works" },
} as const;

// ---- Value Strip ---------------------------------------------------------

export const VALUE_STRIP = [
  { label: "Regulations",   description: "Import and version control regulatory frameworks" },
  { label: "Policies",      description: "Map internal policies to regulatory requirements" },
  { label: "Evidence",      description: "Attach and track supporting evidence artifacts" },
  { label: "Findings",      description: "Identify and classify compliance gaps systematically" },
  { label: "Remediation",   description: "Assign and resolve findings with full audit trails" },
] as const;

// ---- Problem Cards -------------------------------------------------------

export const PROBLEMS = [
  {
    title: "Scattered Information",
    description:
      "Compliance data lives across emails, spreadsheets, and document repositories. Teams waste hours reconciling fragmented sources instead of doing compliance work.",
    icon: "FileX2",
  },
  {
    title: "Limited Traceability",
    description:
      "When auditors ask \"How does Policy X satisfy Regulation Y?\", the answer requires manual detective work across multiple systems and file versions.",
    icon: "GitBranchPlus",
  },
  {
    title: "Manual Gap Identification",
    description:
      "Identifying compliance gaps means comparing regulatory requirements against policies by hand — a process that is slow, error-prone, and hard to repeat consistently.",
    icon: "SearchX",
  },
  {
    title: "Fragmented Follow-Through",
    description:
      "Findings get recorded but remediation falls through the cracks. Without a structured workflow, the same gaps resurface in the next audit cycle.",
    icon: "CircleX",
  },
] as const;

// ---- Solution Flow -------------------------------------------------------

export const SOLUTION_STAGES = [
  { label: "Regulations",    description: "Import regulatory frameworks and requirements", color: "primary" },
  { label: "Requirements",   description: "Break regulations into trackable requirements",  color: "primary" },
  { label: "Policies",       description: "Map internal policies to requirements",           color: "accent" },
  { label: "Evidence",       description: "Attach supporting evidence to each policy",       color: "accent" },
  { label: "Analysis",       description: "Analyze coverage, gaps, and risk posture",        color: "warning" },
  { label: "Findings",       description: "Surface and classify compliance findings",        color: "warning" },
  { label: "Remediation",    description: "Assign and track remediation tasks",             color: "danger" },
  { label: "Resolution",     description: "Close the loop with verified evidence",           color: "info" },
] as const;

// ---- How It Works --------------------------------------------------------

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Connect",
    description:
      "Import regulatory frameworks, internal policies, and supporting documents. LexisGraph maps relationships automatically.",
  },
  {
    step: "02",
    title: "Analyze",
    description:
      "Run compliance analyses to measure coverage. Understand exactly where requirements are met, partially addressed, or missing.",
  },
  {
    step: "03",
    title: "Identify",
    description:
      "Surface findings with full traceability. Each finding links back to the specific requirement and policy gap that triggered it.",
  },
  {
    step: "04",
    title: "Resolve",
    description:
      "Assign remediations, track progress, and collect resolution evidence — all within a single auditable workflow.",
  },
] as const;

// ---- Capabilities --------------------------------------------------------

export const CAPABILITIES = [
  {
    title: "Compliance Analysis",
    description:
      "Systematic analysis of how well policies and evidence satisfy regulatory requirements. Track coverage at a glance.",
    icon: "BarChart3",
    color: "primary",
  },
  {
    title: "Evidence-Based Findings",
    description:
      "Every finding is grounded in evidence. Attach documents, screenshots, or logs to support or dispute each gap.",
    icon: "FileSearch",
    color: "accent",
  },
  {
    title: "Knowledge Graph",
    description:
      "Visualize the full compliance graph — from regulation to resolution — as an interactive, queryable network.",
    icon: "Network",
    color: "info",
  },
  {
    title: "Review Workflow",
    description:
      "Structured review cycles with role-based assignments. Analysts, reviewers, and administrators collaborate in context.",
    icon: "ClipboardCheck",
    color: "warning",
  },
  {
    title: "Remediation Tracking",
    description:
      "Move findings from identified to resolved with clear ownership, due dates, and audit-ready evidence chains.",
    icon: "ShieldCheck",
    color: "success",
  },
  {
    title: "AI-Assisted Analysis",
    description:
      "AI features help surface patterns and suggest policy-requirement mappings, accelerating your compliance workflow.",
    icon: "Sparkles",
    color: "danger",
  },
] as const;

// ---- Finding Lifecycle ---------------------------------------------------

export const FINDING_STAGES = [
  { label: "Identified",  description: "Gap or issue found during compliance analysis",               color: "danger" },
  { label: "Review",      description: "Assigned reviewer examines the finding for validity",         color: "warning" },
  { label: "Remediation", description: "Corrective action assigned and tracked to completion",        color: "primary" },
  { label: "Resolution",  description: "Resolution verified with evidence and finding closed",        color: "accent" },
] as const;

// ---- Roles ---------------------------------------------------------------

export const ROLES = [
  {
    title: "Administrator",
    description:
      "Manages organization settings, users, teams, and document access. Full platform visibility.",
    permissions: ["User management", "Organization settings", "Full data access"],
    icon: "Crown",
  },
  {
    title: "Compliance Analyst",
    description:
      "Runs analyses, creates findings, and manages the compliance workflow from regulation to remediation.",
    permissions: ["Create analyses", "Manage findings", "Upload evidence"],
    icon: "ClipboardList",
  },
  {
    title: "Reviewer",
    description:
      "Reviews and approves findings and remediation plans. Can comment and request revisions.",
    permissions: ["Review findings", "Approve remediations", "Comment"],
    icon: "UserCheck",
  },
  {
    title: "Viewer",
    description:
      "Read-only access to dashboards, analyses, and reports. Ideal for stakeholders who need visibility.",
    permissions: ["View dashboards", "Read analyses", "Export reports"],
    icon: "Eye",
  },
] as const;

// ---- Security ------------------------------------------------------------

export const SECURITY_ITEMS = [
  {
    title: "Organization Isolation",
    description: "All data is scoped to your organization. No cross-tenant data access.",
    icon: "Building2",
  },
  {
    title: "Role-Based Access",
    description: "Granular permissions ensure users only access what their role permits.",
    icon: "KeyRound",
  },
  {
    title: "Controlled Document Access",
    description: "Documents are accessible only to authorized members within your organization.",
    icon: "FileLock2",
  },
  {
    title: "Auditability",
    description: "Every action is logged with timestamps and user attribution for full audit trails.",
    icon: "ScrollText",
  },
  {
    title: "Traceable Findings",
    description: "Each finding links to its source requirement, evidence, and resolution history.",
    icon: "GitMerge",
  },
  {
    title: "Secure Infrastructure",
    description: "Built on modern, security-first architecture with encrypted data at rest and in transit.",
    icon: "ShieldHalf",
  },
] as const;

// ---- Use Cases -----------------------------------------------------------

export const USE_CASES = [
  {
    title: "Legal Teams",
    description:
      "Map regulatory obligations to internal policies. Keep your legal inventory up to date as regulations evolve.",
    icon: "Scale",
  },
  {
    title: "Compliance Teams",
    description:
      "Run structured compliance analyses, track gaps, manage findings, and produce evidence-backed reports for auditors.",
    icon: "Shield",
  },
  {
    title: "Legal Firms",
    description:
      "Advise clients with a systematic, evidence-grounded view of their regulatory posture across multiple frameworks.",
    icon: "Briefcase",
  },
  {
    title: "Startups",
    description:
      "Build compliance foundations early. Understand what applies to you and track your journey to certification.",
    icon: "Rocket",
  },
] as const;

// ---- Differentiation -------------------------------------------------------

export const DIFFERENTIATION = {
  traditional: [
    "Requirements tracked in spreadsheets across multiple files",
    "Manual matching of policies to regulations",
    "Evidence scattered in email threads and shared drives",
    "Findings recorded in documents without structured workflow",
    "Gap identification relies on individual expert memory",
    "Audit prep takes days of manual reconciliation",
  ],
  lexisgraph: [
    "Single graph connects regulations, policies, and evidence",
    "Structured analysis with coverage metrics and gap scoring",
    "Evidence attached directly to the requirements it supports",
    "Findings linked to requirements with assigned workflow",
    "Systematic gap identification based on structured coverage data",
    "Audit-ready exports with full traceability in minutes",
  ],
} as const;

// ---- Footer Links ---------------------------------------------------------

export const FOOTER_LINKS = [
  {
    heading: "Product",
    links: [
      { label: "Compliance Analysis", href: "#capabilities" },
      { label: "Knowledge Graph",     href: "#capabilities" },
      { label: "Findings Workflow",   href: "#how-it-works" },
      { label: "AI Features",         href: "#capabilities" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About",   href: "#about" },
      { label: "Security", href: "#security" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "How It Works",  href: "#how-it-works" },
      { label: "Roles & Teams", href: "#roles" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy",    href: "#" },
      { label: "Terms of Service",  href: "#" },
    ],
  },
] as const;
