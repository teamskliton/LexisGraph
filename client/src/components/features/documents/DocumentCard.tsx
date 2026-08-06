// DocumentCard — Grid card component for single document
// Displays File Icon, Name, Category, File Size, Version, Upload Date, Uploaded By,
// Processing Status badge, Tags, and Quick Actions (Preview, Rename, Replace, Download, Delete).

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
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface DocumentCardProps {
  document: OrganizationDocumentExtended;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onPreview: (doc: OrganizationDocumentExtended) => void;
  onRename?: (id: string, currentName: string) => void;
  onReplace?: (doc: OrganizationDocumentExtended) => void;
  onDownload?: (doc: OrganizationDocumentExtended) => void;
  onDelete?: (id: string) => void;
}

export const DocumentCard = memo(function DocumentCard({
  document,
  isSelected = false,
  onSelect,
  onPreview,
  onRename,
  onReplace,
  onDownload,
  onDelete,
}: DocumentCardProps) {
  const uploadedDate = format(new Date(document.uploaded_at), "MMM d, yyyy");

  return (
    <Card
      className={cn(
        "group flex flex-col h-full border border-border/50 bg-card hover:border-border hover:shadow-2xs transition-all duration-150 overflow-hidden",
        isSelected && "border-primary ring-1 ring-primary/40 bg-primary/5"
      )}
    >
      {/* Top Bar: Checkbox + File Icon + Status + Dropdown */}
      <div className="p-4 pb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {onSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onSelect(document.id)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
            />
          )}

          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <FileText className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <h3
              onClick={() => onPreview(document)}
              className="text-xs font-semibold text-foreground leading-tight truncate group-hover:text-primary transition-colors cursor-pointer"
              title={document.name}
            >
              {document.name}
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
              <span className="font-medium">{document.category}</span>
              <span>•</span>
              <span className="bg-muted px-1.5 py-0.2 rounded">{document.version}</span>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent opacity-0 group-hover:opacity-100 hover:bg-muted transition-all cursor-pointer">
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

      {/* Content: Processing Badge & Tags */}
      <CardContent className="px-4 py-2 space-y-2 flex-1">
        <div className="flex items-center justify-between gap-2">
          <ProcessingBadge status={document.status} />
          <span className="text-[10px] text-muted-foreground font-medium">{document.file_size}</span>
        </div>

        {document.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {document.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 font-normal border-border/50">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      {/* Footer: User & Date + Quick Action Buttons */}
      <CardFooter className="px-4 py-2 border-t border-border/30 bg-muted/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{document.uploaded_by}</span>
          <span>•</span>
          <span>{uploadedDate}</span>
        </div>

        <Button
          variant="outline"
          size="xs"
          onClick={() => onPreview(document)}
          className="text-xs gap-1 cursor-pointer shrink-0"
        >
          <Eye className="h-3 w-3" /> Preview
        </Button>
      </CardFooter>
    </Card>
  );
});
