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
    let active = true;

    const syncOrg = (orgs: Organization[]) => {
      const storedId =
        typeof window !== "undefined"
          ? localStorage.getItem("selected_organization_id")
          : null;
      const matched = (orgs || []).find((o) => o.id === storedId) || orgs[0] || null;
      if (active) setSelectedOrg(matched);
    };

    organizationsService
      .getOrganizations()
      .then((orgs) => {
        if (!active) return;
        setOrganizations(orgs || []);
        syncOrg(orgs || []);
      })
      .catch(() => {});

    const handleOrgChanged = () => {
      organizationsService
        .getOrganizations()
        .then((orgs) => {
          if (!active) return;
          setOrganizations(orgs || []);
          syncOrg(orgs || []);
        })
        .catch(() => {});
    };

    window.addEventListener("organization_changed", handleOrgChanged);
    window.addEventListener("storage", handleOrgChanged);

    return () => {
      active = false;
      window.removeEventListener("organization_changed", handleOrgChanged);
      window.removeEventListener("storage", handleOrgChanged);
    };
  }, []);

  return (
    <AppShell>
      {/* Main Container */}
      <main className="p-6 md:p-10 space-y-6 max-w-7xl mx-auto">
        {/* Compact Workspace Header with Org Context */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/compliance")}
              className="w-fit -ml-2 text-muted-foreground hover:text-foreground cursor-pointer gap-1.5 text-xs h-7 mb-0.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Compliance Workspace
            </Button>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
              Analysis History
            </h1>
            <p className="text-xs text-muted-foreground">
              Review past compliance analyses, execution status, and results for your organization.
            </p>
          </div>

          {selectedOrg && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/70 bg-card shadow-xs text-xs">
                <span className="text-[11px] font-medium text-muted-foreground">Workspace:</span>
                {organizations.length > 1 ? (
                  <select
                    id="org-select"
                    value={selectedOrg.id}
                    onChange={(e) => {
                      const org = organizations.find((o) => o.id === e.target.value);
                      if (org) {
                        setSelectedOrg(org);
                        if (typeof window !== "undefined") {
                          localStorage.setItem("selected_organization_id", org.id);
                          localStorage.setItem("lexisgraph_selected_org_id", org.id);
                          window.dispatchEvent(new Event("organization_changed"));
                        }
                      }
                    }}
                    className="bg-transparent font-semibold text-foreground cursor-pointer focus:outline-hidden text-xs pr-1"
                    aria-label="Active workspace organization"
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id} className="bg-popover text-popover-foreground">
                        {org.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-semibold text-foreground">{selectedOrg.name}</span>
                )}
              </div>
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
