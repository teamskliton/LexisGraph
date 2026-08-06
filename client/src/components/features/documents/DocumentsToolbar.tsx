// DocumentsToolbar — Filter & action toolbar for Documents page
// Features: Search, Type Filter, Status Filter, Sort Dropdown, List/Grid View Toggle,
// Refresh, Selection Counter, and Bulk Action bar.

"use client";

import { memo } from "react";
import {
  Search,
  X,
  LayoutGrid,
  List,
  ChevronDown,
  RefreshCw,
  Trash2,
  CheckSquare,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DocumentCategory, ProcessingStatus } from "./documents-types";
import type { DocumentSortKey } from "@/hooks/use-documents";

interface DocumentsToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;

  typeFilter: "All" | DocumentCategory;
  onTypeFilterChange: (t: "All" | DocumentCategory) => void;

  statusFilter: "All" | ProcessingStatus;
  onStatusFilterChange: (s: "All" | ProcessingStatus) => void;

  sortKey: DocumentSortKey;
  onSortKeyChange: (k: DocumentSortKey) => void;

  viewMode: "grid" | "list";
  onViewModeChange: (v: "grid" | "list") => void;

  selectedCount: number;
  onClearSelection: () => void;
  onBulkDelete?: () => void;

  onRefresh: () => void;
  isRefreshing?: boolean;
}

const TYPE_FILTERS: Array<{ label: string; value: "All" | DocumentCategory }> = [
  { label: "All Types", value: "All" },
  { label: "Policies", value: "Policy" },
  { label: "Regulations", value: "Regulation" },
  { label: "Supporting Docs", value: "Supporting Document" },
];

const STATUS_FILTERS: Array<{ label: string; value: "All" | ProcessingStatus }> = [
  { label: "All Statuses", value: "All" },
  { label: "Analysis Ready", value: "Analysis Ready" },
  { label: "Graph Ready", value: "Knowledge Graph Ready" },
  { label: "Indexed", value: "Indexed" },
  { label: "Parsing", value: "Parsing" },
  { label: "Uploaded", value: "Uploaded" },
  { label: "Error", value: "Error" },
];

const SORT_OPTIONS: Array<{ label: string; value: DocumentSortKey }> = [
  { label: "Date Uploaded", value: "uploaded_at" },
  { label: "File Name", value: "name" },
  { label: "File Size", value: "file_size" },
];

export const DocumentsToolbar = memo(function DocumentsToolbar({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  sortKey,
  onSortKeyChange,
  viewMode,
  onViewModeChange,
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onRefresh,
  isRefreshing = false,
}: DocumentsToolbarProps) {
  const currentSortLabel = SORT_OPTIONS.find((s) => s.value === sortKey)?.label ?? "Sort";
  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className="space-y-2">
      {/* Primary Toolbar Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search documents by name, category, tag…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-8 pl-8 pr-8 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
          />
          {hasSearch && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 flex-wrap">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onTypeFilterChange(f.value)}
              className={cn(
                "h-7 px-2.5 rounded-md text-xs font-medium transition-colors border whitespace-nowrap",
                typeFilter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-border-strong"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted hover:border-border-strong transition-colors cursor-pointer">
            Status: {statusFilter}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">Filter by Status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUS_FILTERS.map((s) => (
              <DropdownMenuItem
                key={s.value}
                onClick={() => onStatusFilterChange(s.value)}
                className={cn("text-xs cursor-pointer", statusFilter === s.value && "font-semibold text-primary")}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted hover:border-border-strong transition-colors cursor-pointer">
            Sort: {currentSortLabel}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SORT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => onSortKeyChange(opt.value)}
                className={cn("text-xs cursor-pointer", sortKey === opt.value && "font-semibold text-primary")}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="h-7 px-2 text-xs gap-1 cursor-pointer"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
        </Button>

        {/* Grid/List View Toggle */}
        <div className="flex items-center border border-border rounded-md overflow-hidden h-7">
          <button
            onClick={() => onViewModeChange("list")}
            className={cn(
              "px-2 h-full flex items-center transition-colors",
              viewMode === "list"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-full bg-border" />
          <button
            onClick={() => onViewModeChange("grid")}
            className={cn(
              "px-2 h-full flex items-center transition-colors",
              viewMode === "grid"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Selection Action Bar (Appears when items are selected) */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between p-2 px-3 rounded-lg border border-primary/20 bg-primary/5 text-xs">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">
              {selectedCount} document{selectedCount > 1 ? "s" : ""} selected
            </span>
            <button
              onClick={onClearSelection}
              className="text-muted-foreground hover:text-foreground underline ml-2 cursor-pointer"
            >
              Deselect All
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onBulkDelete && (
              <Button
                variant="destructive"
                size="xs"
                onClick={onBulkDelete}
                className="gap-1 text-xs cursor-pointer"
              >
                <Trash2 className="h-3 w-3" /> Delete Selected
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
