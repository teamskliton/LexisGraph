"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Zap,
  BarChart3,
  Network,
  ChevronDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Organization } from "@/services/api/organizations";

interface ComplianceWorkspaceHeaderProps {
  organization: Organization | null;
  organizations: Organization[];
  onSelectOrganization: (id: string) => void;
  complianceScore: number | null;
  riskLevel: {
    label: string;
    color: string;
    badge: string;
    icon: React.ReactNode;
  };
  lastAnalysisDate: string;
  currentAnalysisStatus: string;
  onRunAnalysis: () => void;
}

export const ComplianceWorkspaceHeader: React.FC<ComplianceWorkspaceHeaderProps> = ({
  organization,
  organizations,
  onSelectOrganization,
  complianceScore,
  riskLevel,
  lastAnalysisDate,
  currentAnalysisStatus,
  onRunAnalysis,
}) => {
  const router = useRouter();

  return (
    <Card className="border border-border/60 bg-gradient-to-r from-card via-card/90 to-background p-6 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Organization & Header Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Organization Selector / Label */}
            <div className="flex items-center gap-2 bg-muted/40 border border-border/50 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-indigo-500 shrink-0" />
              {organizations.length > 1 ? (
                <div className="relative flex items-center">
                  <select
                    value={organization?.id || ""}
                    onChange={(e) => onSelectOrganization(e.target.value)}
                    className="appearance-none bg-transparent pr-6 font-semibold text-foreground cursor-pointer focus:outline-none"
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id} className="bg-background text-foreground">
                        {org.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground pointer-events-none absolute right-0" />
                </div>
              ) : (
                <span>{organization?.name || "Organization Workspace"}</span>
              )}
            </div>

            {/* Overall Risk Level Badge */}
            <Badge variant="outline" className={cn("gap-1 text-xs px-3 py-1 font-semibold uppercase tracking-wide", riskLevel.badge)}>
              {riskLevel.icon}
              {riskLevel.label}
            </Badge>

            {/* Current Analysis Status */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary border border-primary/20">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
              {currentAnalysisStatus}
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Compliance Analysis Workspace
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Central compliance intelligence dashboard for statutory evaluation, policy risk scoring, and evidence audit trails.
            </p>
          </div>
        </div>

        {/* Primary & Secondary CTAs */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <Button
            onClick={onRunAnalysis}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-600/20 gap-1.5 cursor-pointer"
          >
            <Zap className="h-4 w-4 text-amber-300" />
            Run Analysis
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/reports")}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <BarChart3 className="h-4 w-4 text-primary" />
            View Reports
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/knowledge-graph")}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <Network className="h-4 w-4 text-purple-400" />
            View Knowledge Graph
          </Button>
        </div>
      </div>

      {/* Header Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 mt-5 border-t border-border/40">
        <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Compliance Score</span>
          <span className="text-xl font-bold tabular-nums text-foreground">
            {complianceScore != null ? `${complianceScore}%` : "N/A"}
          </span>
        </div>

        <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Overall Risk</span>
          <span className="text-sm font-bold text-foreground mt-0.5 block">{riskLevel.label}</span>
        </div>

        <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Last Analysis Date</span>
          <span className="text-xs font-semibold text-foreground truncate mt-1 block">{lastAnalysisDate}</span>
        </div>

        <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Analysis Engine</span>
          <span className="text-xs font-semibold text-emerald-500 mt-1 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> GraphRAG Online
          </span>
        </div>
      </div>
    </Card>
  );
};
