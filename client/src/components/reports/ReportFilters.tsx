"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RotateCcw, Filter, ArrowUpDown } from "lucide-react";

export interface FilterState {
  status: string;
  orgSearch: string;
  idSearch: string;
  sortOrder: "newest" | "oldest";
}

interface ReportFiltersProps {
  filters: FilterState;
  onFilterChange: (updated: Partial<FilterState>) => void;
  onReset: () => void;
  disabled?: boolean;
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({
  filters,
  onFilterChange,
  onReset,
  disabled = false,
}) => {
  const isFiltered =
    filters.status !== "ALL" ||
    filters.orgSearch.trim() !== "" ||
    filters.idSearch.trim() !== "" ||
    filters.sortOrder !== "newest";

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Search Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          {/* Search by Report ID */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by Report ID..."
              value={filters.idSearch}
              onChange={(e) => onFilterChange({ idSearch: e.target.value })}
              disabled={disabled}
              className="pl-9 bg-background"
            />
          </div>

          {/* Search by Organization */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by Organization..."
              value={filters.orgSearch}
              onChange={(e) => onFilterChange({ orgSearch: e.target.value })}
              disabled={disabled}
              className="pl-9 bg-background"
            />
          </div>
        </div>

        {/* Dropdown Filters & Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 min-w-[140px]">
            <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <select
              value={filters.status}
              onChange={(e) => onFilterChange({ status: e.target.value })}
              disabled={disabled}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PROCESSING">Processing</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="flex items-center gap-1.5 min-w-[140px]">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <select
              value={filters.sortOrder}
              onChange={(e) =>
                onFilterChange({
                  sortOrder: e.target.value as "newest" | "oldest",
                })
              }
              disabled={disabled}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>

          {/* Reset Filters */}
          {isFiltered && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              disabled={disabled}
              className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportFilters;
