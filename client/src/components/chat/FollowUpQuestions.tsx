"use client";

import React from "react";
import { MessageSquarePlus, ChevronRight } from "lucide-react";

interface FollowUpQuestionsProps {
  questions: string[];
  onSelectQuestion: (question: string) => void;
  disabled?: boolean;
}

export function FollowUpQuestions({
  questions,
  onSelectQuestion,
  disabled,
}: FollowUpQuestionsProps) {
  if (!questions || questions.length === 0) return null;

  return (
    <div className="pt-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <MessageSquarePlus className="h-3.5 w-3.5 text-indigo-500" />
        <span>Suggested Next Questions:</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {questions.map((q, idx) => (
          <button
            key={idx}
            disabled={disabled}
            onClick={() => onSelectQuestion(q)}
            className="group flex items-center gap-2 px-3 py-1.5 bg-card/80 hover:bg-indigo-600/10 hover:text-indigo-600 dark:hover:text-indigo-400 border border-border/80 hover:border-indigo-500/30 rounded-xl text-xs text-foreground font-medium transition-all shadow-xs disabled:opacity-50 text-left"
          >
            <span>{q}</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-indigo-500 transition-colors shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
