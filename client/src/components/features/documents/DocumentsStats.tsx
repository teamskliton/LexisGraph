// DocumentsStats — Top KPI Summary cards for Workspace Documents page
// Displays 4 cards: Total Documents, Policies, Regulations, Ready For Analysis.
// Supports Loading, Empty, and Error states.

"use client";

import { memo } from "react";
import { FileText, Shield, BookOpen, Zap, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { OrganizationDocumentExtended } from "./documents-types";

interface DocumentsStatsProps {
  documents: OrganizationDocumentExtended[];
  isLoading?: boolean;
  isError?: boolean;
}

interface StatCardProps {
  title: string;
  count: number;
  subtitle: string;
  icon: React.ReactNode;
  colorClass: string;
  isLoading?: boolean;
  isError?: boolean;
}

function StatCard({
  title,
  count,
  subtitle,
  icon,
  colorClass,
  isLoading = false,
  isError = false,
}: StatCardProps) {
  return (
    <Card className="border border-border/50 bg-card hover:border-border hover:shadow-2xs transition-all duration-150">
      <CardContent className="p-4 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground truncate">
            {title}
          </span>
          <div className={cn("p-1.5 rounded-md bg-muted/50 shrink-0", colorClass)}>
            {icon}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-1.5 pt-1">
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
        ) : isError ? (
          <div className="pt-1">
            <span className="text-xs font-semibold text-danger flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> Error
            </span>
          </div>
        ) : (
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground leading-none tabular-nums">
              {count}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {subtitle}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const DocumentsStats = memo(function DocumentsStats({
  documents,
  isLoading = false,
  isError = false,
}: DocumentsStatsProps) {
  const totalCount = documents.length;
  const policiesCount = documents.filter((d) => d.category === "Policy").length;
  const regulationsCount = documents.filter((d) => d.category === "Regulation").length;
  const readyCount = documents.filter(
    (d) => d.status === "Analysis Ready" || d.status === "Knowledge Graph Ready"
  ).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        title="Total Documents"
        count={totalCount}
        subtitle="Across all categories"
        icon={<FileText className="h-4 w-4" />}
        colorClass="text-primary bg-primary/10"
        isLoading={isLoading}
        isError={isError}
      />

      <StatCard
        title="Policies"
        count={policiesCount}
        subtitle="Internal company guidelines"
        icon={<Shield className="h-4 w-4" />}
        colorClass="text-info bg-info/10"
        isLoading={isLoading}
        isError={isError}
      />

      <StatCard
        title="Regulations"
        count={regulationsCount}
        subtitle="Statutory acts & rules"
        icon={<BookOpen className="h-4 w-4" />}
        colorClass="text-success bg-success/10"
        isLoading={isLoading}
        isError={isError}
      />

      <StatCard
        title="Ready For Analysis"
        count={readyCount}
        subtitle="Indexed & graph ready"
        icon={<Zap className="h-4 w-4" />}
        colorClass="text-warning bg-warning/10"
        isLoading={isLoading}
        isError={isError}
      />
    </div>
  );
});
