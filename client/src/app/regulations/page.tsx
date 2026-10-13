"use client";

import React, { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { RegulationLibrary } from "@/components/features/documents/RegulationLibrary";
import { organizationsService } from "@/services/api/organizations";

import { useAuth } from "@/context/auth-context";

function RegulationsPageContent() {
  const { activeMembership } = useAuth();
  const [activeOrgId, setActiveOrgId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_organization_id") || "";
    }
    return "";
  });
  const [orgName, setOrgName] = useState<string>(
    activeMembership?.organization_name || "Active Workspace"
  );

  useEffect(() => {
    const syncOrg = () => {
      const stored =
        typeof window !== "undefined"
          ? localStorage.getItem("selected_organization_id")
          : null;
      const targetId = stored || activeMembership?.organization_id || "";
      if (targetId) {
        setActiveOrgId(targetId);
        organizationsService
          .getOrganizationById(targetId)
          .then((o) => {
            if (o?.name) setOrgName(o.name);
          })
          .catch(() => {
            if (activeMembership?.organization_name) {
              setOrgName(activeMembership.organization_name);
            }
          });
      }
    };

    syncOrg();

    const handleOrgChange = () => {
      syncOrg();
    };

    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, [activeMembership]);

  return (
    <AppShell>
      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
        <RegulationLibrary
          key={activeOrgId || "empty-org"}
          organizationId={activeOrgId}
          organizationName={orgName}
        />
      </main>
    </AppShell>
  );
}

export default function RegulationsPage() {
  return (
    <ProtectedRoute>
      <RegulationsPageContent />
    </ProtectedRoute>
  );
}
