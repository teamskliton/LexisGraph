"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Scale, FileText, Network, Download, ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface RecommendedActionItem {
  type: string;
  title: string;
  description: string;
}

interface RecommendedActionsProps {
  actions: RecommendedActionItem[];
  sources?: any[];
  onOpenViewer?: (documentId?: string, clauseId?: string) => void;
  onSelectQuestion?: (question: string) => void;
}

export function RecommendedActions({
  actions,
  sources,
  onOpenViewer,
  onSelectQuestion,
}: RecommendedActionsProps) {
  const router = useRouter();

  if (!actions || actions.length === 0) return null;

  const getActionIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("compare") || t.includes("compliance")) return Scale;
    if (t.includes("document") || t.includes("view")) return FileText;
    if (t.includes("graph") || t.includes("network")) return Network;
    if (t.includes("export") || t.includes("report")) return Download;
    return Sparkles;
  };

  const handleActionClick = (action: RecommendedActionItem) => {
    const typeStr = (action.type || "").toLowerCase();
    const titleStr = (action.title || "").toLowerCase();

    if (
      typeStr.includes("document") ||
      typeStr.includes("view_document") ||
      titleStr.includes("open") ||
      titleStr.includes("regulation")
    ) {
      const docId = sources && sources.length > 0 ? sources[0].document_id : undefined;
      const clauseId = sources && sources.length > 0 ? sources[0].clause_id : undefined;
      if (onOpenViewer) {
        onOpenViewer(docId || undefined, clauseId || undefined);
      } else {
        router.push("/documents");
      }
    } else if (
      typeStr.includes("compare") ||
      typeStr.includes("compliance") ||
      titleStr.includes("compliance") ||
      titleStr.includes("check")
    ) {
      router.push("/compliance");
    } else if (
      typeStr.includes("graph") ||
      typeStr.includes("knowledge") ||
      titleStr.includes("graph")
    ) {
      if (onSelectQuestion) {
        onSelectQuestion("Show knowledge graph connections for this context");
      } else {
        router.push("/compliance");
      }
    } else if (
      typeStr.includes("export") ||
      typeStr.includes("report") ||
      titleStr.includes("export")
    ) {
      router.push("/reports");
    } else {
      router.push("/compliance");
    }
  };

  return (
    <div className="pt-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
        <span>Recommended Next Steps:</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actions.map((act, idx) => {
          const IconComp = getActionIcon(act.type);
          return (
            <Card
              key={idx}
              className="bg-card/70 hover:bg-muted/50 border-border/80 text-xs transition-all shadow-sm group hover:border-indigo-500/30"
            >
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                    <IconComp className="h-3.5 w-3.5" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-semibold text-foreground text-xs group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {act.title}
                    </h4>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {act.description}
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleActionClick(act)}
                  className="h-7 px-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 text-xs shrink-0 self-center"
                >
                  <span>Act</span>
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
