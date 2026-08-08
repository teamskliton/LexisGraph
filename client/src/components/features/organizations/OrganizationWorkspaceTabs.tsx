// OrganizationWorkspaceTabs — Reusable tab navigation & lazy-loaded sections for Organization Workspace
// Tabs: Overview, Policies, Regulations, Analyses, Knowledge Graph, Reports.
// Features client-side tab state, clean blue underline indicator, lazy data fetching, and zero route changes.

"use client";

import React, { memo, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  LayoutDashboard,
  Shield,
  BookOpen,
  Zap,
  Network,
  BarChart3,
  FileText,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  RefreshCw,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrganizationOverviewTab } from "./OrganizationOverviewTab";

import { Organization, organizationsService } from "@/services/api/organizations";
import { documentService } from "@/services/document-service";
import { regulationsApi, GlobalRegulation } from "@/services/api/regulations";
import { complianceService, ComplianceReport, ComplianceJob } from "@/services/api/compliance";
import { DocumentTable } from "@/components/features/documents/DocumentTable";
import { DocumentGrid } from "@/components/features/documents/DocumentGrid";
import { PolicyCenter } from "@/components/features/documents/PolicyCenter";
import { RegulationLibrary } from "@/components/features/documents/RegulationLibrary";
import { OrganizationReportsWorkspace } from "./OrganizationReportsWorkspace";
import type { OrganizationDocumentExtended } from "@/components/features/documents/documents-types";

export type OrganizationTab =
  | "overview"
  | "policies"
  | "regulations"
  | "analyses"
  | "knowledge-graph"
  | "reports";

interface OrganizationWorkspaceTabsProps {
  organization: Organization;
  activeTab: OrganizationTab;
  onTabChange: (tab: OrganizationTab) => void;
  complianceScore?: number | null;
  policyCount?: number;
  reportCount?: number;
}

interface TabDef {
  id: OrganizationTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "policies", label: "Policies", icon: <Shield className="h-4 w-4 text-info" /> },
  { id: "regulations", label: "Regulations", icon: <BookOpen className="h-4 w-4 text-success" /> },
  { id: "analyses", label: "Analyses", icon: <Zap className="h-4 w-4 text-warning" /> },
  { id: "knowledge-graph", label: "Knowledge Graph", icon: <Network className="h-4 w-4 text-purple-400" /> },
  { id: "reports", label: "Reports", icon: <BarChart3 className="h-4 w-4 text-primary" /> },
];

// ─── Sub-Tab Content Components ───────────────────────────────────────────────

function PoliciesTabSection({ organizationId, organizationName }: { organizationId: string; organizationName?: string }) {
  return <PolicyCenter organizationId={organizationId} organizationName={organizationName} />;
}

function RegulationsTabSection({ organizationId, organizationName }: { organizationId: string; organizationName?: string }) {
  return <RegulationLibrary organizationId={organizationId} organizationName={organizationName} />;
}

function AnalysesTabSection({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ComplianceJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    complianceService.listComplianceJobs(organizationId)
      .then((data) => {
        if (active) setJobs(data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [organizationId]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Compliance Analysis Runs ({jobs.length})
        </h3>
        <Button size="sm" onClick={() => router.push("/compliance")} className="cursor-pointer text-xs font-semibold gap-1.5">
          <Zap className="h-3.5 w-3.5" /> Run New Analysis
        </Button>
      </div>

      {jobs.length === 0 ? (
        <Card className="border border-dashed border-border/60 bg-muted/10 py-12 text-center space-y-3">
          <Zap className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="text-sm font-semibold text-foreground">No analyses performed yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Launch an AI compliance scan to map policy clauses against statutory mandates.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Card key={job.id} className="border border-border/50 bg-card p-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-warning/10 text-warning shrink-0">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    Job ID: {job.job_id || job.id}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Triggered {format(new Date(job.created_at), "MMM d, yyyy · HH:mm")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                  {job.status}
                </Badge>
                {job.report_id && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => router.push(`/reports?report=${job.report_id}`)}
                    className="text-xs gap-1 cursor-pointer"
                  >
                    <ExternalLink className="h-3 w-3" /> View Report
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function KnowledgeGraphTabSection() {
  const router = useRouter();

  return (
    <Card className="border border-border/50 bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Knowledge Graph Engine</CardTitle>
            <CardDescription className="text-xs">
              Neo4j graph representation of entity relationships, policies, and regulations
            </CardDescription>
          </div>
        </div>
        <Button size="sm" onClick={() => router.push("/knowledge-graph")} className="cursor-pointer text-xs font-semibold gap-1.5">
          <ExternalLink className="h-3.5 w-3.5" /> Full Visual Explorer
        </Button>
      </div>

      <div className="p-8 rounded-xl border border-dashed border-purple-500/20 bg-purple-500/5 text-center space-y-2">
        <Network className="h-10 w-10 text-purple-400 mx-auto animate-pulse" />
        <h4 className="text-sm font-semibold text-foreground">GraphRAG Index Active</h4>
        <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
          Knowledge Graph nodes and clause embeddings are synchronized. Click above to interactively explore entity connections.
        </p>
      </div>
    </Card>
  );
}

function ReportsTabSection({ organizationId, organizationName }: { organizationId: string; organizationName?: string }) {
  return <OrganizationReportsWorkspace organizationId={organizationId} organizationName={organizationName} />;
}

// ─── Main OrganizationWorkspaceTabs Bar & Orchestrator ───────────────────────

export const OrganizationWorkspaceTabs = memo(function OrganizationWorkspaceTabs({
  organization,
  activeTab,
  onTabChange,
  complianceScore,
  policyCount,
  reportCount,
}: OrganizationWorkspaceTabsProps) {
  return (
    <div className="space-y-6">
      {/* Client-Side Tab Bar directly below header with clean blue underline */}
      <div className="border-b border-border/50 bg-background/50 backdrop-blur-xs sticky top-[73px] z-10">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none px-2 py-0">
          {TABS.map((t) => {
            const isActive = activeTab === t.id;

            return (
              <button
                key={t.id}
                onClick={() => onTabChange(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-xs font-medium transition-all whitespace-nowrap cursor-pointer relative border-b-2",
                  isActive
                    ? "border-primary text-primary font-bold bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                )}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lazy-Rendered Tab Body */}
      <div className="pt-2">
        {activeTab === "overview" && (
          <OrganizationOverviewTab
            organization={organization}
            complianceScore={complianceScore}
            policyCount={policyCount}
            reportCount={reportCount}
          />
        )}
        {activeTab === "policies" && (
          <PoliciesTabSection organizationId={organization.id} organizationName={organization.name} />
        )}
        {activeTab === "regulations" && (
          <RegulationsTabSection organizationId={organization.id} organizationName={organization.name} />
        )}
        {activeTab === "analyses" && (
          <AnalysesTabSection organizationId={organization.id} />
        )}
        {activeTab === "knowledge-graph" && (
          <KnowledgeGraphTabSection />
        )}
        {activeTab === "reports" && (
          <ReportsTabSection organizationId={organization.id} organizationName={organization.name} />
        )}
      </div>
    </div>
  );
});
