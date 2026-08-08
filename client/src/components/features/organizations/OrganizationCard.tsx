"use client";

import React, { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  MoreHorizontal,
  FileText,
  BarChart3,
  Zap,
  ExternalLink,
  Pencil,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  HelpCircle,
  Calendar,
  FileStack,
  Building2,
  ArrowRight,
} from "lucide-react";

import { Organization } from "@/services/api/organizations";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComplianceStatus = "Healthy" | "Needs Review" | "Critical" | "Unknown";

export interface OrganizationCardProps {
  organization: Organization;
  onEdit: (org: Organization) => void;
  onDelete: (id: string) => void;
  complianceScore?: number | null;
  policyCount?: number;
  regulationCount?: number;
  documentCount?: number;
  reportCount?: number;
  lastAnalyzedAt?: string | null;
  viewMode?: "grid" | "list";
}

// ─── Status Utils ─────────────────────────────────────────────────────────────

export function deriveStatus(score: number | null | undefined): ComplianceStatus {
  if (score == null) return "Unknown";
  if (score >= 85) return "Healthy";
  if (score >= 65) return "Needs Review";
  return "Critical";
}

export function getStatusConfig(status: ComplianceStatus) {
  switch (status) {
    case "Healthy":
      return {
        label: "HEALTHY",
        subtext: "Compliant",
        icon: <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />,
        badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold",
        dot: "bg-emerald-500",
        scoreColor: "text-emerald-600 dark:text-emerald-400",
      };
    case "Needs Review":
      return {
        label: "NEEDS REVIEW",
        subtext: "Attention needed",
        icon: <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
        badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold",
        dot: "bg-amber-500",
        scoreColor: "text-amber-600 dark:text-amber-400",
      };
    case "Critical":
      return {
        label: "CRITICAL",
        subtext: "High risk",
        icon: <ShieldX className="h-3.5 w-3.5 shrink-0 text-rose-500" />,
        badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 font-semibold",
        dot: "bg-rose-500",
        scoreColor: "text-rose-600 dark:text-rose-400",
      };
    default:
      return {
        label: "UNKNOWN",
        subtext: "No analysis available",
        icon: <HelpCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
        badgeClass: "bg-muted/50 text-muted-foreground border-border/60 font-medium",
        dot: "bg-muted-foreground",
        scoreColor: "text-muted-foreground",
      };
  }
}

// ─── Polished Logo Avatar with Fallback ──────────────────────────────────────

function OrgAvatar({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [imgError, setImgError] = useState(false);

  // Validate if logoUrl is a plausibly valid URL
  const isValidUrl =
    logoUrl &&
    typeof logoUrl === "string" &&
    logoUrl.trim().length > 0 &&
    (logoUrl.startsWith("http://") ||
      logoUrl.startsWith("https://") ||
      logoUrl.startsWith("data:") ||
      logoUrl.startsWith("/"));

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  const displayInitials = initials || name.slice(0, 2).toUpperCase() || "OG";

  // Deterministic hue based on org name string
  const hue =
    name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;

  if (isValidUrl && !imgError) {
    return (
      <div className="relative h-10 w-10 shrink-0 rounded-lg border border-border/50 bg-background overflow-hidden flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={name}
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/40 text-xs font-extrabold select-none shadow-xs"
      style={{
        background: `hsl(${hue} 45% 93%)`,
        color: `hsl(${hue} 60% 30%)`,
        borderColor: `hsl(${hue} 40% 80%)`,
      }}
      aria-label={`${name} logo avatar`}
    >
      {displayInitials}
    </div>
  );
}

// ─── Main Card Component ──────────────────────────────────────────────────────

export const OrganizationCard = memo(function OrganizationCard({
  organization,
  onEdit,
  onDelete,
  complianceScore,
  policyCount = 0,
  regulationCount = 0,
  documentCount = 0,
  reportCount = 0,
  viewMode = "grid",
}: OrganizationCardProps) {
  const router = useRouter();
  const status = deriveStatus(complianceScore);
  const { label: statusLabel, badgeClass, icon: statusIcon, scoreColor } = getStatusConfig(status);

  const createdDate = format(new Date(organization.created_at), "MMM d, yyyy");
  const updatedDate = format(new Date(organization.updated_at), "MMM d, yyyy");

  const scoreDisplay =
    complianceScore != null ? `${Math.round(complianceScore)}%` : "—";

  const handleRunAnalysis = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/compliance/new?org=${organization.id}`);
  };

  const handleOpenWorkspace = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/organizations/${organization.id}`);
  };

  // ── LIST VIEW ROW ─────────────────────────────────────────────────────────
  if (viewMode === "list") {
    return (
      <div
        onClick={handleOpenWorkspace}
        className="group flex items-center justify-between gap-4 p-3.5 rounded-xl border border-border/60 bg-card/70 hover:bg-muted/30 hover:border-border transition-all duration-150 cursor-pointer shadow-2xs"
      >
        {/* Organization & Industry */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <OrgAvatar name={organization.name} logoUrl={organization.logo_url} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                {organization.name}
              </h3>
              {organization.industry && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/50 text-muted-foreground font-medium shrink-0">
                  {organization.industry}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5 max-w-md">
              {organization.description || "Central organization compliance workspace"}
            </p>
          </div>
        </div>

        {/* Compliance Status */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className={cn("text-base font-extrabold tabular-nums block leading-tight", scoreColor)}>
              {scoreDisplay}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">
              {complianceScore != null ? "Score" : "Not Analyzed"}
            </span>
          </div>
          <Badge variant="outline" className={cn("gap-1 text-[10px] px-2 py-0.5 uppercase tracking-wide shrink-0", badgeClass)}>
            {statusIcon}
            <span>{statusLabel}</span>
          </Badge>
        </div>

        {/* Counts summary */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-muted-foreground shrink-0 border-l border-border/40 pl-4">
          <div className="text-center">
            <span className="font-bold text-foreground block tabular-nums text-xs">{policyCount}</span>
            <span className="text-[9px] uppercase font-semibold text-muted-foreground">Policies</span>
          </div>
          <div className="text-center">
            <span className="font-bold text-foreground block tabular-nums text-xs">{regulationCount}</span>
            <span className="text-[9px] uppercase font-semibold text-muted-foreground">Regs</span>
          </div>
          <div className="text-center">
            <span className="font-bold text-foreground block tabular-nums text-xs">{documentCount}</span>
            <span className="text-[9px] uppercase font-semibold text-muted-foreground">Docs</span>
          </div>
          <div className="text-center">
            <span className="font-bold text-foreground block tabular-nums text-xs">{reportCount}</span>
            <span className="text-[9px] uppercase font-semibold text-muted-foreground">Reports</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenWorkspace}
            className="h-8 px-3 text-xs gap-1.5 font-semibold cursor-pointer"
          >
            <span>View</span>
            <ArrowRight className="h-3 w-3" />
          </Button>

          <Button
            size="sm"
            onClick={handleRunAnalysis}
            className="h-8 px-3 text-xs gap-1 font-semibold cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs"
          >
            <Zap className="h-3 w-3 text-amber-300" />
            <span>Analyze</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 bg-background hover:bg-muted transition-colors cursor-pointer"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Organization Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleOpenWorkspace} className="gap-2 text-xs cursor-pointer">
                <ExternalLink className="h-3.5 w-3.5" /> View Workspace
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRunAnalysis} className="gap-2 text-xs cursor-pointer">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> Run Analysis
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/reports?org=${organization.id}`)} className="gap-2 text-xs cursor-pointer">
                <BarChart3 className="h-3.5 w-3.5" /> View Reports
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(organization)} className="gap-2 text-xs cursor-pointer">
                <Pencil className="h-3.5 w-3.5" /> Edit Organization
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(organization.id)} className="gap-2 text-xs cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // ── GRID CARD ──────────────────────────────────────────────────────────────
  return (
    <Card
      onClick={handleOpenWorkspace}
      className="group flex flex-col h-full border border-border/60 bg-card/80 hover:bg-card hover:border-border hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer w-full"
    >
      {/* Top Header: Logo + Name + Status */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <OrgAvatar name={organization.name} logoUrl={organization.logo_url} />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate leading-tight">
                {organization.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {organization.industry ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/50 text-muted-foreground font-medium">
                    {organization.industry}
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Workspace</span>
                )}
              </div>
            </div>
          </div>

          {/* Three-Dot Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent hover:bg-muted transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
              aria-label="Organization actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Organization Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleOpenWorkspace} className="gap-2 text-xs cursor-pointer">
                <ExternalLink className="h-3.5 w-3.5" /> View Organization
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRunAnalysis} className="gap-2 text-xs cursor-pointer">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> Run Analysis
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/reports?org=${organization.id}`)} className="gap-2 text-xs cursor-pointer">
                <BarChart3 className="h-3.5 w-3.5" /> View Reports
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(organization)} className="gap-2 text-xs cursor-pointer">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(organization.id)} className="gap-2 text-xs cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Compliance Status Block */}
        <div className="p-3 rounded-xl border border-border/40 bg-muted/20 flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Compliance Score
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className={cn("text-2xl font-extrabold tabular-nums tracking-tight leading-none", scoreColor)}>
                {scoreDisplay}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {complianceScore != null ? "overall score" : ""}
              </span>
            </div>
          </div>

          <div className="text-right flex flex-col items-end">
            <Badge variant="outline" className={cn("gap-1 text-[10px] px-2 py-0.5 uppercase tracking-wide shrink-0", badgeClass)}>
              {statusIcon}
              <span>{statusLabel}</span>
            </Badge>
            <span className="text-[10px] text-muted-foreground mt-1">
              {complianceScore != null ? `${Math.round(complianceScore)}% compliant` : "Run analysis to calculate"}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <CardContent className="px-4 py-0 border-t border-border/40 bg-card">
        <div className="grid grid-cols-4 divide-x divide-border/30 py-3">
          <div className="flex flex-col items-center justify-center px-1 text-center">
            <span className="text-sm font-extrabold text-foreground tabular-nums leading-none">
              {policyCount}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mt-1">
              Policies
            </span>
          </div>

          <div className="flex flex-col items-center justify-center px-1 text-center">
            <span className="text-sm font-extrabold text-foreground tabular-nums leading-none">
              {regulationCount}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mt-1">
              Regs
            </span>
          </div>

          <div className="flex flex-col items-center justify-center px-1 text-center">
            <span className="text-sm font-extrabold text-foreground tabular-nums leading-none">
              {documentCount}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mt-1">
              Docs
            </span>
          </div>

          <div className="flex flex-col items-center justify-center px-1 text-center">
            <span className="text-sm font-extrabold text-foreground tabular-nums leading-none">
              {reportCount}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mt-1">
              Reports
            </span>
          </div>
        </div>
      </CardContent>

      {/* Primary & Secondary Actions */}
      <div className="px-4 py-3 border-t border-border/40 flex items-center gap-2 mt-auto bg-muted/10">
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenWorkspace}
          className="flex-1 h-8 text-xs font-semibold gap-1.5 cursor-pointer hover:border-primary/50"
        >
          <span>View Organization</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
        </Button>

        <Button
          size="sm"
          onClick={handleRunAnalysis}
          className="flex-1 h-8 text-xs font-semibold gap-1.5 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs"
        >
          <Zap className="h-3.5 w-3.5 text-amber-300" />
          <span>Run Analysis</span>
        </Button>
      </div>

      {/* Footer Dates */}
      <CardFooter className="px-4 py-2 border-t border-border/40 bg-muted/30">
        <div className="flex items-center justify-between w-full text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-muted-foreground/70" />
            Created {createdDate}
          </span>
          <span>Updated {updatedDate}</span>
        </div>
      </CardFooter>
    </Card>
  );
});

export default OrganizationCard;