// /compliance/new — Analysis Configuration Page Route
// Route: /compliance/new
// Displays the New Compliance Analysis configuration panel before initiating an AI compliance analysis.

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/auth-context";

import { AnalysisConfigurationPanel } from "@/components/compliance/AnalysisConfigurationPanel";
import { organizationsService, Organization } from "@/services/api/organizations";
import { documentService } from "@/services/document-service";
import { regulationsApi, GlobalRegulation } from "@/services/api/regulations";
import { complianceService, ComplianceReport } from "@/services/api/compliance";
import { DocumentResponse } from "@/types/document";

function AnalysisConfigurationPageContent() {
  const { activeMembership } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [isOrgLoading, setIsOrgLoading] = useState(true);

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [regulations, setRegulations] = useState<GlobalRegulation[]>([]);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // 1. Fetch Organizations — synchronize with global active organization
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await organizationsService.getOrganizations();
        if (!active) return;
        setOrganizations(data);
        if (data.length > 0) {
          // Priority 1: Auth context active membership
          // Priority 2: Stored localStorage org ID
          // Priority 3: First available organization
          const storedOrgId = typeof window !== "undefined"
            ? window.localStorage.getItem("selected_organization_id") ||
              window.localStorage.getItem("lexisgraph_selected_org_id")
            : null;

          const activeOrgId = activeMembership?.organization_id;
          const preferredId = activeOrgId || storedOrgId;
          const validOrg = preferredId && data.some((o) => o.id === preferredId);
          const chosenId = validOrg ? preferredId! : data[0].id;

          setSelectedOrgId(chosenId);
          if (typeof window !== "undefined") {
            window.localStorage.setItem("selected_organization_id", chosenId);
            window.localStorage.setItem("lexisgraph_selected_org_id", chosenId);
          }
        }
      } catch {
        toast.error("Failed loading organization workspaces.");
      } finally {
        if (active) setIsOrgLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeMembership]);

  // Synchronize with global organization_changed events
  useEffect(() => {
    const handleOrgChanged = () => {
      if (typeof window !== "undefined") {
        const stored =
          window.localStorage.getItem("selected_organization_id") ||
          window.localStorage.getItem("lexisgraph_selected_org_id");
        if (stored && stored !== selectedOrgId) {
          setSelectedOrgId(stored);
        }
      }
    };

    window.addEventListener("organization_changed", handleOrgChanged);
    return () => window.removeEventListener("organization_changed", handleOrgChanged);
  }, [selectedOrgId]);

  // 2. Fetch Organization Specific Documents, Regulations, and Reports
  const fetchOrgData = useCallback(async (orgId: string) => {
    if (!orgId) return;
    setIsDataLoading(true);
    setDataError(null);

    try {
      const [docsResult, regsResult, reportsResult] = await Promise.allSettled([
        documentService.getDocuments(orgId),
        regulationsApi.listRegulations(orgId),
        complianceService.listComplianceReports(orgId),
      ]);

      if (docsResult.status === "fulfilled") {
        setDocuments(docsResult.value || []);
      } else {
        console.error("Failed to fetch documents:", docsResult.reason);
        toast.error("Could not load policy documents for workspace.");
        setDocuments([]);
      }

      if (regsResult.status === "fulfilled") {
        setRegulations(regsResult.value || []);
      } else {
        console.error("Failed to fetch regulations:", regsResult.reason);
        toast.error("Could not load global regulations catalog.");
        setRegulations([]);
      }

      if (reportsResult.status === "fulfilled") {
        setReports(reportsResult.value || []);
      } else {
        console.error("Failed to fetch reports:", reportsResult.reason);
        setReports([]);
      }
    } catch (err) {
      console.error("Failed loading configuration data:", err);
      setDataError("Failed loading workspace configuration data. Please try again.");
      toast.error("Failed loading configuration data.");
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOrgId) {
      fetchOrgData(selectedOrgId);
    }
  }, [selectedOrgId, fetchOrgData]);

  const selectedOrg = organizations.find((o) => o.id === selectedOrgId) || null;
  const policies = documents.filter((d) => d.document_type === "POLICY");

  const handleSelectOrganization = (id: string) => {
    setSelectedOrgId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("selected_organization_id", id);
      window.localStorage.setItem("lexisgraph_selected_org_id", id);
      window.dispatchEvent(new Event("organization_changed"));
    }
  };

  const latestReport = reports.length > 0
    ? [...reports].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null;

  return (
    <AppShell>
      <div className="min-h-full">
        <AnalysisConfigurationPanel
          organization={selectedOrg}
          organizations={organizations}
          onSelectOrganization={handleSelectOrganization}
          onRefresh={() => fetchOrgData(selectedOrgId)}
          policies={policies}
          regulations={regulations}
          latestReport={latestReport}
          isLoading={isOrgLoading || isDataLoading}
          error={dataError}
        />
      </div>
    </AppShell>
  );
}

export default function AnalysisConfigurationPage() {
  return (
    <ProtectedRoute>
      <AnalysisConfigurationPageContent />
    </ProtectedRoute>
  );
}
