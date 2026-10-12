// /compliance/history — Analysis History & Audit Trail Page Route
// Route: /compliance/history
// Displays comprehensive compliance audit history for selected organization.

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { AnalysisHistoryTable } from "@/components/compliance/AnalysisHistoryTable";
import { organizationsService, Organization } from "@/services/api/organizations";

function AnalysisHistoryContent() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  useEffect(() => {
    organizationsService
      .getOrganizations()
      .then((orgs) => {
        setOrganizations(orgs);
        if (orgs.length > 0) {
          setSelectedOrg(orgs[0]);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <AppShell>
      {/* Main Container */}
      <main className="p-6 md:p-10 space-y-6 max-w-7xl mx-auto">
        {/* Workspace Title & Org Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/compliance")}
              className="w-fit -ml-2 text-muted-foreground hover:text-foreground cursor-pointer gap-1.5 text-xs mb-1"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Compliance Workspace
            </Button>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Analysis History & Audit Trail
            </h1>
            <p className="text-xs text-muted-foreground">
              Review and audit all statutory compliance analyses executed for your organization.
            </p>
          </div>

          {organizations.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="org-select" className="text-xs font-semibold text-muted-foreground">
                Organization:
              </label>
              <select
                id="org-select"
                value={selectedOrg?.id || ""}
                onChange={(e) => {
                  const org = organizations.find((o) => o.id === e.target.value);
                  if (org) setSelectedOrg(org);
                }}
                className="h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground cursor-pointer font-medium focus:ring-1 focus:ring-primary"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* History Table */}
        <AnalysisHistoryTable organization={selectedOrg} />
      </main>
    </AppShell>
  );
}

export default function AnalysisHistoryPage() {
  return (
    <ProtectedRoute>
      <AnalysisHistoryContent />
    </ProtectedRoute>
  );
}
