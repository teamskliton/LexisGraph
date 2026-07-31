"use client";

import React, { useRef, useEffect } from "react";
import { Send, Square, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface MessageInputProps {
  inputQuery: string;
  setInputQuery: (val: string) => void;
  onSendMessage: (e?: React.FormEvent) => void;
  isSending: boolean;
  onStopStreaming: () => void;
}

const MAX_CHAR_LIMIT = 2000;

export function MessageInput({
  inputQuery,
  setInputQuery,
  onSendMessage,
  isSending,
  onStopStreaming,
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

  const handleFileUpload = () => {
    toast.info("Document attachment available via LexisGraph Upload page.");
  };

  return (
    <div className="p-4 border-t border-border bg-card/40 backdrop-blur shrink-0 relative">
      <form onSubmit={onSendMessage} className="max-w-3xl mx-auto space-y-1.5">
        <div className="relative flex items-end gap-2 bg-muted/50 border border-border focus-within:border-indigo-500/50 rounded-2xl p-2 transition-all shadow-sm">
          {/* File attachment button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleFileUpload}
            disabled={isSending}
            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-xl mb-1"
            title="Attach reference file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

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
            placeholder="Ask a legal query or regulation question... (Press Enter to send, Shift+Enter for newline)"
            disabled={isSending}
            className="flex-1 py-1.5 px-1 text-sm bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none max-h-44 disabled:opacity-50"
          />

          {/* Send or Stop button */}
          {isSending ? (
            <Button
              type="button"
              onClick={onStopStreaming}
              variant="destructive"
              size="icon"
              className="h-9 w-9 rounded-xl shrink-0 mb-0.5"
              title="Stop streaming (Esc)"
            >
              <Square className="h-4 w-4 fill-white" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!inputQuery.trim()}
              className="h-9 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 p-0 shadow-md shadow-indigo-600/20 mb-0.5"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Footer info & Character counter */}
        <div className="flex items-center justify-between px-2 text-[10px] text-muted-foreground">
          <span>Esc to stop • Enter to send • Shift+Enter newline</span>
          <span className={inputQuery.length >= MAX_CHAR_LIMIT ? "text-destructive font-bold" : ""}>
            {inputQuery.length}/{MAX_CHAR_LIMIT}
          </span>
        </div>
      </form>
    </div>
  );
}
