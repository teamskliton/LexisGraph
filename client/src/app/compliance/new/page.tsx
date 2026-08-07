// /compliance/new — Analysis Configuration Page Route
// Route: /compliance/new
// Displays the Analysis Configuration panel before initiating an AI compliance analysis.

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, LogOut } from "lucide-react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";

import { AnalysisConfigurationPanel } from "@/components/compliance/AnalysisConfigurationPanel";
import { organizationsService, Organization } from "@/services/api/organizations";
import { documentService } from "@/services/document-service";
import { regulationsApi, GlobalRegulation } from "@/services/api/regulations";
import { complianceService, ComplianceReport } from "@/services/api/compliance";
import { DocumentResponse } from "@/types/document";

function AnalysisConfigurationPageContent() {
  const { logout } = useAuth();
  const router = useRouter();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [isOrgLoading, setIsOrgLoading] = useState(true);

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [regulations, setRegulations] = useState<GlobalRegulation[]>([]);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // 1. Fetch Organizations
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await organizationsService.getOrganizations();
        if (!active) return;
        setOrganizations(data);
        if (data.length > 0) {
          setSelectedOrgId(data[0].id);
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
  }, []);

  // 2. Fetch Organization Specific Documents, Regulations, and Reports
  const fetchOrgData = useCallback(async (orgId: string) => {
    if (!orgId) return;
    setIsDataLoading(true);

    try {
      const [docsData, regsData, reportsData] = await Promise.all([
        documentService.getDocuments(orgId).catch(() => []),
        regulationsApi.listRegulations(orgId).catch(() => []),
        complianceService.listComplianceReports(orgId).catch(() => []),
      ]);

      setDocuments(docsData || []);
      setRegulations(regsData || []);
      setReports(reportsData || []);
    } catch {
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

  const latestReport = reports.length > 0
    ? [...reports].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      {/* Navbar Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-foreground">LexisGraph</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="p-6 md:p-10">
        <AnalysisConfigurationPanel
          organization={selectedOrg}
          organizations={organizations}
          onSelectOrganization={setSelectedOrgId}
          policies={policies}
          regulations={regulations}
          latestReport={latestReport}
          isLoading={isOrgLoading || isDataLoading}
        />
      </main>
    </div>
  );
}

export default function AnalysisConfigurationPage() {
  return (
    <ProtectedRoute>
      <AnalysisConfigurationPageContent />
    </ProtectedRoute>
  );
}
