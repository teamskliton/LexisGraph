"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ProtectedRoute } from "@/components/layout/protected-route";
import { useAuth } from "@/context/auth-context";
import { organizationsService, Organization } from "@/services/api/organizations";
import {
  chatService,
  SourceCitation,
  ConversationSessionItem,
} from "@/services/chat-service";

import { ChatLayout } from "@/components/chat/ChatLayout";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { MessageInput } from "@/components/chat/MessageInput";
import { ChatMessage } from "@/components/chat/MessageBubble";
import { SidebarConversation } from "@/components/chat/ConversationSidebar";
import { DocumentViewerDrawer } from "@/components/chat/DocumentViewerDrawer";

function ChatPageContent() {
  const { logout } = useAuth();
  const router = useRouter();

  // Organization state
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [isLoadingOrgs, setIsLoadingOrgs] = useState<boolean>(true);

  // Conversation threads state
  const [conversations, setConversations] = useState<SidebarConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>("");

  // Current active thread messages
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});

  // Input & Streaming state
  const [inputQuery, setInputQuery] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load organizations on mount
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

  // Load conversation sessions list from PostgreSQL backend
  const refreshConversations = async () => {
    try {
      const sessionItems: ConversationSessionItem[] = await chatService.getConversations();
      const mappedConvs: SidebarConversation[] = sessionItems.map((s) => ({
        id: s.id,
        title: s.title,
        organizationId: s.organization_id,
        messageCount: s.message_count,
        updatedAt: new Date(s.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }));
      setConversations(mappedConvs);
      if (mappedConvs.length > 0 && !activeConvId) {
        setActiveConvId(mappedConvs[0].id);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  };

  useEffect(() => {
    refreshConversations();
  }, []);

  // Fetch full message history when selecting a conversation thread
  useEffect(() => {
    if (!activeConvId || activeConvId.startsWith("temp-")) return;

    if (messagesMap[activeConvId]) return; // already loaded in memory

    const loadDetail = async () => {
      try {
        const detail = await chatService.getConversationDetail(activeConvId);
        const mappedMsgs: ChatMessage[] = detail.messages.map((m) => ({
          id: m.id,
          sender: m.role === "user" ? "user" : "assistant",
          text: m.message,
          sources: m.sources || undefined,
          follow_up_questions: m.follow_up_questions || undefined,
          recommended_actions: m.recommended_actions || undefined,
          related_documents: m.related_documents || undefined,
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }));

        setMessagesMap((prev) => ({ ...prev, [activeConvId]: mappedMsgs }));
      } catch (err) {
        console.error("Failed to load message history:", err);
      }
    };

    loadDetail();
  }, [activeConvId, messagesMap]);

  const activeConversation = conversations.find((c) => c.id === activeConvId);
  const activeMessages = activeConvId ? messagesMap[activeConvId] || [] : [];

  const handleNewChat = () => {
    setActiveConvId("");
    setInputQuery("");
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSending(false);
      toast.info("Generation stopped.");
    }
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      if (!id.startsWith("temp-")) {
        await chatService.updateConversation(id, { title: newTitle });
      }
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
      );
      toast.success("Conversation renamed.");
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
  };

  const handleTogglePinConversation = async (id: string, currentPinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (!id.startsWith("temp-")) {
        await chatService.updateConversation(id, { is_pinned: !currentPinned });
      }
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isPinned: !currentPinned } : c))
      );
      toast.success(currentPinned ? "Unpinned conversation." : "Pinned conversation to top.");
    } catch (err) {
      console.error("Failed to toggle pin status:", err);
    }
  };

  const handleDuplicateConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (!id.startsWith("temp-")) {
        const detail = await chatService.duplicateConversation(id);
        toast.success("Conversation duplicated.");
        await refreshConversations();
        setActiveConvId(detail.id);
      }
    } catch (err) {
      console.error("Failed to duplicate conversation:", err);
      toast.error("Failed to duplicate conversation.");
    }
  };

  const handleExportConversation = async (id: string, format: "markdown" | "text", e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const blob = await chatService.exportConversation(id, format);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `conversation-export.${format === "markdown" ? "md" : "txt"}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`Exported conversation as ${format.toUpperCase()}.`);
    } catch (err) {
      console.error("Failed to export conversation:", err);
      toast.error("Failed to export conversation.");
    }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (!convId.startsWith("temp-")) {
        await chatService.deleteConversation(convId);
      }
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      setMessagesMap((prev) => {
        const copy = { ...prev };
        delete copy[convId];
        return copy;
      });

      if (activeConvId === convId) {
        setActiveConvId("");
      }
      toast.success("Conversation archived.");
    } catch (err) {
      console.error("Failed to delete conversation:", err);
      toast.error("Failed to delete conversation.");
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const query = (overrideQuery || inputQuery).trim();
    if (!query || isSending) return;

    if (!selectedOrgId) {
      toast.error("Please select an organization first.");
      return;
    }

    let currentConvId = activeConvId;
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: query,
      timestamp: timeStr,
    };

    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      sender: "assistant",
      text: "",
      isStreaming: true,
      timestamp: timeStr,
    };

    if (!currentConvId) {
      currentConvId = "temp-" + Date.now();
      const newConv: SidebarConversation = {
        id: currentConvId,
        title: query.length > 30 ? query.slice(0, 30) + "..." : query,
        organizationId: selectedOrgId,
        updatedAt: timeStr,
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(currentConvId);
      setMessagesMap((prev) => ({ ...prev, [currentConvId]: [userMsg, initialAssistantMsg] }));
    } else {
      setMessagesMap((prev) => ({
        ...prev,
        [currentConvId]: [...(prev[currentConvId] || []), userMsg, initialAssistantMsg],
      }));
    }

    if (!overrideQuery) setInputQuery("");
    setIsSending(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await chatService.streamMessage(
        {
          organization_id: selectedOrgId,
          question: query,
          conversation_id: currentConvId.startsWith("temp-") ? undefined : currentConvId,
        },
        // onToken: Append streamed tokens immediately
        (token: string) => {
          setMessagesMap((prev) => {
            const list = prev[currentConvId] || [];
            return {
              ...prev,
              [currentConvId]: list.map((m) =>
                m.id === assistantMsgId ? { ...m, text: m.text + token } : m
              ),
            };
          });
        },
        // onSources: Render sources after completion
        (sources: SourceCitation[]) => {
          setMessagesMap((prev) => {
            const list = prev[currentConvId] || [];
            return {
              ...prev,
              [currentConvId]: list.map((m) =>
                m.id === assistantMsgId ? { ...m, sources } : m
              ),
            };
          });
        },
        // onRecommendations: Render follow-up questions, actions, & related documents
        (recs) => {
          setMessagesMap((prev) => {
            const list = prev[currentConvId] || [];
            return {
              ...prev,
              [currentConvId]: list.map((m) =>
                m.id === assistantMsgId
                  ? {
                    ...m,
                    follow_up_questions: recs.follow_up_questions,
                    recommended_actions: recs.recommended_actions,
                    related_documents: recs.related_documents,
                  }
                  : m
              ),
            };
          });
        },
        // onDone: Finalize streaming & bind persistent conversation_id
        (doneData: { conversation_id: string }) => {
          setIsSending(false);
          const serverConvId = doneData.conversation_id;

          setMessagesMap((prev) => {
            const list = prev[currentConvId] || [];
            const updatedList = list.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m
            );
            const copy = { ...prev };
            delete copy[currentConvId];
            copy[serverConvId] = updatedList;
            return copy;
          });

          setConversations((prev) =>
            prev.map((c) => (c.id === currentConvId ? { ...c, id: serverConvId } : c))
          );
          setActiveConvId(serverConvId);
          refreshConversations();
        },
        // onError: Stream failure handling
        (errText: string) => {
          setIsSending(false);
          toast.error(errText || "Failed to stream answer.");

          setMessagesMap((prev) => {
            const list = prev[currentConvId] || [];
            return {
              ...prev,
              [currentConvId]: list.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, text: `⚠️ Error: ${errText}`, isStreaming: false }
                  : m
              ),
            };
          });
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("Chat error:", err);
      setIsSending(false);
      toast.error("Network error. Please try again.");
    }
  };

  const handleRegenerateLast = () => {
    if (activeMessages.length < 2) return;
    const lastUserMsg = [...activeMessages].reverse().find((m) => m.sender === "user");
    if (lastUserMsg) {
      handleSendMessage(undefined, lastUserMsg.text);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Answer copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [viewerOpen, setViewerOpen] = useState<boolean>(false);
  const [viewerDocId, setViewerDocId] = useState<string | undefined>(undefined);
  const [viewerClauseId, setViewerClauseId] = useState<string | undefined>(undefined);

  const handleOpenViewer = (docId?: string, clauseId?: string) => {
    setViewerDocId(docId);
    setViewerClauseId(clauseId);
    setViewerOpen(true);
  };

  return (
    <ChatLayout
      activeConversationTitle={activeConversation?.title}
      isStreaming={isSending}
      conversations={conversations}
      activeConvId={activeConvId}
      onSelectConversation={setActiveConvId}
      onNewChat={handleNewChat}
      onDeleteConversation={handleDeleteConversation}
      onRenameConversation={handleRenameConversation}
      onTogglePinConversation={handleTogglePinConversation}
      onDuplicateConversation={handleDuplicateConversation}
      onExportConversation={handleExportConversation}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      setSelectedOrgId={setSelectedOrgId}
      isLoadingOrgs={isLoadingOrgs}
      onNavigateDashboard={() => router.push("/dashboard")}
      onNavigateCompliance={() => router.push("/compliance")}
      onLogout={logout}
    >
      <ChatWindow
        messages={activeMessages}
        onSelectQuestion={(q) => handleSendMessage(undefined, q)}
        onRegenerateLast={handleRegenerateLast}
        onCopy={handleCopy}
        onOpenViewer={handleOpenViewer}
        copiedId={copiedId}
        isSending={isSending}
      />

      <MessageInput
        inputQuery={inputQuery}
        setInputQuery={setInputQuery}
        onSendMessage={handleSendMessage}
        isSending={isSending}
        onStopStreaming={handleStopStreaming}
      />

      <DocumentViewerDrawer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        documentId={viewerDocId}
        clauseId={viewerClauseId}
      />
    </ChatLayout>
  );
}

export default function ChatPage() {
  return (
    <ProtectedRoute>
      <ChatPageContent />
    </ProtectedRoute>
  );
}
