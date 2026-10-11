// /compliance/reports/[id] — Analysis Details Workspace Page Route
// Displays comprehensive 9-section analysis review workspace.

"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { AnalysisDetailsWorkspace } from "@/components/compliance/AnalysisDetailsWorkspace";

function AnalysisDetailsPageContent() {
  const params = useParams();
  const reportId = Array.isArray(params?.id)
    ? params.id[0]
    : (params?.id as string) || "";

  return (
    <AppShell>
      <main className="p-6 md:p-10 max-w-7xl mx-auto">
        <AnalysisDetailsWorkspace reportId={reportId} />
      </main>
    </AppShell>
  );
}

export default function AnalysisDetailsPage() {
  return (
    <ProtectedRoute>
      <AnalysisDetailsPageContent />
    </ProtectedRoute>
  );
}
