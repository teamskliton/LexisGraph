"use client";

import React, { memo } from "react";
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
  RefreshCw,
  FileStack,
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
  // Optional compliance enrichment — passed from page when available
  complianceScore?: number | null;
  policyCount?: number;
  regulationCount?: number;
  documentCount?: number;
  reportCount?: number;
  lastAnalyzedAt?: string | null;
  latestActivity?: string;
  viewMode?: "grid" | "list";
}

// ─── Status Utils ─────────────────────────────────────────────────────────────

function deriveStatus(score: number | null | undefined): ComplianceStatus {
  if (score == null) return "Unknown";
  if (score >= 85) return "Healthy";
  if (score >= 65) return "Needs Review";
  return "Critical";
}

function getStatusConfig(status: ComplianceStatus) {
  switch (status) {
    case "Healthy":
      return {
        icon: <ShieldCheck className="h-3 w-3 shrink-0" />,
        badgeClass: "bg-success/10 text-success border-success/25 font-semibold",
        dot: "bg-success",
      };
    case "Needs Review":
      return {
        icon: <ShieldAlert className="h-3 w-3 shrink-0" />,
        badgeClass: "bg-warning/10 text-warning-foreground dark:text-warning border-warning/25 font-semibold",
        dot: "bg-warning",
      };
    case "Critical":
      return {
        icon: <ShieldX className="h-3 w-3 shrink-0" />,
        badgeClass: "bg-danger/10 text-danger border-danger/25 font-semibold",
        dot: "bg-danger",
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3 shrink-0" />,
        badgeClass: "bg-muted text-muted-foreground border-border font-medium",
        dot: "bg-muted-foreground",
      };
  }
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

function OrgAvatar({ name, logoUrl }: { name: string; logoUrl?: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className="h-9 w-9 rounded-lg object-cover border border-border/50 shrink-0"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  // Pick a deterministic hue from the name string
  const hue = name
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;

  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 text-sm font-bold text-primary select-none"
      style={{ background: `hsl(${hue} 50% 92%)`, color: `hsl(${hue} 50% 35%)` }}
    >
      {initials || "?"}
    </div>
  );
}

// ─── Metric Pill ──────────────────────────────────────────────────────────────

function MetricPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div
      className="flex items-center gap-1 text-[11px] text-muted-foreground"
      title={label}
    >
      {icon}
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

export const OrganizationCard = memo(function OrganizationCard({
  organization,
  onEdit,
  onDelete,
  complianceScore,
  policyCount = 0,
  regulationCount = 0,
  documentCount = 0,
  reportCount = 0,
  lastAnalyzedAt,
  latestActivity,
  viewMode = "grid",
}: OrganizationCardProps) {
  const router = useRouter();
  const status = deriveStatus(complianceScore);
  const { icon: statusIcon, badgeClass, dot } = getStatusConfig(status);

  const createdDate = format(new Date(organization.created_at), "MMM d, yyyy");
  const updatedDate = format(new Date(organization.updated_at), "MMM d, yyyy");
  const lastAnalyzed = lastAnalyzedAt
    ? format(new Date(lastAnalyzedAt), "MMM d, yyyy")
    : null;

  const scoreDisplay =
    complianceScore != null ? `${Math.round(complianceScore)}%` : "—";

  if (viewMode === "list") {
    return (
      <div className="group flex items-center justify-between gap-4 p-3 rounded-lg border border-border/50 bg-card hover:border-border hover:shadow-sm transition-all duration-150">
        {/* Left: Avatar + Name + Status */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <OrgAvatar name={organization.name} logoUrl={organization.logo_url} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p
                onClick={() => router.push(`/organizations/${organization.id}`)}
                className="text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer truncate"
              >
                {organization.name}
              </p>
              <Badge
                variant="outline"
                className={cn("gap-1 text-[10px] px-1.5 py-0.5 shrink-0 uppercase tracking-wide", badgeClass)}
              >
                {statusIcon}
                {status}
              </Badge>
            </div>
            {organization.industry && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {organization.industry}
              </p>
            )}
          </div>
        </div>

        {/* Center: Score + Metrics */}
        <div className="hidden md:flex items-center gap-5 shrink-0">
          <div className="text-center">
            <p
              className={cn(
                "text-base font-bold tabular-nums leading-none",
                status === "Healthy" ? "text-success" :
                status === "Needs Review" ? "text-warning" :
                status === "Critical" ? "text-danger" : "text-muted-foreground"
              )}
            >
              {scoreDisplay}
            </p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">Score</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <MetricPill icon={<FileText className="h-3 w-3" />} label="Policies" value={policyCount} />
            <MetricPill icon={<FileStack className="h-3 w-3" />} label="Regs" value={regulationCount} />
            <MetricPill icon={<BarChart3 className="h-3 w-3" />} label="Reports" value={reportCount} />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/reports?org=${organization.id}`)}
            className="h-7 px-2.5 text-xs gap-1 font-medium cursor-pointer"
          >
            <BarChart3 className="h-3 w-3" />
            <span>Reports</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/compliance")}
            className="h-7 px-2.5 text-xs gap-1 font-medium cursor-pointer"
          >
            <Zap className="h-3 w-3" />
            <span>Analyze</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent hover:bg-muted transition-colors cursor-pointer">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
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
      </div>
    );
  }

  // ── GRID CARD ──────────────────────────────────────────────────────────────
  return (
    <Card className="group flex flex-col h-full border border-border/50 bg-card hover:border-border hover:shadow-sm transition-all duration-150 overflow-hidden">
      {/* ── Card Top: Header ── */}
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
        {/* Row 1: Avatar + Name + Dropdown */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <OrgAvatar name={organization.name} logoUrl={organization.logo_url} />
            <div className="min-w-0">
              <p
                onClick={() => router.push(`/organizations/${organization.id}`)}
                className="text-sm font-semibold text-foreground leading-tight truncate group-hover:text-primary transition-colors cursor-pointer"
              >
                {organization.name}
              </p>
              {organization.industry && (
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {organization.industry}
                </p>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent opacity-0 group-hover:opacity-100 hover:bg-muted transition-all cursor-pointer">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => router.push(`/organizations/${organization.id}`)}
                className="gap-2 text-xs cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open Workspace
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push("/compliance")}
                className="gap-2 text-xs cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5" /> Run Analysis
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push(`/reports?org=${organization.id}`)}
                className="gap-2 text-xs cursor-pointer"
              >
                <BarChart3 className="h-3.5 w-3.5" /> View Reports
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onEdit(organization)}
                className="gap-2 text-xs cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Organization
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(organization.id)}
                className="gap-2 text-xs cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Row 2: Compliance Score + Status Badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-2xl font-bold tabular-nums tracking-tight leading-none",
                status === "Healthy" ? "text-success" :
                status === "Needs Review" ? "text-warning" :
                status === "Critical" ? "text-danger" : "text-muted-foreground"
              )}
            >
              {scoreDisplay}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium leading-tight">
              compliance<br />score
            </span>
          </div>

          <Badge
            variant="outline"
            className={cn(
              "gap-1 text-[10px] px-2 py-0.5 uppercase tracking-wide shrink-0",
              badgeClass
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} />
            {status}
          </Badge>
        </div>
      </div>

      {/* ── Card Middle: Metrics Grid ── */}
      <CardContent className="px-4 py-0 border-t border-border/30">
        <div className="grid grid-cols-4 divide-x divide-border/30 py-2.5">
          {[
            { label: "Policies", value: policyCount, icon: <FileText className="h-3 w-3" /> },
            { label: "Regs", value: regulationCount, icon: <FileStack className="h-3 w-3" /> },
            { label: "Docs", value: documentCount, icon: <FileText className="h-3 w-3" /> },
            { label: "Reports", value: reportCount, icon: <BarChart3 className="h-3 w-3" /> },
          ].map((m) => (
            <div key={m.label} className="flex flex-col items-center gap-0.5 px-1">
              <span className="text-sm font-bold text-foreground tabular-nums leading-none">
                {m.value}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>

      {/* ── Card Middle: Last Analysis + Activity ── */}
      {(lastAnalyzed || latestActivity) && (
        <div className="px-4 py-2 border-t border-border/30 space-y-1">
          {lastAnalyzed && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <RefreshCw className="h-3 w-3 shrink-0" />
              <span>Last analyzed <span className="font-semibold text-foreground">{lastAnalyzed}</span></span>
            </div>
          )}
          {latestActivity && (
            <p className="text-[11px] text-muted-foreground truncate">{latestActivity}</p>
          )}
        </div>
      )}

      {/* ── Card Actions ── */}
      <div className="px-4 py-2.5 border-t border-border/30 flex gap-1.5 mt-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/reports?org=${organization.id}`)}
          className="flex-1 h-7 text-xs gap-1 font-medium cursor-pointer"
        >
          <BarChart3 className="h-3 w-3" />
          View Reports
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/compliance")}
          className="flex-1 h-7 text-xs gap-1 font-medium cursor-pointer"
        >
          <Zap className="h-3 w-3" />
          Run Analysis
        </Button>
      </div>

      {/* ── Card Footer: Dates ── */}
      <CardFooter className="px-4 py-2 border-t border-border/30 bg-muted/20">
        <div className="flex items-center justify-between w-full gap-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>Created {createdDate}</span>
          </div>
          <span>Updated {updatedDate}</span>
        </div>
      </CardFooter>
    </Card>
  );
});

export default OrganizationCard;