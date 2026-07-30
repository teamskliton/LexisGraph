"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RotateCcw, Filter, ArrowUpDown, Building2, BookOpen, Calendar, ShieldAlert, FileText } from "lucide-react";

export interface FilterState {
  organizationId: string;
  regulationId: string;
  status: string;
  riskLevel: string;
  startDate: string;
  endDate: string;
  reportId: string;
  policyName: string;
  sortOrder: "newest" | "oldest" | "highest_score" | "lowest_score";
}

export interface OrganizationOption {
  id: string;
  name: string;
}

export interface RegulationOption {
  id: string;
  title: string;
  original_filename?: string;
}

interface ReportFiltersProps {
  filters: FilterState;
  organizations?: OrganizationOption[];
  regulations?: RegulationOption[];
  onFilterChange: (updated: Partial<FilterState>) => void;
  onReset: () => void;
  disabled?: boolean;
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({
  filters,
  organizations = [],
  regulations = [],
  onFilterChange,
  onReset,
  disabled = false,
}) => {
  const isFiltered =
    filters.organizationId !== "ALL" ||
    filters.regulationId !== "ALL" ||
    filters.status !== "ALL" ||
    filters.riskLevel !== "ALL" ||
    filters.startDate !== "" ||
    filters.endDate !== "" ||
    filters.reportId.trim() !== "" ||
    filters.policyName.trim() !== "" ||
    filters.sortOrder !== "newest";

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm space-y-4">
      {/* Search Bar Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Search by Report ID */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by Report ID..."
            value={filters.reportId}
            onChange={(e) => onFilterChange({ reportId: e.target.value })}
            disabled={disabled}
            className="pl-9 bg-background"
          />
        </div>

        {/* Search by Policy Name */}
        <div className="relative">
          <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by Policy Document Name..."
            value={filters.policyName}
            onChange={(e) => onFilterChange({ policyName: e.target.value })}
            disabled={disabled}
            className="pl-9 bg-background"
          />
        </div>
      </div>

      {/* Dropdown Filters & Controls Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 pt-1">
        {/* Organization Filter */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
            <Building2 className="h-3 w-3" /> Org
          </label>
          <select
            value={filters.organizationId}
            onChange={(e) => onFilterChange({ organizationId: e.target.value })}
            disabled={disabled}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 truncate"
          >
            <option value="ALL">All Organizations</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {/* Regulation Filter */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
            <BookOpen className="h-3 w-3" /> Regulation
          </label>
          <select
            value={filters.regulationId}
            onChange={(e) => onFilterChange({ regulationId: e.target.value })}
            disabled={disabled}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 truncate"
          >
            <option value="ALL">All Regulations</option>
            {regulations.map((reg) => (
              <option key={reg.id} value={reg.id}>
                {reg.title || reg.original_filename || reg.id.substring(0, 8)}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
            <Filter className="h-3 w-3" /> Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange({ status: e.target.value })}
            disabled={disabled}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PROCESSING">Processing</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>

        {/* Risk Level Filter */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
            <ShieldAlert className="h-3 w-3" /> Risk Level
          </label>
          <select
            value={filters.riskLevel}
            onChange={(e) => onFilterChange({ riskLevel: e.target.value })}
            disabled={disabled}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="ALL">All Risk Levels</option>
            <option value="LOW">Low Risk (≥85%)</option>
            <option value="MEDIUM">Medium Risk (70-84%)</option>
            <option value="HIGH">High Risk (50-69%)</option>
            <option value="CRITICAL">Critical Risk (&lt;50%)</option>
          </select>
        </div>

        {/* Start Date */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
            <Calendar className="h-3 w-3" /> From Date
          </label>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) => onFilterChange({ startDate: e.target.value })}
            disabled={disabled}
            className="h-9 text-xs bg-background px-2"
          />
        </div>

        {/* End Date */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
            <Calendar className="h-3 w-3" /> To Date
          </label>
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) => onFilterChange({ endDate: e.target.value })}
            disabled={disabled}
            className="h-9 text-xs bg-background px-2"
          />
        </div>

        {/* Sort Order */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
            <ArrowUpDown className="h-3 w-3" /> Sorting
          </label>
          <select
            value={filters.sortOrder}
            onChange={(e) =>
              onFilterChange({
                sortOrder: e.target.value as "newest" | "oldest" | "highest_score" | "lowest_score",
              })
            }
            disabled={disabled}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="highest_score">Highest Score</option>
            <option value="lowest_score">Lowest Score</option>
          </select>
        </div>
      </div>

      {/* Reset Bar */}
      {isFiltered && (
        <div className="flex justify-end pt-1 border-t border-border/40">
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={disabled}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset All Filters</span>
          </Button>
        </div>
      )}
    </div>
  );
};

export default ReportFilters;
