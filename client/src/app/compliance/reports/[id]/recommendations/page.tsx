"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { RecommendationsWorkspace } from "@/components/compliance/RecommendationsWorkspace";

function RecommendationsPageContent() {
  const params = useParams();
  const reportId = Array.isArray(params?.id)
    ? params.id[0]
    : (params?.id as string) || "";

  return (
    <AppShell>
      <main className="p-6 md:p-10 max-w-7xl mx-auto">
        <RecommendationsWorkspace reportId={reportId} />
      </main>
    </AppShell>
  );
}

export default function RecommendationsPage() {
  return (
    <ProtectedRoute>
      <RecommendationsPageContent />
    </ProtectedRoute>
  );
}
