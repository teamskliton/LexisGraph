// OrganizationWorkspaceLayout — Master workspace layout shell for Organizations
// Orchestrates Header and workspace content directly without unnecessary tab navbars.

"use client";

import React, { memo } from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { OrganizationWorkspaceHeader } from "./OrganizationWorkspaceHeader";
import { OrganizationReportsWorkspace } from "./OrganizationReportsWorkspace";
import type { Organization } from "@/services/api/organizations";

interface OrganizationWorkspaceLayoutProps {
  organization: Organization;
  complianceScore?: number | null;
  policyCount?: number;
  reportCount?: number;
  onEditOrg?: (org: Organization) => void;
  children?: React.ReactNode;
}

export const OrganizationWorkspaceLayout = memo(function OrganizationWorkspaceLayout({
  organization,
  complianceScore,
  policyCount,
  reportCount,
  onEditOrg,
  children,
}: OrganizationWorkspaceLayoutProps) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background pb-16">
        {/* Workspace Header */}
        <OrganizationWorkspaceHeader
          organization={organization}
          complianceScore={complianceScore}
          policyCount={policyCount}
          reportCount={reportCount}
          onEdit={onEditOrg}
        />

        {/* Main Workspace Body */}
        <main className="max-w-7xl mx-auto px-6 py-4">
          {children ? (
            children
          ) : (
            <OrganizationReportsWorkspace
              organizationId={organization.id}
              organizationName={organization.name}
            />
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
});
