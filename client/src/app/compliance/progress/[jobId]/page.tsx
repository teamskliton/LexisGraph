// /compliance/progress/[jobId] — Live Analysis Monitor Page Route
// Route: /compliance/progress/[jobId]
// Displays real-time 3-column enterprise execution dashboard.

"use client";

import React, { use } from "react";
import { useSearchParams } from "next/navigation";
import { Layers, LogOut } from "lucide-react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";

import { LiveAnalysisMonitor } from "@/components/compliance/LiveAnalysisMonitor";

interface PageProps {
  params: Promise<{ jobId: string }>;
}

function AnalysisProgressContent({ jobId }: { jobId: string }) {
  const { logout } = useAuth();
  const searchParams = useSearchParams();

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

export default function AnalysisProgressPage({ params }: PageProps) {
  const resolvedParams = use(params);

  return (
    <ProtectedRoute>
      <AnalysisProgressContent jobId={resolvedParams.jobId} />
    </ProtectedRoute>
  );
}
