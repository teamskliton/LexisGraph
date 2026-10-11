"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";

import { AnalysisDetailsWorkspace } from "@/components/compliance/AnalysisDetailsWorkspace";

function ReportDetailPageContent() {
  const params = useParams();
  const reportId = Array.isArray(params?.reportId)
    ? params.reportId[0]
    : (params?.reportId as string) || "";

  return (
    <AppShell>
      {/* Main Workspace Body */}
      <main className="p-6 md:p-10">
        <AnalysisDetailsWorkspace reportId={reportId} />
      </main>
    </AppShell>
  );
}

export default function ReportDetailPage() {
  return (
    <ProtectedRoute>
      <ReportDetailPageContent />
    </ProtectedRoute>
  );
}
