// DocumentPreviewDrawer — Right-side drawer component for Document Details & Preview
// Displays Metadata, Preview Placeholder, Processing Status, Version, Tags, Upload History, Quick Actions.

"use client";

import { memo } from "react";
import { format } from "date-fns";
import {
  FileText,
  Download,
  Trash2,
  RefreshCw,
  Layers,
  Network,
  History,
  Tag,
  Zap,
  BarChart3,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProcessingBadge } from "./ProcessingBadge";
import type { OrganizationDocumentExtended } from "./documents-types";

interface DocumentPreviewDrawerProps {
  document: OrganizationDocumentExtended | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload?: (doc: OrganizationDocumentExtended) => void;
  onDelete?: (id: string) => void;
}

export const DocumentPreviewDrawer = memo(function DocumentPreviewDrawer({
  document,
  open,
  onOpenChange,
  onDownload,
  onDelete,
}: DocumentPreviewDrawerProps) {
  if (!document) return null;

  const uploadedDate = format(new Date(document.uploaded_at), "MMM d, yyyy · HH:mm");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-6 space-y-6 overflow-y-auto">
        {/* Drawer Header */}
        <SheetHeader className="p-0 space-y-2 border-b border-border/40 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/60">
                {document.category}
              </Badge>
              <SheetTitle className="text-base font-bold text-foreground truncate mt-0.5" title={document.name}>
                {document.name}
              </SheetTitle>
            </div>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Document metadata, extracted clauses, and version history.
          </SheetDescription>
        </SheetHeader>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          {onDownload && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => onDownload(document)}
              className="text-xs gap-1.5 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          )}

          <Button
            variant="outline"
            size="xs"
            onClick={() => window.location.assign("/compliance")}
            className="text-xs gap-1.5 cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5 text-warning" /> Run Analysis
          </Button>

          <Button
            variant="outline"
            size="xs"
            onClick={() => window.location.assign("/reports")}
            className="text-xs gap-1.5 cursor-pointer"
          >
            <BarChart3 className="h-3.5 w-3.5 text-primary" /> View Reports
          </Button>

          {onDelete && (
            <Button
              variant="destructive"
              size="xs"
              onClick={() => {
                onDelete(document.id);
                onOpenChange(false);
              }}
              className="text-xs gap-1.5 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
        </div>

        {/* Processing Status Banner */}
        <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">Processing Status</span>
            <ProcessingBadge status={document.status} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="p-2 rounded bg-card border border-border/30 flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <div>
                <span className="font-bold text-foreground block">{document.clause_count ?? 0}</span>
                <span className="text-[10px] text-muted-foreground">Clauses Extracted</span>
              </div>
            </div>

            <div className="p-2 rounded bg-card border border-border/30 flex items-center gap-2">
              <Network className="h-4 w-4 text-success" />
              <div>
                <span className="font-bold text-foreground block">{document.extracted_nodes ?? 0}</span>
                <span className="text-[10px] text-muted-foreground">Graph Nodes</span>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Placeholder */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">Document Content Preview</span>
          <div className="p-4 rounded-xl border border-dashed border-border/60 bg-muted/10 h-44 flex flex-col items-center justify-center text-center space-y-2">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-xs text-muted-foreground max-w-xs">
              PDF / Text Preview Placeholder. Full inline viewer available in enterprise mode.
            </p>
          </div>
        </div>

        {/* File Metadata List */}
        <div className="space-y-2 text-xs border-t border-border/40 pt-4">
          <h4 className="font-semibold text-foreground">File Attributes</h4>

          <div className="space-y-1.5 text-muted-foreground">
            <div className="flex justify-between">
              <span>Version:</span>
              <strong className="text-foreground">{document.version}</strong>
            </div>

            <div className="flex justify-between">
              <span>File Size:</span>
              <strong className="text-foreground">{document.file_size}</strong>
            </div>

            <div className="flex justify-between">
              <span>File Format:</span>
              <strong className="text-foreground uppercase">{document.file_type}</strong>
            </div>

            <div className="flex justify-between">
              <span>Uploaded By:</span>
              <strong className="text-foreground">{document.uploaded_by}</strong>
            </div>

            <div className="flex justify-between">
              <span>Upload Date:</span>
              <strong className="text-foreground">{uploadedDate}</strong>
            </div>
          </div>
        </div>

        {/* Tags */}
        {document.tags.length > 0 && (
          <div className="space-y-2 border-t border-border/40 pt-4">
            <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" /> Tags
            </h4>
            <div className="flex flex-wrap gap-1">
              {document.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs font-normal border-border/60">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Upload History */}
        {document.history && document.history.length > 0 && (
          <div className="space-y-2 border-t border-border/40 pt-4 text-xs">
            <h4 className="font-semibold text-foreground flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-muted-foreground" /> Version History
            </h4>

            <div className="space-y-2 pl-2 border-l border-border/60">
              {document.history.map((h) => (
                <div key={h.id} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{h.version}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(h.uploaded_at), "MMM d, yyyy")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{h.action}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
});
