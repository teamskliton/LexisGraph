"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Layers,
  LogOut,
  Plus,
  MessageSquare,
  Send,
  Copy,
  Check,
  Building2,
  BookOpen,
  Sparkles,
  ChevronRight,
  Bot,
  User as UserIcon,
  Trash2,
  ArrowLeft,
} from "lucide-react";

import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { organizationsService, Organization } from "@/services/api/organizations";
import { chatService, SourceCitation } from "@/services/chat-service";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  sources?: SourceCitation[];
  timestamp: string;
}

interface Conversation {
  id: string;
  title: string;
  organizationId: string;
  messages: Message[];
  updatedAt: string;
}

function SimpleMarkdown({ content }: { content: string }) {
  // Parse paragraphs, bolding (**), lists (* or -), and code inline
  const lines = content.split("\n");
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={lineIdx} className="h-1" />;

        // Header ###
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

        // Bullet list item
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const itemText = trimmed.replace(/^[-*]\s+/, "");
          return (
            <div key={lineIdx} className="flex items-start gap-2 pl-2 my-1">
              <span className="text-primary font-bold">•</span>
              <span>{renderFormattedText(itemText)}</span>
            </div>
          );
        }

        return <p key={lineIdx}>{renderFormattedText(line)}</p>;
      })}
    </div>
  );
}

function renderFormattedText(text: string) {
  // Match bold **text**
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

function ChatPageContent() {
  const { logout } = useAuth();
  const router = useRouter();

  // State
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [isLoadingOrgs, setIsLoadingOrgs] = useState<boolean>(true);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>("");

  const [inputQuery, setInputQuery] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load user organizations
  useEffect(() => {
    const loadOrgs = async () => {
      try {
        setIsLoadingOrgs(true);
        const data = await organizationsService.getOrganizations();
        setOrganizations(data);
        if (data.length > 0) {
          setSelectedOrgId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to load organizations:", err);
        toast.error("Failed to load organizations.");
      } finally {
        setIsLoadingOrgs(false);
      }
    };
    loadOrgs();
  }, []);

  // Load conversation history from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("lexisgraph_chat_conversations");
      if (saved) {
        const parsed: Conversation[] = JSON.parse(saved);
        setConversations(parsed);
        if (parsed.length > 0) {
          setActiveConvId(parsed[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load conversation history:", e);
    }
  }, []);

  // Save conversation history to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (conversations.length > 0) {
      localStorage.setItem("lexisgraph_chat_conversations", JSON.stringify(conversations));
    }
  }, [conversations]);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversations, activeConvId, isSending]);

  const activeConversation = conversations.find((c) => c.id === activeConvId);

  const createNewChat = () => {
    const newConv: Conversation = {
      id: Date.now().toString(),
      title: "New Legal Query",
      organizationId: selectedOrgId,
      messages: [],
      updatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newConv.id);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputQuery.trim();
    if (!query || isSending) return;

    if (!selectedOrgId) {
      toast.error("Please select an organization first.");
      return;
    }

    let currentConvId = activeConvId;
    let targetConv = conversations.find((c) => c.id === currentConvId);

    // Create new conversation if none exists
    if (!targetConv) {
      const newConv: Conversation = {
        id: Date.now().toString(),
        title: query.length > 30 ? query.slice(0, 30) + "..." : query,
        organizationId: selectedOrgId,
        messages: [],
        updatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(newConv.id);
      currentConvId = newConv.id;
      targetConv = newConv;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    // Update conversation title if first message
    const updatedTitle =
      targetConv.messages.length === 0
        ? query.length > 32
          ? query.slice(0, 32) + "..."
          : query
        : targetConv.title;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentConvId
          ? {
              ...c,
              title: updatedTitle,
              organizationId: selectedOrgId,
              messages: [...c.messages, userMsg],
              updatedAt: userMsg.timestamp,
            }
          : c
      )
    );

    setInputQuery("");
    setIsSending(true);

    try {
      const response = await chatService.sendMessage({
        organization_id: selectedOrgId,
        question: query,
      });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: response.answer,
        sources: response.sources,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConvId
            ? { ...c, messages: [...c.messages, assistantMsg], updatedAt: assistantMsg.timestamp }
            : c
        )
      );
    } catch (err: any) {
      console.error("Chat API error:", err);
      const errText =
        err?.response?.data?.detail || "Failed to generate answer. Please try again.";
      toast.error(errText);

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: `⚠️ Error: ${errText}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setConversations((prev) =>
        prev.map((c) => (c.id === currentConvId ? { ...c, messages: [...c.messages, errorMsg] } : c))
      );
    } finally {
      setIsSending(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    toast.success("Answer copied to clipboard!");
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const deleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConvId === convId) {
      setActiveConvId("");
    }
    toast.success("Conversation deleted.");
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar / Conversation History */}
      <aside className="w-80 border-r border-border bg-card/60 flex flex-col hidden md:flex shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-foreground">LexisGraph AI</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="p-3">
          <Button
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>New Legal Query</span>
          </Button>
        </div>

        {/* Organization Selector */}
        <div className="px-3 py-2 border-b border-border/50">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
            Active Organization
          </label>
          <div className="relative">
            <Building2 className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              disabled={isLoadingOrgs}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 rounded-md border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 block my-2">
            Recent Searches
          </span>
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">No previous conversations.</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs ${
                  activeConvId === conv.id
                    ? "bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 font-medium border border-indigo-500/20"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{conv.title}</span>
                </div>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                  title="Delete query"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* User Footer */}
        <div className="p-3 border-t border-border flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col h-full relative bg-background">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600" />
            <span className="font-bold text-sm">LexisGraph AI</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button size="sm" variant="outline" onClick={createNewChat}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center space-y-4 py-12">
              <div className="h-14 w-14 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-600 shadow-inner">
                <Sparkles className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
                Ask LexisGraph Legal Auditor
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Query regulation & policy documents for your organization. Retrieval combines vector embeddings (Qdrant) and graph relations (Neo4j).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full pt-4">
                {[
                  "What are the penalties under the IT Act 2000?",
                  "Which clauses mention data protection obligations?",
                  "Compare policy compliance requirements across regulations.",
                  "What are the rules regarding digital signatures?",
                ].map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInputQuery(sample);
                    }}
                    className="p-3 text-left rounded-xl border border-border bg-card hover:border-indigo-500/50 hover:bg-muted/40 text-xs text-muted-foreground hover:text-foreground transition-all flex items-center justify-between group"
                  >
                    <span>{sample}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-indigo-600 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            activeConversation.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl mx-auto ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.sender === "assistant" && (
                  <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div className={`space-y-2 max-w-[85%] ${msg.sender === "user" ? "items-end" : ""}`}>
                  <Card
                    className={`border ${
                      msg.sender === "user"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-card border-border shadow-sm"
                    }`}
                  >
                    <CardContent className="p-4 space-y-3">
                      {msg.sender === "user" ? (
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                      ) : (
                        <SimpleMarkdown content={msg.text} />
                      )}

                      {/* Sources / Citations list */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="pt-3 border-t border-border/60 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-500">
                            <BookOpen className="h-3.5 w-3.5" />
                            <span>Retrieved Document Citations ({msg.sources.length})</span>
                          </div>
                          <div className="space-y-2">
                            {msg.sources.map((src, sIdx) => (
                              <div
                                key={sIdx}
                                className="p-2.5 rounded-lg bg-muted/60 text-xs border border-border/40 text-muted-foreground space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="font-semibold text-foreground truncate max-w-[220px]">
                                    📄 {src.document}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                      {src.search_source}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      Score: {(src.confidence_score * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                                {src.clause_number && (
                                  <span className="text-[10px] text-muted-foreground font-mono block">
                                    Clause ID: {src.clause_number}
                                  </span>
                                )}
                                <p className="italic line-clamp-3 pt-0.5 text-foreground/90">
                                  "{src.clause}"
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Actions (Copy answer) */}
                  {msg.sender === "assistant" && (
                    <div className="flex items-center gap-2 pl-1">
                      <button
                        onClick={() => copyToClipboard(msg.text, msg.id)}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        {copiedMessageId === msg.id ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-500" />
                            <span className="text-emerald-500">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy Answer</span>
                          </>
                        )}
                      </button>
                      <span className="text-[10px] text-muted-foreground/60">• {msg.timestamp}</span>
                    </div>
                  )}
                </div>

                {msg.sender === "user" && (
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-foreground shrink-0 shadow-sm mt-0.5 border border-border">
                    <UserIcon className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))
          )}

          {/* Loading Animation */}
          {isSending && (
            <div className="flex gap-3 max-w-3xl mx-auto justify-start items-start">
              <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm animate-pulse">
                <Bot className="h-4 w-4" />
              </div>
              <Card className="bg-card border border-border shadow-sm p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-indigo-600 animate-ping" />
                  <span>Searching Qdrant & Neo4j knowledge graph...</span>
                </div>
              </Card>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-border bg-card/80 backdrop-blur-md">
          <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto relative flex items-center gap-2">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask a legal or compliance question..."
              disabled={isSending}
              className="flex-1 bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all pr-12"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!inputQuery.trim() || isSending}
              className="absolute right-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg h-8 w-8 flex items-center justify-center"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="text-[11px] text-center text-muted-foreground mt-2">
            LexisGraph uses hybrid vector and graph RAG. Always verify legal citations against primary legislation.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <ProtectedRoute>
      <ChatPageContent />
    </ProtectedRoute>
  );
}
