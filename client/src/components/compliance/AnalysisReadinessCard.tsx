"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck,
  BookOpen,
  Network,
  History,
  Upload,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AnalysisReadinessCardProps {
  policiesCount: number;
  regulationsCount: number;
  isKnowledgeGraphReady: boolean;
  hasPreviousAnalysis: boolean;
  isLoading: boolean;
}

export const AnalysisReadinessCard: React.FC<AnalysisReadinessCardProps> = ({
  policiesCount,
  regulationsCount,
  isKnowledgeGraphReady,
  hasPreviousAnalysis,
  isLoading,
}) => {
  const router = useRouter();

  const isPoliciesReady = policiesCount > 0;
  const isRegulationsReady = regulationsCount > 0;
  const canProceed = isPoliciesReady && isRegulationsReady && isKnowledgeGraphReady;

  const indicators = [
    {
      id: "policies",
      title: "Policies Uploaded",
      isReady: isPoliciesReady,
      details: isPoliciesReady
        ? `${policiesCount} internal policy document${policiesCount > 1 ? "s" : ""} active.`
        : "No internal policy documents uploaded yet.",
      actionText: "Upload Policy",
      actionRoute: "/documents",
      icon: <FileCheck className="h-4 w-4" />,
    },
    {
      id: "regulations",
      title: "Regulations Selected",
      isReady: isRegulationsReady,
      details: isRegulationsReady
        ? `${regulationsCount} statutory regulation benchmark${regulationsCount > 1 ? "s" : ""} selected.`
        : "No regulatory benchmarks selected or uploaded.",
      actionText: "Select Regulation",
      actionRoute: "/documents",
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      id: "graph",
      title: "Knowledge Graph Available",
      isReady: isKnowledgeGraphReady,
      details: isKnowledgeGraphReady
        ? "GraphRAG entity relationships indexed and available."
        : "Knowledge Graph index initialization in progress.",
      actionText: "Explore Graph",
      actionRoute: "/knowledge-graph",
      icon: <Network className="h-4 w-4" />,
    },
    {
      id: "history",
      title: "Previous Analysis Exists",
      isReady: hasPreviousAnalysis,
      details: hasPreviousAnalysis
        ? "Prior compliance audit baseline exists for comparison."
        : "First analysis run. No previous baseline exists.",
      actionText: "View History",
      actionRoute: "/reports",
      icon: <History className="h-4 w-4" />,
      optional: true,
    },
  ];

  return (
    <Card className="border border-border/60 bg-card/60 shadow-xs space-y-4 p-5">
      <div>
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Analysis Readiness Criteria
          </span>
          <span
            className={cn(
              "text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border",
              canProceed
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
            )}
          >
            {canProceed ? "Ready for Analysis" : "Prerequisites Missing"}
          </span>
        </CardTitle>
        <CardDescription className="text-xs mt-1">
          Verify organizational requirements before initiating an AI compliance audit run.
        </CardDescription>
      </div>

      {/* Missing Prerequisites Explanation Banner */}
      {!canProceed && !isLoading && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Cannot Proceed to Compliance Analysis</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                {!isPoliciesReady && !isRegulationsReady
                  ? "Please upload at least one policy document and select at least one regulation."
                  : !isPoliciesReady
                  ? "Upload at least one internal company policy document to analyze."
                  : !isRegulationsReady
                  ? "Select or upload a statutory regulation act to benchmark against."
                  : "Knowledge Graph data indexing is being prepared."}
              </p>
            </div>
          </div>
          {!isPoliciesReady && (
            <Button
              size="xs"
              onClick={() => router.push("/documents")}
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 cursor-pointer gap-1"
            >
              <Upload className="h-3 w-3" /> Upload Policies
            </Button>
          )}
        </div>
      )}

      {/* Readiness Indicators Checklist Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {indicators.map((item) => (
          <div
            key={item.id}
            className={cn(
              "p-3 rounded-lg border flex flex-col justify-between transition-all",
              item.isReady
                ? "border-emerald-500/20 bg-emerald-500/5"
                : item.optional
                ? "border-border/40 bg-muted/20"
                : "border-amber-500/20 bg-amber-500/5"
            )}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  {item.icon}
                  {item.title}
                </span>
                {item.isReady ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : item.optional ? (
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Optional</span>
                ) : (
                  <XCircle className="h-4 w-4 text-amber-500 shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {item.details}
              </p>
            </div>

            {!item.isReady && !item.optional && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => router.push(item.actionRoute)}
                className="mt-3 text-[10px] w-full justify-between cursor-pointer border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
              >
                <span>{item.actionText}</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};
