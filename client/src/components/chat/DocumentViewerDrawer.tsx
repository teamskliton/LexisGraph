"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  FileText,
  Copy,
  Check,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SourceCitation } from "@/services/chat-service";
import { RelatedKnowledgePanel } from "./RelatedKnowledgePanel";
import { documentService, DocumentViewerPayload } from "@/services/document-service";

interface DocumentViewerDrawerProps {
  source?: SourceCitation | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  documentId?: string;
  clauseId?: string;
  onClose?: () => void;
}

export function DocumentViewerDrawer({
  source,
  open,
  onOpenChange,
  documentId,
  clauseId,
  onClose,
}: DocumentViewerDrawerProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(source?.page || 1);
  const [viewerData, setViewerData] = useState<DocumentViewerPayload | null>(null);
  const [clauseDetail, setClauseDetail] = useState<{ text?: string; section?: string; title?: string } | null>(null);

  const effectiveDocId = source?.document_id || documentId;
  const effectiveClauseId = source?.clause_id || clauseId;
  const isOpen = open !== undefined ? open : Boolean(source || documentId);

  const handleClose = () => {
    if (onClose) onClose();
    if (onOpenChange) onOpenChange(false);
  };

  useEffect(() => {
    if (!effectiveDocId) return;

    const loadViewerData = async () => {
      try {
        const data = await documentService.getDocumentViewer(effectiveDocId);
        setViewerData(data);
        if (data.page_number) setCurrentPage(data.page_number);
      } catch (err) {
        console.error("Failed to load document viewer payload:", err);
      }
    };

    loadViewerData();
  }, [effectiveDocId]);

  useEffect(() => {
    if (!effectiveClauseId) return;

    const loadClause = async () => {
      try {
        const detail = await documentService.getClauseDetail(effectiveClauseId);
        if (detail && detail.text) {
          setClauseDetail({
            text: detail.text,
            section: detail.section,
            title: detail.title,
          });
        }
      } catch (err) {
        console.error("Failed to load clause detail:", err);
      }
    };

    loadClause();
  }, [effectiveClauseId]);

  if (!isOpen) return null;

  const displaySource = {
    document_id: effectiveDocId,
    clause_id: effectiveClauseId,
    document: source?.document || clauseDetail?.title || viewerData?.title || "Legal Document",
    section: source?.section || clauseDetail?.section || "Section",
    clause: source?.clause || clauseDetail?.text || "Regulation clause context snippet",
    page: source?.page || currentPage,
    confidence_score: source?.confidence_score || 0.9,
    search_source: source?.search_source || "Vector Search",
    type: source?.type || "Regulation",
  };

  const handleCopyClause = () => {
    navigator.clipboard.writeText(displaySource.clause);
    setCopied(true);
    toast.success("Clause text copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    toast.success(`Downloading ${displaySource.document}...`);
  };

  const handleOpenFullDoc = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    const docId = displaySource.document_id || "doc-1";
    window.open(`${baseUrl}/documents/${docId}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl h-full bg-background border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-card/60 shrink-0">
          <div className="flex items-center gap-3 truncate">
            <div className="p-2 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="truncate">
              <h2 className="font-bold text-sm text-foreground truncate">{displaySource.document}</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{displaySource.section || "Section"}</span>
                <span>•</span>
                <span className="px-1.5 py-0.5 text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded font-medium border border-indigo-500/20">
                  {displaySource.type || "Regulation"}
                </span>
                <span>•</span>
                <span className="font-semibold text-emerald-500">
                  {((displaySource.confidence_score || 0.9) * 100).toFixed(0)}% match
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8 rounded-lg">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="px-4 py-2 border-b border-border/60 bg-muted/30 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center gap-1">
            {/* Page Controls */}
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            <span className="px-2 font-medium text-foreground">
              Page {currentPage} of {viewerData?.page_number || 42}
            </span>

            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>

            {/* Zoom Controls */}
            <div className="ml-2 flex items-center gap-1 border-l border-border pl-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="px-1.5 text-[11px] font-medium text-muted-foreground">{zoomLevel}%</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleCopyClause} className="h-7 text-xs gap-1">
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? "Copied" : "Copy Clause"}</span>
            </Button>

            <Button variant="outline" size="sm" onClick={handleOpenFullDoc} className="h-7 text-xs gap-1">
              <ExternalLink className="h-3 w-3" />
              <span>Full Doc</span>
            </Button>

            <Button variant="outline" size="sm" onClick={handleDownload} className="h-7 text-xs gap-1">
              <Download className="h-3 w-3" />
              <span>Download</span>
            </Button>
          </div>
        </div>

        {/* Scrollable Viewer Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Highlighted Clause Preview Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-indigo-500" />
                <span>Target Clause & Citation Text (Page {currentPage})</span>
              </span>
              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-[10px]">
                High Confidence Context
              </span>
            </div>

            <div
              className="p-5 bg-card border-2 border-indigo-500/40 rounded-2xl shadow-sm space-y-3 relative transition-all"
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top left" }}
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  {displaySource.section || "Clause Content"}
                </span>
                <span className="text-[10px] text-muted-foreground">ID: {displaySource.clause_id || "clause-101"}</span>
              </div>

              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap font-serif bg-indigo-500/5 p-3 rounded-xl border border-indigo-500/20">
                &quot;{displaySource.clause}&quot;
              </p>

              <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
                <span>Source: {displaySource.search_source}</span>
                <span>Page: {currentPage}</span>
              </div>
            </div>
          </div>

          {/* Related Knowledge Panel (Neo4j Graph Integration) */}
          <RelatedKnowledgePanel clauseId={displaySource.clause_id || "clause-101"} />
        </div>
      </div>
    </div>
  );
}
