"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Sparkles } from "lucide-react";

interface ReportSummaryProps {
  summary: string | null | undefined;
}

export const ReportSummary: React.FC<ReportSummaryProps> = ({ summary }) => {
  return (
    <Card className="border-border/60 shadow-sm flex flex-col justify-between">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-bold text-foreground">
            Executive Summary
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="pt-4 text-sm leading-relaxed text-muted-foreground space-y-3">
        {summary ? (
          <p className="whitespace-pre-line text-foreground/90 font-normal">
            {summary}
          </p>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground space-y-2">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-xs">No executive summary available for this report.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportSummary;
