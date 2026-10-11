"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/ui/brand-logo";

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
          <Link href="/dashboard" className="flex items-center gap-2.5 cursor-pointer">
            <BrandLogo size={32} priority />
            <span className="font-bold tracking-tight text-foreground">LexisGraph</span>
          </Link>
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
