"use client";

import React, { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { RegulationLibrary } from "@/components/features/documents/RegulationLibrary";
import { organizationsService } from "@/services/api/organizations";

function RegulationsPageContent() {
  const [activeOrgId, setActiveOrgId] = useState<string>(() => {
    return typeof window !== "undefined"
      ? localStorage.getItem("selected_organization_id") || "org-001"
      : "org-001";
  });
  const [orgName, setOrgName] = useState<string>("Organization Workspace");

  useEffect(() => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null;
    if (orgId) {
      setActiveOrgId(orgId);
      organizationsService
        .getOrganizationById(orgId)
        .then((o) => {
          if (o?.name) setOrgName(o.name);
        })
        .catch(() => {});
    }

    const handleOrgChange = () => {
      const stored = typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null;
      if (stored) {
        setActiveOrgId(stored);
        organizationsService
          .getOrganizationById(stored)
          .then((o) => {
            if (o?.name) setOrgName(o.name);
          })
          .catch(() => {});
      }
    };

    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, []);

  return (
    <AppShell>
      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
        <RegulationLibrary organizationId={activeOrgId} organizationName={orgName} />
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
