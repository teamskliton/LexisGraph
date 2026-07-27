"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  LogOut,
  User as UserIcon,
  Mail,
  ShieldAlert,
  Calendar,
  Layers,
  Activity,
  FileText,
  GitBranch,
} from "lucide-react";

function DashboardContent() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-foreground">
              LexisGraph
            </span>
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

      {/* Main Container */}
      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome back, <span className="font-semibold text-indigo-600">{user?.full_name}</span>. Manage your legal compliance analysis here.
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Policy Documents
              </CardTitle>
              <FileText className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
              <p className="text-xs text-muted-foreground mt-0.5">+2 added this week</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Extracted Clauses
              </CardTitle>
              <Layers className="h-4 w-4 text-violet-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">348</div>
              <p className="text-xs text-muted-foreground mt-0.5">98.4% parser accuracy</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Graph Nodes
              </CardTitle>
              <GitBranch className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1,894</div>
              <p className="text-xs text-muted-foreground mt-0.5">Neo4j instance connected</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Compliance Health
              </CardTitle>
              <Activity className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">94.2%</div>
              <p className="text-xs text-muted-foreground mt-0.5">1 pending resolution</p>
            </CardContent>
          </Card>
        </div>

        {/* User Details & Workspace Panel */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* User Profile Info Card */}
          <Card className="md:col-span-1 border-border/50 shadow-md">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-lg font-bold">User Identity</CardTitle>
              <CardDescription>Your account credentials and details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/25 flex items-center justify-center">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Username</p>
                  <p className="text-sm font-medium text-foreground truncate">{user?.username}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-violet-500/10 text-violet-500 border border-violet-500/25 flex items-center justify-center">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</p>
                  <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/25 flex items-center justify-center">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Privilege</p>
                  <p className="text-sm font-medium text-foreground">
                    {user?.is_superuser ? "System Administrator" : "Standard Compliance Analyst"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 flex items-center justify-center">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created At</p>
                  <p className="text-sm font-medium text-foreground">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/30 border-t border-border/50 py-3 text-center text-xs text-muted-foreground flex justify-center">
              UUID: {user?.id}
            </CardFooter>
          </Card>

          {/* Quick Actions Panel */}
          <Card className="md:col-span-2 border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Regulatory Workspace</CardTitle>
              <CardDescription>Select a workspace tool to begin analyzing documents</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div
                onClick={() => router.push("/upload")}
                className="border border-border/50 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all p-4 rounded-xl space-y-2 cursor-pointer group"
              >
                <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500/20 transition-all flex items-center justify-center">
                  <FileText className="h-4 w-4" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">Compliance Auditor</h4>
                <p className="text-xs text-muted-foreground">Upload corporate guidelines and cross-match against legal benchmarks.</p>
              </div>

              <div className="border border-border/50 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all p-4 rounded-xl space-y-2 cursor-pointer group">
                <div className="h-9 w-9 rounded-lg bg-violet-500/10 text-violet-500 group-hover:bg-violet-500/20 transition-all flex items-center justify-center">
                  <GitBranch className="h-4 w-4" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">Knowledge Explorer</h4>
                <p className="text-xs text-muted-foreground">Query compliance graphs and interact with Neo4j relational networks.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
