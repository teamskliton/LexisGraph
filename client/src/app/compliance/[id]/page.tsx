"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { AnalysisDetailsWorkspace } from "@/components/compliance/AnalysisDetailsWorkspace";

function ComplianceReportPageContent() {
  const params = useParams();
  const reportId = Array.isArray(params?.id)
    ? params.id[0]
    : (params?.id as string) || "";

  return (
    <AppShell>
      <main className="p-6 md:p-10">
        <AnalysisDetailsWorkspace reportId={reportId} />
      </main>
    </AppShell>
  );
}

export default function ComplianceReportPage() {
  return (
    <ProtectedRoute>
      <ComplianceReportPageContent />
    </ProtectedRoute>
  );
}
