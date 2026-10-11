"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/ui/brand-logo";

import { AnalysisDetailsWorkspace } from "@/components/compliance/AnalysisDetailsWorkspace";

function ReportDetailPageContent() {
  const { logout } = useAuth();
  const params = useParams();
  const reportId = Array.isArray(params?.reportId)
    ? params.reportId[0]
    : (params?.reportId as string) || "";

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      {/* Top Navbar */}
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
              className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground text-xs"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="p-6 md:p-10">
        <AnalysisDetailsWorkspace reportId={reportId} />
      </main>
    </div>
  );
}

export default function ReportDetailPage() {
  return (
    <ProtectedRoute>
      <ReportDetailPageContent />
    </ProtectedRoute>
  );
}
