"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Filter,
  Calendar,
  ShieldAlert,
  ArrowUpDown,
  FileCheck,
} from "lucide-react";

export interface FilterState {
  search: string;
  riskLevel: string;
  sortOrder: "newest" | "oldest" | "highest_score" | "lowest_score";
  regulationId: string;
  status: string;
  startDate: string;
  endDate: string;
  reportId: string;
}

export interface RegulationOption {
  id: string;
  title: string;
  act_name?: string;
  original_filename?: string;
}

interface ReportFiltersProps {
  filters: FilterState;
  regulations?: RegulationOption[];
  onFilterChange: (updated: Partial<FilterState>) => void;
  onReset: () => void;
  disabled?: boolean;
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({
  filters,
  regulations = [],
  onFilterChange,
  onReset,
  disabled = false,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasAdvancedFilters =
    filters.regulationId !== "ALL" ||
    filters.status !== "ALL" ||
    filters.startDate !== "" ||
    filters.endDate !== "" ||
    filters.reportId.trim() !== "";

  const isFiltered =
    filters.search.trim() !== "" ||
    filters.riskLevel !== "ALL" ||
    filters.sortOrder !== "newest" ||
    hasAdvancedFilters;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm space-y-3">
      {/* Primary Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Unified Search Input */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search reports, policies, or regulations..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            disabled={disabled}
            className="pl-9 bg-background h-9 text-xs sm:text-sm"
          />
        </div>

        {/* Risk Level Filter */}
        <div className="flex items-center gap-2">
          <select
            value={filters.riskLevel}
            onChange={(e) => onFilterChange({ riskLevel: e.target.value })}
            disabled={disabled}
            aria-label="Risk Level"
            className="h-9 min-w-[130px] rounded-lg border border-input bg-background px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="ALL">All Risks</option>
            <option value="CRITICAL">Critical Risk</option>
            <option value="HIGH">High Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="LOW">Low Risk</option>
          </select>

          {/* Sort By Dropdown */}
          <select
            value={filters.sortOrder}
            onChange={(e) =>
              onFilterChange({
                sortOrder: e.target.value as FilterState["sortOrder"],
              })
            }
            disabled={disabled}
            aria-label="Sort order"
            className="h-9 min-w-[150px] rounded-lg border border-input bg-background px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="highest_score">Highest Compliance Score</option>
            <option value="lowest_score">Lowest Compliance Score</option>
          </select>

          {/* Advanced Filters Toggle Button */}
          <Button
            type="button"
            variant={showAdvanced || hasAdvancedFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="h-9 gap-1.5 text-xs shrink-0 cursor-pointer"
            title="Toggle advanced filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Advanced</span>
            {hasAdvancedFilters && (
              <span className="h-2 w-2 rounded-full bg-primary" />
            )}
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Reset Action (only visible when filters are applied) */}
          {isFiltered && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={disabled}
              className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
              title="Reset all filters"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Advanced Filters Section */}
      {showAdvanced && (
        <div className="pt-3 border-t border-border/50 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in-50 duration-150">
          {/* Regulation Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
              <BookOpen className="h-3 w-3" /> Regulation
            </label>
            <select
              value={filters.regulationId}
              onChange={(e) => onFilterChange({ regulationId: e.target.value })}
              disabled={disabled}
              className="h-8.5 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 truncate"
            >
              <option value="ALL">All Regulations</option>
              {regulations.map((reg) => (
                <option key={reg.id} value={reg.id}>
                  {reg.title || reg.act_name || reg.original_filename || reg.id.substring(0, 8)}
                </option>
              ))}
            </select>
          </div>

          {/* Report Status */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
              <Filter className="h-3 w-3" /> Report Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => onFilterChange({ status: e.target.value })}
              disabled={disabled}
              className="h-8.5 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PROCESSING">Processing</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending / Queued</option>
            </select>
          </div>

          {/* Date Range: From Date */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
              <Calendar className="h-3 w-3" /> From Date
            </label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => onFilterChange({ startDate: e.target.value })}
              disabled={disabled}
              className="h-8.5 text-xs bg-background px-2"
            />
          </div>

          {/* Date Range: To Date */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
              <Calendar className="h-3 w-3" /> To Date
            </label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => onFilterChange({ endDate: e.target.value })}
              disabled={disabled}
              className="h-8.5 text-xs bg-background px-2"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportFilters;
