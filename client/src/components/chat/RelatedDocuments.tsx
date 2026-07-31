"use client";

import React from "react";
import { BookOpen, ExternalLink, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface RelatedDocumentItem {
  id: string;
  title: string;
  similarity: number;
}

interface RelatedDocumentsProps {
  documents: RelatedDocumentItem[];
  onOpenDocument?: (docId: string) => void;
}

export function RelatedDocuments({ documents, onOpenDocument }: RelatedDocumentsProps) {
  if (!documents || documents.length === 0) return null;

  return (
    <div className="pt-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
        <span>Related Corpus Documents ({documents.length}):</span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
        {documents.map((doc, idx) => (
          <Card
            key={idx}
            className="bg-card/70 hover:bg-muted/50 border-border/80 text-xs transition-all shadow-sm shrink-0 w-64 group"
          >
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground truncate flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">{doc.title}</span>
                </span>
                <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded font-medium border border-emerald-500/20 shrink-0">
                  {(doc.similarity * 100).toFixed(0)}% match
                </span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-muted-foreground">ID: {doc.id.slice(0, 8)}...</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenDocument && onOpenDocument(doc.id)}
                  className="h-6 px-2 text-[11px] gap-1 text-indigo-600 dark:text-indigo-400"
                >
                  <span>Open</span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
