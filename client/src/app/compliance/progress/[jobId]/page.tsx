"use client";

import React, { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { LiveAnalysisMonitor } from "@/components/compliance/LiveAnalysisMonitor";

function AnalysisProgressContent() {
  const params = useParams();
  const searchParams = useSearchParams();

  const jobId = Array.isArray(params?.jobId)
    ? params.jobId[0]
    : (params?.jobId as string) || "";

  const orgId = searchParams.get("org") || undefined;
  const policyId = searchParams.get("policy") || undefined;
  const regId = searchParams.get("reg") || undefined;

  return (
    <AppShell>
      <main className="p-6 md:p-10 max-w-7xl mx-auto">
        <LiveAnalysisMonitor
          jobId={jobId}
          orgId={orgId}
          policyId={policyId}
          regId={regId}
        />
      </main>
    </AppShell>
  );
}

export default function AnalysisProgressPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading analysis tracker...</div>}>
        <AnalysisProgressContent />
      </Suspense>
    </ProtectedRoute>
  );
}
