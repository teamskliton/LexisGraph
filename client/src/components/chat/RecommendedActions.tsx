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
  onManageContext?: () => void;
}

export function RecommendedActions({
  actions,
  sources,
  onOpenViewer,
  onSelectQuestion,
  onManageContext,
}: RecommendedActionsProps) {
  const router = useRouter();

  if (!actions || actions.length === 0) return null;

  const getActionIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("report")) return Download;
    if (t.includes("compare") || t.includes("compliance")) return Scale;
    if (t.includes("document") || t.includes("view") || t.includes("policy") || t.includes("regulation")) return FileText;
    if (t.includes("graph") || t.includes("network")) return Network;
    return Sparkles;
  };

  const handleActionClick = (action: RecommendedActionItem) => {
    const typeStr = (action.type || "").toLowerCase();
    const titleStr = (action.title || "").toLowerCase();

    if (typeStr.includes("manage_context") || titleStr.includes("context")) {
      if (onManageContext) {
        onManageContext();
      } else if (onSelectQuestion) {
        onSelectQuestion("What are our major compliance risks?");
      }
      return;
    }

    if (
      typeStr.includes("view_report") ||
      titleStr.includes("open report") ||
      titleStr.includes("view report") ||
      typeStr.includes("view_findings") ||
      titleStr.includes("findings")
    ) {
      const hexMatch = titleStr.match(/#?([0-9a-fA-F]{8,36})/);
      if (hexMatch) {
        router.push(`/compliance/reports/${hexMatch[1]}`);
      } else if (sources && sources.length > 0 && sources[0].document_id) {
        router.push(`/compliance/reports/${sources[0].document_id}`);
      } else {
        router.push("/compliance/reports");
      }
      return;
    }

    if (
      typeStr.includes("document") ||
      typeStr.includes("view_document") ||
      titleStr.includes("open regulation") ||
      titleStr.includes("regulation")
    ) {
      const docId = sources && sources.length > 0 ? sources[0].document_id : undefined;
      const clauseId = sources && sources.length > 0 ? sources[0].clause_id : undefined;
      if (onOpenViewer) {
        onOpenViewer(docId || undefined, clauseId || undefined);
      } else {
        router.push("/documents");
      }
    } else if (typeStr.includes("view_policies") || titleStr.includes("policies")) {
      router.push("/documents");
    } else if (
      typeStr.includes("graph") ||
      typeStr.includes("knowledge") ||
      titleStr.includes("graph")
    ) {
      if (onSelectQuestion) {
        onSelectQuestion("Show knowledge graph connections for this context");
      } else {
        router.push("/knowledge-graph");
      }
    } else if (
      typeStr.includes("compare") ||
      typeStr.includes("compliance") ||
      titleStr.includes("compliance")
    ) {
      router.push("/compliance");
    } else {
      router.push("/compliance/reports");
    }
  };

  return (
    <div className="pt-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <span>Recommended Next Steps:</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actions.map((act, idx) => {
          const IconComp = getActionIcon(act.type);
          return (
            <Card
              key={idx}
              className="bg-card/70 hover:bg-muted/50 border-border/80 text-xs transition-all shadow-sm group hover:border-primary/30"
            >
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                    <IconComp className="h-3.5 w-3.5" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-semibold text-foreground text-xs group-hover:text-primary transition-colors">
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
                  className="h-7 px-2 text-primary hover:underline text-xs shrink-0 self-center"
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
