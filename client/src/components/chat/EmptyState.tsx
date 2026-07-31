"use client";

import React from "react";
import { Sparkles, Scale, BookOpen, ShieldCheck } from "lucide-react";
import { SuggestedQuestions } from "./SuggestedQuestions";

interface EmptyStateProps {
  onSelectQuestion: (question: string) => void;
}

export function EmptyState({ onSelectQuestion }: EmptyStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto p-6 space-y-6">
      {/* Hero Icon */}
      <div className="relative">
        <div className="h-20 w-20 rounded-3xl bg-indigo-600/10 dark:bg-indigo-600/20 flex items-center justify-center border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shadow-inner">
          <Sparkles className="h-10 w-10 animate-pulse" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-background border border-border shadow flex items-center justify-center text-indigo-500">
          <Scale className="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Titles */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">How can I help you today?</h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
          Ask questions regarding <strong className="text-foreground font-medium">Regulations</strong>,{" "}
          <strong className="text-foreground font-medium">Company Policies</strong>,{" "}
          <strong className="text-foreground font-medium">Compliance Gaps</strong>, and{" "}
          <strong className="text-foreground font-medium">Legal Obligations</strong>.
        </p>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
        <span className="px-2.5 py-1 rounded-full bg-muted/60 border border-border flex items-center gap-1.5">
          <BookOpen className="h-3 w-3 text-indigo-500" />
          Hybrid GraphRAG Engine
        </span>
        <span className="px-2.5 py-1 rounded-full bg-muted/60 border border-border flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3 text-emerald-500" />
          Zero Hallucination Guarantee
        </span>
      </div>

      {/* Suggested Questions */}
      <div className="w-full pt-4">
        <SuggestedQuestions onSelectQuestion={onSelectQuestion} />
      </div>
    </div>
  );
}
