"use client";

import React, { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Layers, LogOut } from "lucide-react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";

import { LiveAnalysisMonitor } from "@/components/compliance/LiveAnalysisMonitor";

function AnalysisProgressContent() {
  const { logout } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();

  const jobId = Array.isArray(params?.jobId)
    ? params.jobId[0]
    : (params?.jobId as string) || "";

  const orgId = searchParams.get("org") || undefined;
  const policyId = searchParams.get("policy") || undefined;
  const regId = searchParams.get("reg") || undefined;

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
        <LiveAnalysisMonitor
          jobId={jobId}
          orgId={orgId}
          policyId={policyId}
          regId={regId}
        />
      </main>
    </div>
  );
}

export default function AnalysisProgressPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="p-10 text-center text-sm text-muted-foreground">Loading analysis monitor...</div>}>
        <AnalysisProgressContent />
      </Suspense>
    </ProtectedRoute>
  );
}
