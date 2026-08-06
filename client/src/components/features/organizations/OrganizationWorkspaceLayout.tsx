// OrganizationWorkspaceLayout — Master workspace layout shell for Organizations
// Orchestrates Header, OrganizationWorkspaceTabs, and workspace content without route changes.

"use client";

import React, { memo, useState } from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { OrganizationWorkspaceHeader } from "./OrganizationWorkspaceHeader";
import { OrganizationWorkspaceTabs, OrganizationTab } from "./OrganizationWorkspaceTabs";
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
  const [activeTab, setActiveTab] = useState<OrganizationTab>("overview");

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

        {/* Main Workspace Body: Tabs Bar Directly Below Header */}
        <main className="max-w-7xl mx-auto px-6 py-4">
          {children ? (
            children
          ) : (
            <OrganizationWorkspaceTabs
              organization={organization}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              complianceScore={complianceScore}
              policyCount={policyCount}
              reportCount={reportCount}
            />
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
});
