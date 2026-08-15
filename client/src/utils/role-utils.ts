/**
 * Centralized Role Utilities for LexisGraph
 *
 * Normalizes conceptual roles and provides consistent formatting, styling,
 * and client-side authorization helper functions.
 *
 * CANONICAL MAPPINGS:
 * - ADMIN / SUPER_ADMIN / ORGANIZATION_ADMIN -> "Admin"
 * - COMPLIANCE_ANALYST / LEGAL_ANALYST / MANAGER -> "Compliance Analyst"
 * - REVIEWER -> "Reviewer"
 * - VIEWER / EMPLOYEE -> "Viewer"
 * - Missing/Unexpected -> "Role unavailable" (Never falls back to Compliance Analyst)
 */

export function normalizeRole(role?: string | null): string {
  if (!role || typeof role !== "string") return "";
  return role.trim().toUpperCase();
}

/**
 * Returns a human-friendly display label for any backend role string.
 */
export function formatRoleLabel(role?: string | null): string {
  const normalized = normalizeRole(role);
  if (!normalized) {
    return "Role unavailable";
  }

  switch (normalized) {
    case "ADMIN":
    case "ORGANIZATION_ADMIN":
    case "SUPER_ADMIN":
      return "Admin";

    case "COMPLIANCE_ANALYST":
    case "LEGAL_ANALYST":
    case "MANAGER":
      return "Compliance Analyst";

    case "REVIEWER":
      return "Reviewer";

    case "VIEWER":
    case "EMPLOYEE":
      return "Viewer";

    case "USER":
      return "User";

    default:
      console.warn(`[formatRoleLabel] Encountered unexpected role string: "${role}"`);
      return (role ?? "").replace(/_/g, " ") || "Role unavailable";
  }
}

/**
 * Returns Tailwind badge classes based on role severity / privilege.
 */
export function getRoleBadgeClass(role?: string | null): string {
  const normalized = normalizeRole(role);

  switch (normalized) {
    case "ADMIN":
    case "ORGANIZATION_ADMIN":
    case "SUPER_ADMIN":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30";

    case "COMPLIANCE_ANALYST":
    case "LEGAL_ANALYST":
    case "MANAGER":
      return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30";

    case "REVIEWER":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";

    case "VIEWER":
    case "EMPLOYEE":
    case "USER":
      return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30";

    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

/**
 * Determines whether a given role has Administrator capabilities.
 */
export function isRoleAdmin(role?: string | null, isSuperuser: boolean = false): boolean {
  if (isSuperuser) return true;
  const normalized = normalizeRole(role);
  return (
    normalized === "ADMIN" ||
    normalized === "ORGANIZATION_ADMIN" ||
    normalized === "SUPER_ADMIN"
  );
}

/**
 * Determines whether a given role is Reviewer.
 */
export function isRoleReviewer(role?: string | null): boolean {
  return normalizeRole(role) === "REVIEWER";
}

/**
 * Determines whether a given role is Compliance Analyst / Legal Analyst.
 */
export function isRoleComplianceAnalyst(role?: string | null): boolean {
  const norm = normalizeRole(role);
  return norm === "COMPLIANCE_ANALYST" || norm === "LEGAL_ANALYST" || norm === "MANAGER";
}

/**
 * Determines whether a given role is Viewer.
 */
export function isRoleViewer(role?: string | null): boolean {
  const norm = normalizeRole(role);
  return norm === "VIEWER" || norm === "EMPLOYEE" || norm === "USER";
}

/**
 * Determines whether a user can invite team members and manage organization members.
 */
export function canUserManageTeam(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser);
}

/**
 * Centralized Permission Helpers (LexisGraph RBAC)
 */
export function canCreateOrganization(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser);
}

export function canManageOrganization(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser);
}

export function canInviteMembers(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser);
}

export function canManageMembers(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser);
}

export function canUploadDocuments(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role);
}

export function canDeleteDocuments(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role);
}

export function canRetryDocumentProcessing(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role);
}

export function canRunAnalysis(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role);
}

/**
 * Only Admins and Compliance Analysts can assign findings to other members or unassign anyone.
 */
export function canAssignFindings(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role);
}

/**
 * Reviewers can self-assign unassigned findings using "Assign to me".
 */
export function canClaimFinding(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role) || isRoleReviewer(role);
}

export function canReviewFindings(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role) || isRoleReviewer(role);
}

export function canCommentOnFindings(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role) || isRoleReviewer(role);
}

export function canResolveFindings(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser);
}

export function canReopenFindings(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser);
}

/**
 * Only Admins and Reviewers can resolve or reopen comment discussions.
 * Compliance Analysts and Viewers are NOT permitted to resolve discussions.
 */
export function canResolveDiscussion(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleReviewer(role);
}

export function canUpdateFindingStatus(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role) || isRoleReviewer(role);
}

export function canUpdateRemediationDueDate(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role);
}

export function canViewKnowledgeGraph(role?: string | null, isSuperuser: boolean = false): boolean {
  // All authenticated organization members have read-only access to KG
  return Boolean(role || isSuperuser);
}

export function canViewDocuments(role?: string | null, isSuperuser: boolean = false): boolean {
  return Boolean(role || isSuperuser);
}

export function canViewReports(role?: string | null, isSuperuser: boolean = false): boolean {
  return Boolean(role || isSuperuser);
}

export function canExportReports(role?: string | null, isSuperuser: boolean = false): boolean {
  return Boolean(role || isSuperuser);
}

export function canManageRemediation(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleComplianceAnalyst(role) || isRoleReviewer(role);
}

export function canVerifyRemediation(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser) || isRoleReviewer(role);
}

export function canApproveRemediation(role?: string | null, isSuperuser: boolean = false): boolean {
  return isRoleAdmin(role, isSuperuser);
}

export interface UserPermissions {
  canCreateOrganization: boolean;
  canManageOrganization: boolean;
  canInviteMembers: boolean;
  canManageMembers: boolean;
  canUploadDocuments: boolean;
  canDeleteDocuments: boolean;
  canRetryDocumentProcessing: boolean;
  canRunAnalysis: boolean;
  canAssignFindings: boolean;
  canClaimFinding: boolean;
  canReviewFindings: boolean;
  canCommentOnFindings: boolean;
  canResolveDiscussion: boolean;
  canResolveFindings: boolean;
  canReopenFindings: boolean;
  canUpdateFindingStatus: boolean;
  canUpdateRemediationDueDate: boolean;
  canManageRemediation: boolean;
  canVerifyRemediation: boolean;
  canApproveRemediation: boolean;
  canViewKnowledgeGraph: boolean;
  canViewDocuments: boolean;
  canViewReports: boolean;
  canExportReports: boolean;
}

export function getUserPermissions(role?: string | null, isSuperuser: boolean = false): UserPermissions {
  return {
    canCreateOrganization: canCreateOrganization(role, isSuperuser),
    canManageOrganization: canManageOrganization(role, isSuperuser),
    canInviteMembers: canInviteMembers(role, isSuperuser),
    canManageMembers: canManageMembers(role, isSuperuser),
    canUploadDocuments: canUploadDocuments(role, isSuperuser),
    canDeleteDocuments: canDeleteDocuments(role, isSuperuser),
    canRetryDocumentProcessing: canRetryDocumentProcessing(role, isSuperuser),
    canRunAnalysis: canRunAnalysis(role, isSuperuser),
    canAssignFindings: canAssignFindings(role, isSuperuser),
    canClaimFinding: canClaimFinding(role, isSuperuser),
    canReviewFindings: canReviewFindings(role, isSuperuser),
    canCommentOnFindings: canCommentOnFindings(role, isSuperuser),
    canResolveDiscussion: canResolveDiscussion(role, isSuperuser),
    canResolveFindings: canResolveFindings(role, isSuperuser),
    canReopenFindings: canReopenFindings(role, isSuperuser),
    canUpdateFindingStatus: canUpdateFindingStatus(role, isSuperuser),
    canUpdateRemediationDueDate: canUpdateRemediationDueDate(role, isSuperuser),
    canManageRemediation: canManageRemediation(role, isSuperuser),
    canVerifyRemediation: canVerifyRemediation(role, isSuperuser),
    canApproveRemediation: canApproveRemediation(role, isSuperuser),
    canViewKnowledgeGraph: canViewKnowledgeGraph(role, isSuperuser),
    canViewDocuments: canViewDocuments(role, isSuperuser),
    canViewReports: canViewReports(role, isSuperuser),
    canExportReports: canExportReports(role, isSuperuser),
  };
}
