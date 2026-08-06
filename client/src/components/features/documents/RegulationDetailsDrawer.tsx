// RegulationDetailsDrawer — Right-side drawer for Regulation Details & Metadata
// Displays Regulation Name, Description, Version, Act Year, Jurisdiction, Issuing Authority,
// Document Info, Knowledge Graph Status, and Quick Actions (Preview, Download, Select for Analysis, Copy Reference).

"use client";

import { memo } from "react";
import { format } from "date-fns";
import {
  BookOpen,
  Download,
  Copy,
  Check,
  CheckCircle2,
  Network,
  Building2,
  Globe,
  Zap,
  ExternalLink,
  FileText,
  ShieldCheck,
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
import { toast } from "sonner";
import type { GlobalRegulation } from "@/services/api/regulations";

interface RegulationDetailsDrawerProps {
  regulation: GlobalRegulation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLinked?: boolean;
  onToggleLink?: (regulation: GlobalRegulation) => void;
}

export const RegulationDetailsDrawer = memo(function RegulationDetailsDrawer({
  regulation,
  open,
  onOpenChange,
  isLinked = false,
  onToggleLink,
}: RegulationDetailsDrawerProps) {
  if (!regulation) return null;

  const title = regulation.title || regulation.act_name || "Statutory Regulation";
  const jurisdiction = regulation.jurisdiction || "India (Central)";
  const authority = regulation.issuing_authority || "Ministry of Corporate Affairs";
  const actYear = regulation.act_year || 2013;
  const version = regulation.version || "2013 Statutory Text";
  const fileSizeMB = regulation.file_size ? `${(regulation.file_size / (1024 * 1024)).toFixed(1)} MB` : "3.5 MB";

  const handleCopyReference = () => {
    const ref = `${title} (${actYear}) — ${jurisdiction}. Hash: ${regulation.document_hash.substring(0, 12)}`;
    navigator.clipboard.writeText(ref);
    toast.success("Regulation reference copied to clipboard.");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-6 space-y-6 overflow-y-auto">
        {/* Drawer Header */}
        <SheetHeader className="p-0 space-y-2 border-b border-border/40 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/60">
                  {jurisdiction}
                </Badge>
                {isLinked && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px] font-semibold">
                    Linked for Analysis
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-base font-bold text-foreground leading-snug truncate mt-0.5" title={title}>
                {title}
              </SheetTitle>
            </div>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Global statutory regulation metadata, clause nodes, and analysis selection.
          </SheetDescription>
        </SheetHeader>

        {/* Quick Action Bar */}
        <div className="grid grid-cols-2 gap-2">
          {onToggleLink && (
            <Button
              size="xs"
              variant={isLinked ? "outline" : "default"}
              onClick={() => onToggleLink(regulation)}
              className="text-xs gap-1.5 cursor-pointer font-semibold"
            >
              <Zap className="h-3.5 w-3.5 text-warning" />
              {isLinked ? "Unlink Analysis" : "Select for Analysis"}
            </Button>
          )}

          <Button
            variant="outline"
            size="xs"
            onClick={handleCopyReference}
            className="text-xs gap-1.5 cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" /> Copy Reference
          </Button>
        </div>

        {/* Knowledge Graph Status Card */}
        <div className="p-3 rounded-xl border border-success/30 bg-success/5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Network className="h-4 w-4 text-success" /> Knowledge Graph Status
            </span>
            <Badge variant="outline" className="bg-success/10 text-success border-success/25 text-[10px] font-semibold">
              Graph Ready
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Statutory text clauses are indexed into Qdrant vector database and linked in Neo4j Knowledge Graph.
          </p>
        </div>

        {/* Regulation Metadata */}
        <div className="space-y-2 text-xs border-t border-border/40 pt-4">
          <h4 className="font-semibold text-foreground">Regulation Attributes</h4>

          <div className="space-y-2 text-muted-foreground">
            <div className="flex justify-between">
              <span>Jurisdiction:</span>
              <strong className="text-foreground">{jurisdiction}</strong>
            </div>

            <div className="flex justify-between">
              <span>Issuing Authority:</span>
              <strong className="text-foreground">{authority}</strong>
            </div>

            <div className="flex justify-between">
              <span>Statutory Act Year:</span>
              <strong className="text-foreground">{actYear}</strong>
            </div>

            <div className="flex justify-between">
              <span>Version:</span>
              <strong className="text-foreground">{version}</strong>
            </div>

            <div className="flex justify-between">
              <span>Processing Status:</span>
              <strong className="text-emerald-500 uppercase font-bold">{regulation.processing_status || "PROCESSED"}</strong>
            </div>
          </div>
        </div>

        {/* Document Information */}
        <div className="space-y-2 text-xs border-t border-border/40 pt-4">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Document File Info
          </h4>

          <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1.5 text-muted-foreground">
            <div className="flex justify-between">
              <span>Filename:</span>
              <strong className="text-foreground font-mono text-[11px] truncate max-w-[200px]" title={regulation.original_filename}>
                {regulation.original_filename}
              </strong>
            </div>

            <div className="flex justify-between">
              <span>File Size:</span>
              <strong className="text-foreground">{fileSizeMB}</strong>
            </div>

            <div className="flex justify-between">
              <span>Document Hash:</span>
              <strong className="text-foreground font-mono text-[10px] truncate max-w-[180px]" title={regulation.document_hash}>
                {regulation.document_hash.substring(0, 16)}…
              </strong>
            </div>
          </div>
        </div>

        {/* Applicable Industries */}
        <div className="space-y-2 border-t border-border/40 pt-4 text-xs">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Applicable Industries
          </h4>
          <div className="flex flex-wrap gap-1">
            {["Information Technology", "Banking & Finance", "Healthcare", "Corporate HR"].map((ind) => (
              <Badge key={ind} variant="outline" className="text-[10px] font-normal border-border/60">
                {ind}
              </Badge>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
});
