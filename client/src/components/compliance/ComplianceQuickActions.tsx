"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  BarChart3,
  Network,
  Bot,
  Upload,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ComplianceQuickActionsProps {
  onRunAnalysis: () => void;
}

export const ComplianceQuickActions: React.FC<ComplianceQuickActionsProps> = ({
  onRunAnalysis,
}) => {
  const router = useRouter();

  const actions = [
    {
      title: "Run Analysis",
      description: "Initiate an AI statutory compliance scan against company policies.",
      icon: <Zap className="h-5 w-5 text-amber-500" />,
      bg: "bg-amber-500/10 border-amber-500/20",
      btnText: "Start Analysis",
      onClick: onRunAnalysis,
    },
    {
      title: "View Reports",
      description: "Access and export generated compliance audit reports and findings.",
      icon: <BarChart3 className="h-5 w-5 text-primary" />,
      bg: "bg-primary/10 border-primary/20",
      btnText: "Open Reports",
      onClick: () => router.push("/compliance/history"),
    },
    {
      title: "Knowledge Graph",
      description: "Interactively explore connected legal entities, clauses, and mandates.",
      icon: <Network className="h-5 w-5 text-purple-400" />,
      bg: "bg-purple-500/10 border-purple-500/20",
      btnText: "Explore Graph",
      onClick: () => router.push("/knowledge-graph"),
    },
    {
      title: "Ask AI Assistant",
      description: "Ask natural language compliance questions powered by GraphRAG.",
      icon: <Bot className="h-5 w-5 text-indigo-500" />,
      bg: "bg-indigo-500/10 border-indigo-500/20",
      btnText: "Open AI Chat",
      onClick: () => router.push("/chat"),
    },
    {
      title: "Upload Policies",
      description: "Add new internal HR, Data Privacy, or POSH policies to workspace.",
      icon: <Upload className="h-5 w-5 text-emerald-500" />,
      bg: "bg-emerald-500/10 border-emerald-500/20",
      btnText: "Upload Files",
      onClick: () => router.push("/documents"),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Compliance Quick Actions
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {actions.map((act, idx) => (
          <Card
            key={idx}
            onClick={act.onClick}
            className="border border-border/50 bg-card/60 hover:bg-muted/40 transition-all p-4 cursor-pointer flex flex-col justify-between group"
          >
            <div className="space-y-3">
              <div className={`h-9 w-9 rounded-lg border flex items-center justify-center ${act.bg}`}>
                {act.icon}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {act.title}
                </h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                  {act.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs font-semibold text-primary pt-3 mt-2 border-t border-border/40 group-hover:translate-x-1 transition-transform">
              <span>{act.btnText}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
