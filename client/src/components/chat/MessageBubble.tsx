"use client";

import React, { useState } from "react";
import {
  Bot,
  User as UserIcon,
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { SourceCitation } from "@/services/chat-service";
import { SourceCard } from "./SourceCard";
import { TypingIndicator } from "./TypingIndicator";
import { FollowUpQuestions } from "./FollowUpQuestions";
import { RecommendedActions, RecommendedActionItem } from "./RecommendedActions";
import { RelatedDocuments, RelatedDocumentItem } from "./RelatedDocuments";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  sources?: SourceCitation[];
  follow_up_questions?: string[];
  recommended_actions?: RecommendedActionItem[];
  related_documents?: RelatedDocumentItem[];
  timestamp: string;
  isStreaming?: boolean;
}

interface MessageBubbleProps {
  message: ChatMessage;
  onRegenerate?: () => void;
  onCopy?: (text: string, id: string) => void;
  onSelectQuestion?: (question: string) => void;
  onOpenViewer?: (documentId?: string, clauseId?: string) => void;
  copiedId?: string | null;
}

function SimpleMarkdown({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={lineIdx} className="h-1" />;

        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={lineIdx} className="font-semibold text-base text-foreground mt-3 mb-1">
              {trimmed.replace(/^###\s+/, "")}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={lineIdx} className="font-bold text-lg text-foreground mt-4 mb-2">
              {trimmed.replace(/^##\s+/, "")}
            </h3>
          );
        }

        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const itemText = trimmed.replace(/^[-*]\s+/, "");
          return (
            <div key={lineIdx} className="flex items-start gap-2 pl-2 my-1">
              <span className="text-indigo-500 font-bold">•</span>
              <span>{renderFormattedText(itemText)}</span>
            </div>
          );
        }

        return <p key={lineIdx}>{renderFormattedText(line)}</p>;
      })}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-indigo-500 animate-pulse align-middle" />
      )}
    </div>
  );
}

function renderFormattedText(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  onRegenerate,
  onCopy,
  onSelectQuestion,
  onOpenViewer,
  copiedId,
}: MessageBubbleProps) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const isLong = message.text.length > 1200;
  const displayText = isCollapsed && isLong ? message.text.slice(0, 1000) + "..." : message.text;

  if (message.sender === "user") {
    return (
      <div className="flex gap-3 max-w-3xl ml-auto flex-row-reverse group">
        <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs shrink-0 shadow-sm">
          <UserIcon className="h-4 w-4" />
        </div>

        <div className="space-y-1 max-w-full">
          <div className="p-4 rounded-2xl bg-indigo-600 text-white text-sm rounded-tr-none shadow-sm">
            <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
          </div>
          <span className="text-[10px] text-muted-foreground px-1 block text-right">
            {message.timestamp}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 max-w-3xl mr-auto group">
      <div className="h-8 w-8 rounded-full bg-card border border-border text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs shrink-0 shadow-sm">
        <Bot className="h-4 w-4" />
      </div>

      <div className="space-y-3 max-w-full flex-1">
        <div className="p-4 rounded-2xl bg-card border border-border text-foreground rounded-tl-none relative shadow-sm">
          {message.text ? (
            <div>
              <SimpleMarkdown content={displayText} isStreaming={message.isStreaming} />

              {/* Collapse/Expand Toggle for Long Responses */}
              {isLong && (
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  {isCollapsed ? (
                    <>
                      <span>Expand full response</span>
                      <ChevronDown className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <span>Collapse response</span>
                      <ChevronUp className="h-3 w-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <TypingIndicator />
          )}

          {/* Assistant Action Controls */}
          {message.text && !message.isStreaming && (
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border/40 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                {/* Feedback Thumbs */}
                <button
                  onClick={() => setFeedback(feedback === "up" ? null : "up")}
                  className={`p-1 rounded hover:bg-muted transition-colors ${
                    feedback === "up" ? "text-indigo-600 dark:text-indigo-400" : ""
                  }`}
                  title="Helpful response"
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setFeedback(feedback === "down" ? null : "down")}
                  className={`p-1 rounded hover:bg-muted transition-colors ${
                    feedback === "down" ? "text-destructive" : ""
                  }`}
                  title="Not helpful"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>

                {/* Regenerate Button */}
                {onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors ml-1 flex items-center gap-1 text-[11px]"
                    title="Regenerate answer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Retry</span>
                  </button>
                )}
              </div>

              {/* Copy Button */}
              {onCopy && (
                <button
                  onClick={() => onCopy(message.text, message.id)}
                  className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors text-[11px]"
                >
                  {copiedId === message.id ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      <span className="text-emerald-500">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Source Citations */}
        {message.sources && message.sources.length > 0 && !message.isStreaming && (
          <SourceCard
            sources={message.sources}
            onSelectSource={(source: SourceCitation) => onOpenViewer && onOpenViewer(source.document_id || undefined, source.clause_id || undefined)}
          />
        )}

        {/* Suggested Next Questions */}
        {message.follow_up_questions && message.follow_up_questions.length > 0 && !message.isStreaming && onSelectQuestion && (
          <FollowUpQuestions
            questions={message.follow_up_questions}
            onSelectQuestion={onSelectQuestion}
          />
        )}

        {/* Recommended Actions */}
        {message.recommended_actions && message.recommended_actions.length > 0 && !message.isStreaming && (
          <RecommendedActions
            actions={message.recommended_actions}
            sources={message.sources}
            onOpenViewer={onOpenViewer}
            onSelectQuestion={onSelectQuestion}
          />
        )}

        {/* Related Documents */}
        {message.related_documents && message.related_documents.length > 0 && !message.isStreaming && (
          <RelatedDocuments
            documents={message.related_documents}
            onOpenDocument={(docId) => onOpenViewer && onOpenViewer(docId)}
          />
        )}

        <span className="text-[10px] text-muted-foreground px-1 block">
          {message.timestamp}
        </span>
      </div>
    </div>
  );
});
