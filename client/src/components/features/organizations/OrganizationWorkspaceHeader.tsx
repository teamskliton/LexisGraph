// OrganizationWorkspaceHeader — Header component for Organization Workspace
// Displays Breadcrumbs, Logo/Avatar, Org Name, Industry, Active Workspace indicator,
// Compliance Score badge, Last Updated timestamp, Organization Switcher, and CTAs.

"use client";

import React, { memo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Building2,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Calendar,
  Globe,
  Upload,
  Pencil,
  Sparkles,
  Zap,
} from "lucide-react";
import { OrganizationSwitcher } from "@/components/layout/OrganizationSwitcher";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Organization } from "@/services/api/organizations";

interface OrganizationWorkspaceHeaderProps {
  organization: Organization;
  complianceScore?: number | null;
  policyCount?: number;
  reportCount?: number;
  onEdit?: (org: Organization) => void;
}

function deriveStatus(score: number | null | undefined) {
  if (score == null) return { label: "Unknown", badgeClass: "bg-muted text-muted-foreground border-border", icon: null };
  if (score >= 85) return { label: "Healthy", badgeClass: "bg-success/10 text-success border-success/25 font-semibold", icon: <ShieldCheck className="h-3.5 w-3.5" /> };
  if (score >= 65) return { label: "Needs Review", badgeClass: "bg-warning/10 text-warning border-warning/25 font-semibold", icon: <ShieldAlert className="h-3.5 w-3.5" /> };
  return { label: "Critical Risk", badgeClass: "bg-danger/10 text-danger border-danger/25 font-semibold", icon: <ShieldX className="h-3.5 w-3.5" /> };
}

function OrgHeaderAvatar({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [logoUrl]);

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

  const hue =
    name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;

  if (isValidUrl && !imgError) {
    return (
      <div className="relative h-12 w-12 shrink-0 rounded-xl border border-border/60 bg-background overflow-hidden flex items-center justify-center shadow-2xs">
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
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/40 text-base font-extrabold select-none shadow-2xs"
      style={{
        background: `hsl(${hue} 45% 93%)`,
        color: `hsl(${hue} 60% 30%)`,
        borderColor: `hsl(${hue} 40% 80%)`,
      }}
    >
      {displayInitials}
    </div>
  );
}

export const OrganizationWorkspaceHeader = memo(function OrganizationWorkspaceHeader({
  organization,
  complianceScore,
  policyCount = 0,
  reportCount = 0,
  onEdit,
}: OrganizationWorkspaceHeaderProps) {
  const router = useRouter();

  const status = deriveStatus(complianceScore);
  const updatedDate = organization.updated_at
    ? format(new Date(organization.updated_at), "MMM d, yyyy")
    : "Recently";

  return (
    <div className="border-b border-border/40 bg-background/95 backdrop-blur-md sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 py-4 space-y-3">
        {/* Top Row: Breadcrumb & Workspace Switcher */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <button
              onClick={() => router.push("/dashboard")}
              className="hover:text-foreground transition-colors cursor-pointer"
            >
              Dashboard
            </button>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <button
              onClick={() => router.push("/organizations")}
              className="hover:text-foreground transition-colors cursor-pointer"
            >
              Organizations
            </button>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="font-medium text-foreground truncate max-w-[200px]">
              {organization.name}
            </span>
          </nav>

          {/* Switcher & Active Indicator */}
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1.5 text-[10px] uppercase font-semibold bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active Workspace
            </Badge>
            <NotificationBell organizationId={organization.id} />
            <OrganizationSwitcher />
          </div>
        </div>

        {/* Header Content: Logo/Avatar, Title, Industry, Score, CTAs */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pt-1">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            {/* Logo / Avatar Fallback */}
            <OrgHeaderAvatar name={organization.name} logoUrl={organization.logo_url} />

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl truncate">
                  {organization.name}
                </h1>
                <Badge variant="outline" className={cn("gap-1 text-xs px-2.5 py-0.5 uppercase tracking-wide shrink-0", status.badgeClass)}>
                  {status.icon}
                  {status.label}
                </Badge>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {organization.industry && (
                  <span className="font-medium text-foreground flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {organization.industry}
                  </span>
                )}

                {organization.website && (
                  <>
                    <span>•</span>
                    <a
                      href={organization.website.startsWith("http") ? organization.website : `https://${organization.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-primary transition-colors flex items-center gap-1"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {organization.website.replace(/^https?:\/\//, "")}
                    </a>
                  </>
                )}

                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Updated {updatedDate}
                </span>
              </div>

              {organization.description && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 max-w-3xl pt-0.5">
                  {organization.description}
                </p>
              )}
            </div>
          </div>

          {/* Right side: Score Highlight Box & CTAs */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-card shadow-2xs">
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                  Compliance Score
                </span>
                <span className="text-xl font-bold tabular-nums text-foreground leading-none">
                  {complianceScore != null ? `${Math.round(complianceScore)}%` : "—"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => router.push("/compliance")}
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5" />
                Run Analysis
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/documents")}
                className="gap-1.5 text-xs cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Policy
              </Button>

              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(organization)}
                  className="gap-1.5 text-xs cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Org
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
