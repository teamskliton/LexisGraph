"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, CheckCircle2, ArrowRight, ShieldAlert, Sparkles } from "lucide-react";

interface RecommendationsCardProps {
  recommendations: unknown;
}

interface ParsedRecommendation {
  id: string;
  title: string;
  description?: string;
  priority?: "High" | "Medium" | "Low";
}

export const RecommendationsCard: React.FC<RecommendationsCardProps> = ({
  recommendations,
}) => {
  // Normalize recommendations into a clean array
  const parsedList: ParsedRecommendation[] = React.useMemo(() => {
    if (!recommendations) return [];

    if (Array.isArray(recommendations)) {
      return recommendations.map((item, idx) => {
        if (typeof item === "string") {
          return { id: `rec-${idx}`, title: item };
        }
        if (typeof item === "object" && item !== null) {
          const rec = item as Record<string, unknown>;
          return {
            id: String(rec.id || `rec-${idx}`),
            title: String(rec.title || rec.recommendation || rec.action || rec.description || JSON.stringify(rec)),
            description: rec.details || rec.description ? String(rec.details || rec.description) : undefined,
            priority: (rec.priority as "High" | "Medium" | "Low") || undefined,
          };
        }
        return { id: `rec-${idx}`, title: String(item) };
      });
    }

    if (typeof recommendations === "object" && recommendations !== null) {
      const recObj = recommendations as Record<string, unknown>;
      if (Array.isArray(recObj.items)) {
        return recObj.items.map((it, idx) => ({ id: `rec-${idx}`, title: typeof it === "string" ? it : JSON.stringify(it) }));
      }
      return Object.entries(recObj).map(([key, val], idx) => ({
        id: `rec-${idx}`,
        title: `${key}: ${typeof val === "string" ? val : JSON.stringify(val)}`,
      }));
    }

    if (typeof recommendations === "string") {
      return [{ id: "rec-0", title: recommendations }];
    }

    return [];
  }, [recommendations]);

  return (
    <Card className="border-border/60 shadow-sm flex flex-col justify-between">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Lightbulb className="h-4 w-4" />
            </div>
            <CardTitle className="text-base font-bold text-foreground">
              Actionable Recommendations
            </CardTitle>
          </div>
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
            {parsedList.length} Items
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {parsedList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground space-y-2">
            <Sparkles className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No recommendations recorded for this report.</p>
            <p className="text-xs text-muted-foreground">The evaluated policy demonstrates solid regulatory compliance.</p>
          </div>
        ) : (
          <div className="max-h-[380px] overflow-y-auto space-y-3 pr-1.5 custom-scrollbar">
            {parsedList.map((item, index) => (
              <div
                key={item.id || index}
                className="rounded-lg border border-border/60 bg-muted/20 p-3.5 hover:bg-muted/40 transition-colors flex items-start gap-3"
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                  {index + 1}
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground leading-snug">
                      {item.title}
                    </p>
                    {item.priority && (
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${
                          item.priority === "High"
                            ? "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400"
                            : item.priority === "Medium"
                            ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400"
                            : "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400"
                        }`}
                      >
                        {item.priority}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecommendationsCard;
