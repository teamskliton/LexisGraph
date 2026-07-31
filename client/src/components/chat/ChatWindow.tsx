"use client";

import React, { useEffect, useRef } from "react";
import { MessageBubble, ChatMessage } from "./MessageBubble";
import { EmptyState } from "./EmptyState";

interface ChatWindowProps {
  messages: ChatMessage[];
  onSelectQuestion: (question: string) => void;
  onRegenerateLast?: () => void;
  onCopy?: (text: string, id: string) => void;
  onOpenViewer?: (documentId?: string, clauseId?: string) => void;
  copiedId?: string | null;
  isSending?: boolean;
}

export function ChatWindow({
  messages,
  onSelectQuestion,
  onRegenerateLast,
  onCopy,
  onOpenViewer,
  copiedId,
  isSending,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on message list change or streaming token update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EmptyState onSelectQuestion={onSelectQuestion} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      {messages.map((msg, idx) => {
        const isLastAssistant =
          msg.sender === "assistant" && idx === messages.length - 1;

        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            onRegenerate={isLastAssistant && !isSending ? onRegenerateLast : undefined}
            onCopy={onCopy}
            onSelectQuestion={onSelectQuestion}
            onOpenViewer={onOpenViewer}
            copiedId={copiedId}
          />
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
