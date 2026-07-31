"use client";

import React from "react";
import { ChevronRight, FileText, Scale, Shield, Clock } from "lucide-react";

interface SuggestedQuestionsProps {
  onSelectQuestion: (question: string) => void;
}

const SAMPLE_QUESTIONS = [
  {
    icon: Scale,
    title: "Code of Wages",
    text: "What are employer obligations under the Code of Wages?",
  },
  {
    icon: Shield,
    title: "POSH Compliance",
    text: "Compare my POSH Policy with the POSH Act.",
  },
  {
    icon: FileText,
    title: "DPDP Act",
    text: "Summarize the DPDP Act.",
  },
  {
    icon: Clock,
    title: "Overtime Terms",
    text: "What clauses discuss overtime compensation?",
  },
];

export function SuggestedQuestions({ onSelectQuestion }: SuggestedQuestionsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl mx-auto">
      {SAMPLE_QUESTIONS.map((item, idx) => {
        const IconComponent = item.icon;
        return (
          <button
            key={idx}
            onClick={() => onSelectQuestion(item.text)}
            className="p-3.5 text-left bg-card hover:bg-muted/80 border border-border rounded-xl transition-all shadow-sm flex items-start gap-3 group hover:border-indigo-500/30"
          >
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
              <IconComponent className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                {item.title}
              </span>
              <p className="text-xs text-foreground font-medium group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                {item.text}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center" />
          </button>
        );
      })}
    </div>
  );
}
