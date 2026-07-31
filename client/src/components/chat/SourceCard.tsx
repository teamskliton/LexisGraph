"use client";

import React, { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, ShieldCheck, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SourceCitation } from "@/services/chat-service";
import { DocumentViewerDrawer } from "./DocumentViewerDrawer";

interface SourceCardProps {
  sources: SourceCitation[];
  onSelectSource?: (source: SourceCitation) => void;
}

export function SourceCard({ sources, onSelectSource }: SourceCardProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [activeViewerSource, setActiveViewerSource] = useState<SourceCitation | null>(null);

  const handleCardClick = (src: SourceCitation) => {
    if (onSelectSource) {
      onSelectSource(src);
    } else {
      setActiveViewerSource(src);
    }
  };

  if (!sources || sources.length === 0) return null;

  return (
    <div className="pt-3 space-y-2">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between cursor-pointer group py-1"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
          <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
          <span>Legal Evidence & Citations ({sources.length})</span>
        </div>
        <button className="text-muted-foreground group-hover:text-foreground">
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sources.map((src, idx) => (
            <Card
              key={idx}
              onClick={() => handleCardClick(src)}
              className="bg-card/70 hover:bg-muted/60 border-border/80 text-xs transition-all shadow-sm hover:shadow cursor-pointer group/card"
            >
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground truncate flex items-center gap-1.5 group-hover/card:text-indigo-600 dark:group-hover/card:text-indigo-400 transition-colors">
                    <FileText className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <span className="truncate">{src.document}</span>
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded font-medium border border-indigo-500/20 shrink-0">
                    {src.search_source}
                  </span>
                </div>

                <p className="text-muted-foreground italic text-[11px] line-clamp-2 leading-relaxed">
                  &quot;{src.clause}&quot;
                </p>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 pt-1 border-t border-border/40">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono">{src.section || "Section"}</span>
                    <span>•</span>
                    <span>Page {src.page || 1}</span>
                  </div>
                  <div className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium">
                    <span>{((src.similarity || src.confidence_score || 0.9) * 100).toFixed(0)}% match</span>
                    <ExternalLink className="h-3 w-3 ml-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Slide-over Document Viewer Drawer */}
      {activeViewerSource && (
        <DocumentViewerDrawer
          source={activeViewerSource}
          onClose={() => setActiveViewerSource(null)}
        />
      )}
    </div>
  );
}
