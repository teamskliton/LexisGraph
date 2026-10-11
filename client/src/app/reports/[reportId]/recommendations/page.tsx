"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { RecommendationsWorkspace } from "@/components/compliance/RecommendationsWorkspace";

function ReportsRecommendationsPageContent() {
  const params = useParams();
  const reportId = Array.isArray(params?.reportId)
    ? params.reportId[0]
    : (params?.reportId as string) || "";

  return (
    <AppShell>
      <main className="p-6 md:p-10 max-w-7xl mx-auto">
        <RecommendationsWorkspace reportId={reportId} />
      </main>
    </AppShell>
  );
}

export default function ReportsRecommendationsPage() {
  return (
    <ProtectedRoute>
      <ReportsRecommendationsPageContent />
    </ProtectedRoute>
  );
}
