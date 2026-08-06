// DocumentRow — Table/List row component for single document
// Displays File Icon, Name, Category, Size, Version, Upload Date, Uploaded By,
// Processing Status badge, and Quick Actions.

"use client";

import { memo } from "react";
import { format } from "date-fns";
import {
  FileText,
  Eye,
  Download,
  Pencil,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProcessingBadge } from "./ProcessingBadge";
import { cn } from "@/lib/utils";
import type { OrganizationDocumentExtended } from "./documents-types";

interface DocumentRowProps {
  document: OrganizationDocumentExtended;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onPreview: (doc: OrganizationDocumentExtended) => void;
  onRename?: (id: string, currentName: string) => void;
  onReplace?: (doc: OrganizationDocumentExtended) => void;
  onDownload?: (doc: OrganizationDocumentExtended) => void;
  onDelete?: (id: string) => void;
}

export const DocumentRow = memo(function DocumentRow({
  document,
  isSelected = false,
  onSelect,
  onPreview,
  onRename,
  onReplace,
  onDownload,
  onDelete,
}: DocumentRowProps) {
  const uploadedDate = format(new Date(document.uploaded_at), "MMM d, yyyy");

  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-4 p-2.5 px-3 rounded-lg border border-border/50 bg-card hover:border-border hover:shadow-2xs transition-all duration-150",
        isSelected && "border-primary ring-1 ring-primary/40 bg-primary/5"
      )}
    >
      {/* Left: Checkbox + Icon + Name + Category */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {onSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(document.id)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer shrink-0"
          />
        )}

        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary shrink-0">
          <FileText className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onPreview(document)}
              className="text-xs font-semibold text-foreground hover:text-primary transition-colors truncate max-w-sm text-left"
              title={document.name}
            >
              {document.name}
            </button>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal border-border/60 shrink-0">
              {document.version}
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
            <span className="font-medium">{document.category}</span>
            <span>•</span>
            <span>{document.file_size}</span>
          </div>
        </div>
      </div>

      {/* Center: Processing Status Badge */}
      <div className="hidden sm:flex items-center gap-3 shrink-0">
        <ProcessingBadge status={document.status} />
      </div>

      {/* Right: Uploaded By + Upload Date + Actions */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden md:flex flex-col text-right text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground flex items-center gap-1 justify-end">
            <User className="h-3 w-3" /> {document.uploaded_by}
          </span>
          <span>{uploadedDate}</span>
        </div>

        <Button
          variant="outline"
          size="xs"
          onClick={() => onPreview(document)}
          className="text-xs gap-1 cursor-pointer"
        >
          <Eye className="h-3 w-3" />
          <span className="hidden sm:inline">Preview</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent hover:bg-muted transition-colors cursor-pointer">
            <MoreHorizontal className="h-4 w-4 text-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">Document Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onPreview(document)} className="gap-2 text-xs cursor-pointer">
              <Eye className="h-3.5 w-3.5" /> Preview Details
            </DropdownMenuItem>
            {onRename && (
              <DropdownMenuItem onClick={() => onRename(document.id, document.name)} className="gap-2 text-xs cursor-pointer">
                <Pencil className="h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>
            )}
            {onReplace && (
              <DropdownMenuItem onClick={() => onReplace(document)} className="gap-2 text-xs cursor-pointer">
                <RefreshCw className="h-3.5 w-3.5" /> Replace File
              </DropdownMenuItem>
            )}
            {onDownload && (
              <DropdownMenuItem onClick={() => onDownload(document)} className="gap-2 text-xs cursor-pointer">
                <Download className="h-3.5 w-3.5" /> Download
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {onDelete && (
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(document.id)} className="gap-2 text-xs cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
