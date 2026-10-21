"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Sparkles,
  Bot,
  Plus,
  Trash2,
  Edit2,
  Pin,
  PinOff,
  Download,
  Copy,
  Check,
  Search,
  Shield,
  BookOpen,
  FileText,
  AlertTriangle,
  ChevronRight,
  SlidersHorizontal,
  X,
  Menu,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  HelpCircle,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";

import { ProtectedRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { organizationsService } from "@/services/api/organizations";
import { documentService } from "@/services/document-service";
import { regulationsApi } from "@/services/api/regulations";
import { api } from "@/services/api";
import {
  chatService,
  SourceCitation,
  ConversationSessionItem,
} from "@/services/chat-service";
import { MessageBubble, ChatMessage } from "@/components/chat/MessageBubble";
import { MessageInput } from "@/components/chat/MessageInput";
import { DocumentViewerDrawer } from "@/components/chat/DocumentViewerDrawer";

// ---------------------------------------------------------------------------
// Helpers & Types
// ---------------------------------------------------------------------------

interface ContextEntities {
  policies: { id: string; title: string }[];
  regulations: { id: string; title: string }[];
  reports: { id: string; title: string; risk_level?: string }[];
  findings: { id: string; title: string; severity?: string; status?: string }[];
}

function cleanConversationTitle(title: string): string {
  if (!title) return "AI Compliance Assistant";
  let t = title.trim();
  if (/^(?:context\s+report\s+id|\[context|report\s+id\s+[0-9a-fA-F-]+)/i.test(t)) {
    const hex = t.match(/([0-9a-fA-F]{8})/);
    return hex ? `Compliance Risk Review #${hex[1].toLowerCase()}` : "Compliance Risk Review";
  }
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(t)) {
    return `Compliance Review #${t.slice(0, 8)}`;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Component Implementation
// ---------------------------------------------------------------------------

export function AIAssistantContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL Context parameters
  const paramPolicyId = searchParams.get("policyId");
  const paramRegulationId = searchParams.get("regulationId");
  const paramReportId = searchParams.get("reportId");
  const paramFindingId = searchParams.get("findingId");
  const paramQuestion = searchParams.get("question");

  // Active Organization state
  const [activeOrgId, setActiveOrgId] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("");

  // Context Entities for active org
  const [entities, setEntities] = useState<ContextEntities>({
    policies: [],
    regulations: [],
    reports: [],
    findings: [],
  });
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(paramPolicyId || "");
  const [selectedRegulationId, setSelectedRegulationId] = useState<string>(paramRegulationId || "");
  const [selectedReportId, setSelectedReportId] = useState<string>(paramReportId || "");
  const [selectedFindingId, setSelectedFindingId] = useState<string>(paramFindingId || "");

  // Sidebar Layout States
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [searchConvQuery, setSearchConvQuery] = useState<string>("");

  // Modals & Confirmation States
  const [manageContextOpen, setManageContextOpen] = useState<boolean>(false);
  const [contextFilterTab, setContextFilterTab] = useState<"report" | "policy" | "regulation">("report");
  const [contextSearchText, setContextSearchText] = useState<string>("");

  const [renameDialogOpen, setRenameDialogOpen] = useState<boolean>(false);
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [newTitleInput, setNewTitleInput] = useState<string>("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);

  // Conversation history sessions from PostgreSQL backend
  const [conversations, setConversations] = useState<ConversationSessionItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>("");
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});

  // Input & Streaming states
  const [inputQuery, setInputQuery] = useState<string>(paramQuestion || "");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Document Viewer Drawer state
  const [viewerOpen, setViewerOpen] = useState<boolean>(false);
  const [viewerDocId, setViewerDocId] = useState<string | undefined>(undefined);
  const [viewerClauseId, setViewerClauseId] = useState<string | undefined>(undefined);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    }
  }, []);

  // Load Organization & Context Entities
  const loadWorkspaceContext = useCallback(async () => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("selected_organization_id") : null;
    if (!orgId) return;

    setActiveOrgId(orgId);

    try {
      // 1. Fetch Org Name
      try {
        const orgInfo = await organizationsService.getOrganizationById(orgId);
        setOrgName(orgInfo.name || "Organization Workspace");
      } catch {
        setOrgName("Organization Workspace");
      }

      // 2. Fetch Policies owned by org
      const policyList = await documentService.getDocuments(orgId);
      const mappedPolicies = (policyList || [])
        .filter((d) => d.document_type === "POLICY")
        .map((p) => ({ id: p.id, title: p.original_filename }));

      // 3. Fetch Linked Regulations
      const regList = await regulationsApi.listRegulations(orgId, undefined, true);
      const mappedRegs = (regList || []).map((r) => ({ id: r.id, title: r.title || r.act_name || "Statutory Act" }));

      // 4. Fetch Reports
      let mappedReports: { id: string; title: string; risk_level?: string }[] = [];
      try {
        const reportRes = await api.get("/reports", { params: { organization_id: orgId } });
        mappedReports = (reportRes.data?.items || []).map((rp: any) => ({
          id: rp.id,
          title: `Report #${rp.id.slice(0, 8)}: ${rp.policy_document_name || "Policy"} vs ${rp.regulation_name || "Regulation"}`,
          risk_level: rp.risk_level,
        }));
      } catch (e) {
        console.warn("Failed fetching reports for context selector:", e);
      }

      setEntities({
        policies: mappedPolicies,
        regulations: mappedRegs,
        reports: mappedReports,
        findings: [],
      });
    } catch (err) {
      console.error("Failed loading workspace context:", err);
    }
  }, []);

  const initialSelectionDoneRef = useRef<boolean>(false);

  // Fetch Conversation Sessions from PostgreSQL backend
  const refreshConversations = useCallback(async () => {
    if (!activeOrgId) return [];
    try {
      const sessionItems = await chatService.getConversations({ organization_id: activeOrgId });
      setConversations(sessionItems || []);
      return sessionItems || [];
    } catch (err) {
      console.error("Failed to load conversations:", err);
      return [];
    }
  }, [activeOrgId]);

  // Load message detail when selecting a conversation
  useEffect(() => {
    if (!activeConvId || activeConvId.startsWith("temp-")) return;
    if (messagesMap[activeConvId]) return;

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
          timestamp: format(new Date(m.created_at), "HH:mm"),
        }));

        setMessagesMap((prev) => ({ ...prev, [activeConvId]: mappedMsgs }));
        setTimeout(() => scrollToBottom(false), 100);
      } catch (err) {
        console.error("Failed to load conversation message detail:", err);
      }
    };

    loadDetail();
  }, [activeConvId, messagesMap, scrollToBottom]);

  // Handle workspace change event
  useEffect(() => {
    const handleOrgChange = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsSending(false);
      }
      initialSelectionDoneRef.current = false;
      setActiveConvId("");
      setConversations([]);
      setMessagesMap({});
      setSelectedPolicyId("");
      setSelectedRegulationId("");
      setSelectedReportId("");
      setSelectedFindingId("");
      loadWorkspaceContext();
    };

    loadWorkspaceContext();
    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, [loadWorkspaceContext]);

  // Initial load: fetch conversations and only auto-select latest if initial page mount
  useEffect(() => {
    if (!activeOrgId) return;
    let isMounted = true;
    refreshConversations().then((items) => {
      if (!isMounted) return;
      if (!initialSelectionDoneRef.current && items && items.length > 0) {
        initialSelectionDoneRef.current = true;
        // If not started with URL question, default to first conversation on fresh page open
        if (!paramQuestion) {
          setActiveConvId(items[0].id);
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [activeOrgId, refreshConversations, paramQuestion]);

  // Handle URL parameter initial prompt trigger
  useEffect(() => {
    if (paramQuestion && !isSending && !activeConvId) {
      handleSendMessage(undefined, paramQuestion);
    }
  }, [paramQuestion]);

  const activeMessages = activeConvId ? messagesMap[activeConvId] || [] : [];
  const activeSession = conversations.find((c) => c.id === activeConvId);

  // Active Context Label & Chip computation
  const activeContextChip = useMemo(() => {
    if (selectedReportId) {
      const rep = entities.reports.find((r) => r.id === selectedReportId);
      const shortId = selectedReportId.slice(0, 8);
      return {
        type: "report" as const,
        id: selectedReportId,
        label: rep ? `Report #${shortId}` : `Report #${shortId}`,
      };
    }
    if (selectedFindingId) {
      return {
        type: "finding" as const,
        id: selectedFindingId,
        label: `Finding #${selectedFindingId.slice(0, 8)}`,
      };
    }
    if (selectedPolicyId) {
      const pol = entities.policies.find((p) => p.id === selectedPolicyId);
      return {
        type: "policy" as const,
        id: selectedPolicyId,
        label: pol ? `Policy: ${pol.title}` : `Policy #${selectedPolicyId.slice(0, 8)}`,
      };
    }
    if (selectedRegulationId) {
      const reg = entities.regulations.find((r) => r.id === selectedRegulationId);
      return {
        type: "regulation" as const,
        id: selectedRegulationId,
        label: reg ? `Regulation: ${reg.title}` : `Regulation #${selectedRegulationId.slice(0, 8)}`,
      };
    }
    return null;
  }, [selectedReportId, selectedFindingId, selectedPolicyId, selectedRegulationId, entities]);

  // Page Header Details
  const isReportSpecific = !!selectedReportId;
  const isFindingSpecific = !!selectedFindingId;

  const headerTitle = useMemo(() => {
    if (activeSession && activeSession.title) {
      const sanitized = cleanConversationTitle(activeSession.title);
      // If user hasn't explicitly customized, prioritize contextual headers
      if (!sanitized.toLowerCase().startsWith("new conversation") && !sanitized.toLowerCase().startsWith("compliance review #")) {
        return sanitized;
      }
    }
    if (isReportSpecific) return "Compliance Risk Review";
    if (isFindingSpecific) return "Finding Investigation";
    return "AI Compliance Assistant";
  }, [activeSession, isReportSpecific, isFindingSpecific]);

  const headerSubtitle = useMemo(() => {
    if (isReportSpecific) {
      const shortId = selectedReportId.slice(0, 8);
      return `Report #${shortId} · ${orgName || "TechNova Solutions Pvt. Ltd."}`;
    }
    if (isFindingSpecific) {
      const shortId = selectedFindingId.slice(0, 8);
      return `Finding #${shortId} · ${orgName || "TechNova Solutions Pvt. Ltd."}`;
    }
    return "Ask questions about your policies, regulations, findings, and compliance reports.";
  }, [isReportSpecific, isFindingSpecific, selectedReportId, selectedFindingId, orgName]);

  // Suggested starter questions derived from active context
  const starterQuestions = useMemo(() => {
    if (selectedReportId) {
      const shortId = selectedReportId.slice(0, 8);
      return [
        `Summarize the major compliance risks in report #${shortId}.`,
        "Which findings in this report require immediate remediation?",
        "What is the overall risk assessment and compliance score?",
      ];
    }
    if (selectedPolicyId) {
      const p = entities.policies.find((item) => item.id === selectedPolicyId);
      const name = p ? p.title : "this policy";
      return [
        `What are the major compliance gaps in ${name}?`,
        `Which clauses in ${name} require revision under statutory regulations?`,
        `Summarize the primary responsibilities and controls in ${name}.`,
      ];
    }
    if (selectedRegulationId) {
      const r = entities.regulations.find((item) => item.id === selectedRegulationId);
      const name = r ? r.title : "this regulation";
      return [
        `Summarize the key compliance obligations under ${name}.`,
        `Which internal policies are impacted by ${name}?`,
        `What statutory penalties apply for non-compliance under ${name}?`,
      ];
    }
    return [
      "Summarize our major compliance risks across all reports.",
      "Which policies have high-risk gaps needing attention?",
      "Explain our latest non-compliant audit findings.",
    ];
  }, [selectedReportId, selectedPolicyId, selectedRegulationId, entities]);

  // Submit Question to Backend AI / Chat Stream
  const handleSendMessage = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const queryToSubmit = (overrideQuery || inputQuery).trim();
    if (!queryToSubmit || isSending) return;

    if (!activeOrgId) {
      toast.error("Please select an organization workspace first.");
      return;
    }

    let currentConvId = activeConvId;
    const timeStr = format(new Date(), "HH:mm");
    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    // 1. Clean user message without technical bracket prefixes
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: queryToSubmit,
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
      const newSessionItem: ConversationSessionItem = {
        id: currentConvId,
        title: queryToSubmit.length > 35 ? queryToSubmit.slice(0, 35) + "..." : queryToSubmit,
        organization_id: activeOrgId,
        message_count: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setConversations((prev) => [newSessionItem, ...prev]);
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
    setTimeout(() => scrollToBottom(true), 50);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestOrgId = activeOrgId;

    try {
      // Pass clean question and structured context fields
      await chatService.streamMessage(
        {
          organization_id: requestOrgId,
          question: queryToSubmit,
          conversation_id: currentConvId.startsWith("temp-") ? undefined : currentConvId,
          report_id: selectedReportId || undefined,
          finding_id: selectedFindingId || undefined,
          document_id: selectedPolicyId || undefined,
          regulation_id: selectedRegulationId || undefined,
        },
        (token: string) => {
          if (activeOrgId !== requestOrgId) return;
          setMessagesMap((prev) => {
            const list = prev[currentConvId] || [];
            return {
              ...prev,
              [currentConvId]: list.map((m) =>
                m.id === assistantMsgId ? { ...m, text: m.text + token } : m
              ),
            };
          });
          scrollToBottom(true);
        },
        (sources: SourceCitation[]) => {
          if (activeOrgId !== requestOrgId) return;
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
        (recs) => {
          if (activeOrgId !== requestOrgId) return;
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
        (doneData: { conversation_id: string }) => {
          if (activeOrgId !== requestOrgId) return;
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
          scrollToBottom(true);
        },
        (errText: string) => {
          if (activeOrgId !== requestOrgId) return;
          setIsSending(false);
          toast.error(errText || "LexisGraph could not complete retrieval right now.");

          setMessagesMap((prev) => {
            const list = prev[currentConvId] || [];
            return {
              ...prev,
              [currentConvId]: list.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      text: "I couldn't retrieve sufficient evidence in your organization's indexed documents. Please verify document status in Policy Center or select another report.",
                      isStreaming: false,
                    }
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
      toast.error("Network connection error. Please try again.");
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSending(false);
      toast.info("AI response generation stopped.");
    }
  };

  const handleNewConversation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSending(false);
    }
    setActiveConvId("");
    setInputQuery("");
    setMobileDrawerOpen(false);
  };

  // Conversation Management Handlers
  const openRenameModal = (convId: string, currentTitle: string) => {
    setRenamingConvId(convId);
    setNewTitleInput(cleanConversationTitle(currentTitle));
    setRenameDialogOpen(true);
  };

  const handleSaveRename = async () => {
    if (!renamingConvId || !newTitleInput.trim()) return;
    try {
      await chatService.updateConversation(renamingConvId, {
        title: newTitleInput.trim(),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === renamingConvId ? { ...c, title: newTitleInput.trim() } : c))
      );
      toast.success("Conversation renamed.");
      setRenameDialogOpen(false);
      setRenamingConvId(null);
    } catch {
      toast.error("Failed to rename conversation.");
    }
  };

  const openDeleteConfirmModal = (convId: string) => {
    setDeletingConvId(convId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingConvId) return;
    try {
      if (!deletingConvId.startsWith("temp-")) {
        await chatService.deleteConversation(deletingConvId, false);
      }
      setConversations((prev) => prev.filter((c) => c.id !== deletingConvId));
      setMessagesMap((prev) => {
        const copy = { ...prev };
        delete copy[deletingConvId];
        return copy;
      });
      if (activeConvId === deletingConvId) {
        setActiveConvId("");
      }
      toast.success("Conversation deleted.");
      setDeleteConfirmOpen(false);
      setDeletingConvId(null);
    } catch {
      toast.error("Failed to delete conversation.");
    }
  };

  const handleTogglePin = async (convId: string, currentPinned: boolean) => {
    try {
      await chatService.updateConversation(convId, { is_pinned: !currentPinned });
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, is_pinned: !currentPinned } : c))
      );
      toast.success(!currentPinned ? "Conversation pinned." : "Conversation unpinned.");
    } catch {
      toast.error("Failed to update pin status.");
    }
  };

  const handleDuplicateConversation = async (convId: string) => {
    try {
      const dup = await chatService.duplicateConversation(convId);
      refreshConversations();
      setActiveConvId(dup.id);
      toast.success("Conversation duplicated.");
    } catch {
      toast.error("Failed to duplicate conversation.");
    }
  };

  const handleExportConversation = async (convId: string) => {
    try {
      const blob = await chatService.exportConversation(convId, "markdown");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LexisGraph_Conversation_${convId.slice(0, 8)}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    } catch {
      toast.error("Failed to export conversation.");
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenSourceViewer = (docId?: string | null, clauseId?: string | null) => {
    if (docId) {
      setViewerDocId(docId);
      setViewerClauseId(clauseId || undefined);
      setViewerOpen(true);
    }
  };

  // Filtered conversation list
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const displayTitle = cleanConversationTitle(c.title).toLowerCase();
      return displayTitle.includes(searchConvQuery.toLowerCase());
    });
  }, [conversations, searchConvQuery]);

  const pinnedList = filteredConversations.filter((c) => c.is_pinned);
  const recentList = filteredConversations.filter((c) => !c.is_pinned);

  // Render Sidebar Conversation List
  const renderConversationItem = (conv: ConversationSessionItem) => {
    const isActive = activeConvId === conv.id;
    const cleanTitle = cleanConversationTitle(conv.title);

    return (
      <div
        key={conv.id}
        onClick={() => {
          setActiveConvId(conv.id);
          setMobileDrawerOpen(false);
        }}
        className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all text-xs border ${
          isActive
            ? "bg-primary/10 border-primary/30 text-primary font-medium shadow-2xs"
            : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        }`}
      >
        <div className="flex flex-col min-w-0 flex-1 pr-2 space-y-0.5">
          <div className="truncate flex items-center gap-1.5 font-medium">
            {conv.is_pinned && <Pin className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
            <span className="truncate">{cleanTitle}</span>
          </div>
          <span className="text-[10px] text-muted-foreground/80 font-mono">
            {conv.message_count ? `${conv.message_count} msgs · ` : ""}
            {format(new Date(conv.updated_at), "MMM d, HH:mm")}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 cursor-pointer"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 text-xs">
            <DropdownMenuItem onClick={() => handleTogglePin(conv.id, !!conv.is_pinned)}>
              {conv.is_pinned ? (
                <>
                  <PinOff className="h-3.5 w-3.5 mr-2 text-amber-500" /> Unpin Conversation
                </>
              ) : (
                <>
                  <Pin className="h-3.5 w-3.5 mr-2 text-amber-500" /> Pin Conversation
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openRenameModal(conv.id, conv.title)}>
              <Edit2 className="h-3.5 w-3.5 mr-2 text-primary" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDuplicateConversation(conv.id)}>
              <Copy className="h-3.5 w-3.5 mr-2 text-emerald-500" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportConversation(conv.id)}>
              <Download className="h-3.5 w-3.5 mr-2 text-[#0A61C9] dark:text-sky-500" /> Export Markdown
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => openDeleteConfirmModal(conv.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Thread
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  // Sidebar Component Body
  const renderSidebarContent = () => (
    <div className="flex flex-col h-full space-y-4">
      {/* Top New Chat Action */}
      <Button
        onClick={handleNewConversation}
        className="w-full bg-primary hover:bg-primary-hover text-primary-foreground text-xs h-9 rounded-xl shadow-xs cursor-pointer gap-2 font-semibold justify-center"
      >
        <Plus className="h-4 w-4" />
        <span>New Chat</span>
      </Button>

      {/* Compact Active Context Card */}
      <div className="p-3 rounded-2xl bg-card border border-border/80 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-primary" /> Active Context
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setManageContextOpen(true)}
            className="text-[11px] text-primary hover:text-primary-hover h-6 px-1.5 cursor-pointer font-medium"
          >
            Manage Context
          </Button>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-baseline justify-between text-muted-foreground">
            <span className="text-[10px] font-medium">Organization:</span>
            <span className="font-semibold text-foreground text-right truncate max-w-[170px]" title={orgName}>
              {orgName || "TechNova Solutions"}
            </span>
          </div>

          <div className="flex items-baseline justify-between text-muted-foreground">
            <span className="text-[10px] font-medium">Scope:</span>
            <span className="font-semibold text-primary text-right truncate max-w-[170px]">
              {activeContextChip ? activeContextChip.label : "All accessible documents"}
            </span>
          </div>
        </div>

        {activeContextChip && (
          <div className="pt-1 flex items-center justify-between border-t border-border/50 text-[10px]">
            <span className="text-muted-foreground">Context targeted</span>
            <button
              onClick={() => {
                setSelectedReportId("");
                setSelectedFindingId("");
                setSelectedPolicyId("");
                setSelectedRegulationId("");
                toast.info("Context cleared to All Documents.");
              }}
              className="text-muted-foreground hover:text-destructive flex items-center gap-0.5 cursor-pointer"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        )}
      </div>

      {/* Conversations Filter & List */}
      <div className="space-y-2 flex-1 min-h-0 flex flex-col">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchConvQuery}
            onChange={(e) => setSearchConvQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/40 rounded-xl border border-border text-foreground focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {pinnedList.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider px-2 flex items-center gap-1">
                <Pin className="h-3 w-3 fill-amber-500" /> Pinned ({pinnedList.length})
              </span>
              {pinnedList.map(renderConversationItem)}
            </div>
          )}

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 block">
              Conversations ({recentList.length})
            </span>

            {filteredConversations.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3 text-center italic">
                {searchConvQuery ? "No matching conversations." : "No prior conversations."}
              </p>
            ) : (
              recentList.map(renderConversationItem)
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-background text-foreground overflow-hidden">
      {/* Two-Panel Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (Desktop: 280-320px) */}
        {!sidebarCollapsed && (
          <aside className="hidden lg:flex w-72 xl:w-80 flex-col border-r border-border bg-card/40 p-3.5 overflow-hidden shrink-0">
            {renderSidebarContent()}
          </aside>
        )}

        {/* Central Assistant Workspace */}
        <main className="flex flex-1 flex-col overflow-hidden bg-background min-w-0">
          {/* Compact Conversation Header */}
          <div className="border-b border-border px-4 md:px-6 py-2.5 bg-card/50 backdrop-blur-sm flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:flex h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setMobileDrawerOpen(true)}
                className="lg:hidden h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Open conversations drawer"
              >
                <Menu className="h-4 w-4" />
              </Button>

              <div className="space-y-0.5 truncate">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm md:text-base font-bold text-foreground truncate flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-accent shrink-0" />
                    <span>{headerTitle}</span>
                  </h2>
                  {activeContextChip && (
                    <Badge variant="outline" className="hidden sm:inline-flex text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/5">
                      {activeContextChip.label}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{headerSubtitle}</p>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setManageContextOpen(true)}
                className="text-xs h-7 gap-1 border-border bg-background hover:bg-muted text-foreground cursor-pointer"
              >
                <SlidersHorizontal className="h-3 w-3 text-primary" />
                <span className="hidden sm:inline">Context</span>
              </Button>

              {activeConvId && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 text-xs">
                    <DropdownMenuItem onClick={() => openRenameModal(activeConvId, activeSession?.title || "")}>
                      <Edit2 className="h-3.5 w-3.5 mr-2 text-primary" /> Rename Title
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExportConversation(activeConvId)}>
                      <Download className="h-3.5 w-3.5 mr-2 text-[#0A61C9] dark:text-sky-500" /> Export Markdown
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => openDeleteConfirmModal(activeConvId)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Thread
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Conversation Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {activeMessages.length === 0 ? (
              <div className="max-w-2xl mx-auto py-10 md:py-16 text-center space-y-6">
                <div className="h-14 w-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-lg">
                  <Bot className="h-7 w-7" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-base md:text-lg font-bold text-foreground">
                    Ask LexisGraph AI
                  </h3>
                  <p className="text-xs md:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                    Explore your organization's policies, statutory regulations, compliance findings, and reports.
                  </p>
                </div>

                {/* Contextual Starter Questions */}
                <div className="space-y-2.5 pt-2 text-left max-w-xl mx-auto">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 px-1">
                    <HelpCircle className="h-3.5 w-3.5 text-accent" /> Starter Inquiries
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {starterQuestions.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(undefined, q)}
                        className="p-3 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-xs text-foreground font-medium flex items-center justify-between group cursor-pointer shadow-xs text-left"
                      >
                        <span>{q}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-6">
                {activeMessages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onRegenerate={() => {
                      // Find previous user message
                      const idx = activeMessages.findIndex((m) => m.id === msg.id);
                      if (idx > 0 && activeMessages[idx - 1].sender === "user") {
                        handleSendMessage(undefined, activeMessages[idx - 1].text);
                      }
                    }}
                    onCopy={handleCopyText}
                    onSelectQuestion={(q) => handleSendMessage(undefined, q)}
                    onOpenViewer={handleOpenSourceViewer}
                    onManageContext={() => setManageContextOpen(true)}
                    copiedId={copiedId}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Sticky Message Composer */}
          <MessageInput
            inputQuery={inputQuery}
            setInputQuery={setInputQuery}
            onSendMessage={(e) => handleSendMessage(e)}
            isSending={isSending}
            onStopStreaming={handleStopStreaming}
            activeContextChip={activeContextChip}
            onClearContextChip={() => {
              setSelectedReportId("");
              setSelectedFindingId("");
              setSelectedPolicyId("");
              setSelectedRegulationId("");
              toast.info("Context reset to all documents.");
            }}
            onOpenManageContext={() => setManageContextOpen(true)}
          />
        </main>
      </div>

      {/* Document Viewer Drawer */}
      <DocumentViewerDrawer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        documentId={viewerDocId}
        clauseId={viewerClauseId}
      />

      {/* Mobile Sidebar Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative w-72 max-w-[80%] bg-card border-r border-border p-4 shadow-2xl z-10 flex flex-col h-full">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
              <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-primary" /> Copilot Menu
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setMobileDrawerOpen(false)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Manage Context Modal Dialog */}
      <Dialog open={manageContextOpen} onOpenChange={setManageContextOpen}>
        <DialogContent className="max-w-md p-6 bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-foreground">
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Manage Active Context
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select specific reports, policies, or regulations to ground the assistant's retrieval.
            </DialogDescription>
          </DialogHeader>

          {/* Context Tab Selector */}
          <div className="flex border-b border-border text-xs gap-4 pt-1">
            <button
              onClick={() => {
                setContextFilterTab("report");
                setContextSearchText("");
              }}
              className={`pb-2 font-medium border-b-2 transition-all cursor-pointer ${
                contextFilterTab === "report"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Reports ({entities.reports.length})
            </button>
            <button
              onClick={() => {
                setContextFilterTab("policy");
                setContextSearchText("");
              }}
              className={`pb-2 font-medium border-b-2 transition-all cursor-pointer ${
                contextFilterTab === "policy"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Policies ({entities.policies.length})
            </button>
            <button
              onClick={() => {
                setContextFilterTab("regulation");
                setContextSearchText("");
              }}
              className={`pb-2 font-medium border-b-2 transition-all cursor-pointer ${
                contextFilterTab === "regulation"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Regulations ({entities.regulations.length})
            </button>
          </div>

          {/* Search inside entity selector */}
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={contextSearchText}
              onChange={(e) => setContextSearchText(e.target.value)}
              placeholder={`Search ${contextFilterTab}s...`}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/40 rounded-xl border border-border text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Entity List */}
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 py-1">
            {contextFilterTab === "report" && (
              <>
                <div
                  onClick={() => {
                    setSelectedReportId("");
                    setSelectedFindingId("");
                  }}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                    !selectedReportId
                      ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                      : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>All Audit Reports (Broad Scope)</span>
                  {!selectedReportId && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                {entities.reports
                  .filter((r) => r.title.toLowerCase().includes(contextSearchText.toLowerCase()))
                  .map((r) => (
                    <div
                      key={r.id}
                      onClick={() => {
                        setSelectedReportId(r.id);
                        setSelectedFindingId("");
                      }}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                        selectedReportId === r.id
                          ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                          : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <span className="font-mono text-primary font-semibold">#{r.id.slice(0, 8)}: </span>
                        <span>{r.title.replace(/^Report #[0-9a-fA-F]{8}:\s*/, "")}</span>
                      </div>
                      {selectedReportId === r.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                  ))}
              </>
            )}

            {contextFilterTab === "policy" && (
              <>
                <div
                  onClick={() => setSelectedPolicyId("")}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                    !selectedPolicyId
                      ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                      : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>All Company Policies</span>
                  {!selectedPolicyId && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                {entities.policies
                  .filter((p) => p.title.toLowerCase().includes(contextSearchText.toLowerCase()))
                  .map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPolicyId(p.id)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                        selectedPolicyId === p.id
                          ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                          : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="truncate pr-2">{p.title}</span>
                      {selectedPolicyId === p.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                  ))}
              </>
            )}

            {contextFilterTab === "regulation" && (
              <>
                <div
                  onClick={() => setSelectedRegulationId("")}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                    !selectedRegulationId
                      ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                      : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>All Global Regulations</span>
                  {!selectedRegulationId && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                {entities.regulations
                  .filter((r) => r.title.toLowerCase().includes(contextSearchText.toLowerCase()))
                  .map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRegulationId(r.id)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                        selectedRegulationId === r.id
                          ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                          : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="truncate pr-2">{r.title}</span>
                      {selectedRegulationId === r.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                  ))}
              </>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between pt-3 border-t border-border gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedReportId("");
                setSelectedFindingId("");
                setSelectedPolicyId("");
                setSelectedRegulationId("");
                setManageContextOpen(false);
                toast.info("Scope cleared to all accessible documents.");
              }}
              className="text-xs text-muted-foreground hover:text-destructive cursor-pointer"
            >
              Clear Scope
            </Button>
            <Button
              onClick={() => {
                setManageContextOpen(false);
                toast.success("Active context updated.");
              }}
              className="bg-primary hover:bg-primary-hover text-primary-foreground text-xs h-8 px-4 rounded-xl cursor-pointer"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Conversation Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-sm p-6 bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-primary" /> Rename Conversation
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Provide a concise, readable title for this conversation thread.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Input
              value={newTitleInput}
              onChange={(e) => setNewTitleInput(e.target.value)}
              placeholder="e.g., Q3 DPDP Risk Review"
              className="bg-background border-border text-xs h-9 text-foreground rounded-xl"
              autoFocus
            />
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRenameDialogOpen(false)}
              className="text-xs h-8 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRename}
              disabled={!newTitleInput.trim()}
              className="bg-primary hover:bg-primary-hover text-primary-foreground text-xs h-8 px-4 rounded-xl cursor-pointer"
            >
              Save Title
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm p-6 bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Delete Conversation
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to permanently delete this conversation history? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex items-center justify-end gap-2 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteConfirmOpen(false)}
              className="text-xs h-8 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              className="text-xs h-8 px-4 rounded-xl cursor-pointer font-semibold"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AIAssistantPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <AIAssistantContent />
      </AppShell>
    </ProtectedRoute>
  );
}
