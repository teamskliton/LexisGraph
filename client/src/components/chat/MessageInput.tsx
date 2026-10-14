"use client";

import React, { useRef, useEffect } from "react";
import { Send, Square, X, SlidersHorizontal, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MessageInputProps {
  inputQuery: string;
  setInputQuery: (val: string) => void;
  onSendMessage: (e?: React.FormEvent) => void;
  isSending: boolean;
  onStopStreaming: () => void;
  activeContextChip?: {
    type: "report" | "finding" | "policy" | "regulation";
    label: string;
    id: string;
  } | null;
  onClearContextChip?: () => void;
  onOpenManageContext?: () => void;
}

const MAX_CHAR_LIMIT = 2000;

export function MessageInput({
  inputQuery,
  setInputQuery,
  onSendMessage,
  isSending,
  onStopStreaming,
  activeContextChip,
  onClearContextChip,
  onOpenManageContext,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputQuery]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && isSending) {
      onStopStreaming();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (inputQuery.trim() && !isSending) {
        onSendMessage();
      }
    }
  };

  return (
    <div className="p-3 md:p-4 border-t border-border bg-card/60 backdrop-blur-md shrink-0 relative">
      <form onSubmit={onSendMessage} className="max-w-4xl mx-auto space-y-2">
        {/* Active Context Chip above Composer */}
        {activeContextChip && (
          <div className="flex items-center justify-between text-xs px-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/25 text-primary text-xs font-medium">
              <span className="font-semibold uppercase text-[10px] tracking-wider text-primary/80">Using Context:</span>
              <span className="truncate max-w-xs">{activeContextChip.label}</span>
              {onClearContextChip && (
                <button
                  type="button"
                  onClick={onClearContextChip}
                  className="ml-1 p-0.5 rounded hover:bg-primary/20 text-primary transition-colors cursor-pointer"
                  title="Remove context scope"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {onOpenManageContext && (
              <button
                type="button"
                onClick={onOpenManageContext}
                className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 cursor-pointer"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>Change Scope</span>
              </button>
            )}
          </div>
        )}

        <div className="relative flex items-end gap-2 bg-background/80 border border-border focus-within:border-primary/50 rounded-2xl p-2 transition-all shadow-xs">
          {/* Auto-expand textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputQuery}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHAR_LIMIT) {
                setInputQuery(e.target.value);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about policies, regulations, findings, or reports..."
            disabled={isSending}
            className="flex-1 py-1.5 px-2 text-sm bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none max-h-44 disabled:opacity-50"
          />

          {/* Send or Stop button */}
          {isSending ? (
            <Button
              type="button"
              onClick={onStopStreaming}
              variant="destructive"
              size="icon"
              className="h-9 w-9 rounded-xl shrink-0 mb-0.5 cursor-pointer"
              title="Stop streaming (Esc)"
            >
              <Square className="h-4 w-4 fill-white" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!inputQuery.trim()}
              className="h-9 w-9 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground shrink-0 p-0 shadow-xs mb-0.5 disabled:opacity-40 cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Footer legal disclaimer & keyboard info */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-2 gap-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5 text-muted-foreground/80">
            <ShieldAlert className="h-3 w-3 text-muted-foreground shrink-0" />
            <span>AI-generated compliance guidance should be reviewed by a qualified legal professional.</span>
          </div>
          <span className="font-mono text-muted-foreground/60 shrink-0">
            Enter to send • Shift+Enter newline
          </span>
        </div>
      </form>
    </div>
  );
}
