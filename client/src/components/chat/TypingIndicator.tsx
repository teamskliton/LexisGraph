"use client";

import React from "react";

export function TypingIndicator() {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-muted-foreground text-xs font-medium border border-border/50">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" />
      <span className="ml-1 text-[11px]">Streaming legal evidence...</span>
    </div>
  );
}
