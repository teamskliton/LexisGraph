"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Sparkles,
  Bot,
  User,
  Send,
  Square,
  Plus,
  Trash2,
  Edit2,
  Pin,
  Download,
  Copy,
  Check,
  RefreshCw,
  Search,
  Layers,
  LogOut,
  ArrowLeft,
  Filter,
  Shield,
  BookOpen,
  FileText,
  AlertTriangle,
  BarChart3,
  Network,
  ChevronRight,
  ExternalLink,
  Info,
  HelpCircle,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
  X,
  Menu,
} from "lucide-react";
import { format } from "date-fns";

import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { OrganizationSwitcher } from "@/components/layout/OrganizationSwitcher";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { organizationsService, Organization } from "@/services/api/organizations";
import { documentService } from "@/services/document-service";
import { regulationsApi, GlobalRegulation } from "@/services/api/regulations";
import { api } from "@/services/api";
import {
  chatService,
  SourceCitation,
  ConversationSessionItem,
  ChatResponsePayload,
} from "@/services/chat-service";
import { DocumentViewerDrawer } from "@/components/chat/DocumentViewerDrawer";
import type { RecommendedActionItem } from "@/components/chat/RecommendedActions";
import type { RelatedDocumentItem } from "@/components/chat/RelatedDocuments";

// ---------------------------------------------------------------------------
// Types & Models
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  sources?: SourceCitation[];
  follow_up_questions?: string[];
  recommended_actions?: RecommendedActionItem[];
  related_documents?: RelatedDocumentItem[];
  isStreaming?: boolean;
  timestamp: string;
}

interface ContextEntities {
  policies: { id: string; title: string }[];
  regulations: { id: string; title: string }[];
  reports: { id: string; title: string }[];
  findings: { id: string; title: string }[];
}

// ---------------------------------------------------------------------------
// Component Implementation
// ---------------------------------------------------------------------------

export function AIAssistantContent() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL Context parameters
  const paramPolicyId = searchParams.get("policyId");
  const paramRegulationId = searchParams.get("regulationId");
  const paramReportId = searchParams.get("reportId");
  const paramFindingId = searchParams.get("findingId");
  const paramQuestion = searchParams.get("question");
  const paramFocus = searchParams.get("focus");

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

  // Mobile drawer state
  const [showMobileFilterDrawer, setShowMobileFilterDrawer] = useState<boolean>(false);

  // Conversation history sessions from backend PostgreSQL
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

  // Load Organization & Real Context Entities
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
      let mappedReports: { id: string; title: string }[] = [];
      try {
        const reportRes = await api.get("/reports", { params: { organization_id: orgId } });
        mappedReports = (reportRes.data?.items || []).map((rp: any) => ({
          id: rp.id,
          title: `Compliance Report #${rp.id.slice(0, 8)} (${rp.risk_level || "Report"})`,
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

  // Fetch Conversation Sessions from PostgreSQL backend
  const refreshConversations = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const sessionItems = await chatService.getConversations({ organization_id: activeOrgId });
      setConversations(sessionItems || []);
      if (sessionItems.length > 0 && !activeConvId) {
        setActiveConvId(sessionItems[0].id);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }, [activeOrgId, activeConvId]);

  useEffect(() => {
    loadWorkspaceContext();
    const handleOrgChange = () => loadWorkspaceContext();
    window.addEventListener("organization_changed", handleOrgChange);
    return () => window.removeEventListener("organization_changed", handleOrgChange);
  }, [loadWorkspaceContext]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

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
      } catch (err) {
        console.error("Failed to load conversation message detail:", err);
      }
    };

    loadDetail();
  }, [activeConvId, messagesMap]);

  // Handle URL Parameter initial prompt trigger
  useEffect(() => {
    if (paramQuestion && !isSending && !activeConvId) {
      handleSendMessage(undefined, paramQuestion);
    }
  }, [paramQuestion]);

  const activeMessages = activeConvId ? messagesMap[activeConvId] || [] : [];
  const activeSession = conversations.find((c) => c.id === activeConvId);

  // Suggested Questions derived from selected context
  const suggestedQuestions = useMemo(() => {
    if (selectedPolicyId) {
      const found = entities.policies.find((p) => p.id === selectedPolicyId);
      const name = found ? found.title : "this policy";
      return [
        `What are the major compliance gaps in ${name}?`,
        `Which clauses in ${name} require immediate revision?`,
        `Compare ${name} against applicable statutory acts.`,
      ];
    }
    if (selectedRegulationId) {
      const found = entities.regulations.find((r) => r.id === selectedRegulationId);
      const name = found ? found.title : "this regulation";
      return [
        `Which company policies are affected by ${name}?`,
        `Summarize the key compliance requirements under ${name}.`,
        `What penalties apply for non-compliance under ${name}?`,
      ];
    }
    if (selectedReportId) {
      return [
        "Summarize the major compliance risks in this report.",
        "Which findings in this report should be addressed first?",
        "What recommendations have been generated for this audit?",
      ];
    }
    if (paramFocus) {
      return [
        `Explain the relationship involving '${paramFocus}'.`,
        `Which regulations apply to '${paramFocus}'?`,
        `Show compliance gaps connected to '${paramFocus}'.`,
      ];
    }
    return [
      "Which policies have the highest compliance risk?",
      "What are our critical findings across all policies?",
      "Which regulations affect our active organization workspace?",
    ];
  }, [selectedPolicyId, selectedRegulationId, selectedReportId, paramFocus, entities]);

  // Context Framing String construction
  const buildFramedQuestion = (rawQuery: string): string => {
    let contextStr = "";
    if (selectedPolicyId) {
      const p = entities.policies.find((item) => item.id === selectedPolicyId);
      if (p) contextStr += `[Context Policy: ${p.title}] `;
    }
    if (selectedRegulationId) {
      const r = entities.regulations.find((item) => item.id === selectedRegulationId);
      if (r) contextStr += `[Context Regulation: ${r.title}] `;
    }
    if (selectedReportId) {
      contextStr += `[Context Report ID: ${selectedReportId}] `;
    }
    if (paramFocus) {
      contextStr += `[Context Focus: ${paramFocus}] `;
    }

    return contextStr ? `${contextStr}${rawQuery}` : rawQuery;
  };

  // Submit Question to Backend AI / Chat Stream
  const handleSendMessage = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const queryToSubmit = (overrideQuery || inputQuery).trim();
    if (!queryToSubmit || isSending) return;

    if (!activeOrgId) {
      toast.error("Please select an organization first.");
      return;
    }

    const framedQuery = buildFramedQuestion(queryToSubmit);
    let currentConvId = activeConvId;
    const timeStr = format(new Date(), "HH:mm");

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await chatService.streamMessage(
        {
          organization_id: activeOrgId,
          question: framedQuery,
          conversation_id: currentConvId.startsWith("temp-") ? undefined : currentConvId,
        },
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
        (errText: string) => {
          setIsSending(false);
          toast.error(errText || "LexisGraph could not complete this analysis right now.");

          setMessagesMap((prev) => {
            const list = prev[currentConvId] || [];
            return {
              ...prev,
              [currentConvId]: list.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      text: "I couldn't find sufficient evidence in your organization's documents to answer this confidently.",
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
    setActiveConvId("");
    setInputQuery("");
  };

  const handleClearConversation = async () => {
    if (!activeConvId) return;
    try {
      if (!activeConvId.startsWith("temp-")) {
        await chatService.deleteConversation(activeConvId);
      }
      setConversations((prev) => prev.filter((c) => c.id !== activeConvId));
      setMessagesMap((prev) => {
        const copy = { ...prev };
        delete copy[activeConvId];
        return copy;
      });
      setActiveConvId("");
      toast.success("Conversation cleared.");
    } catch (err) {
      toast.error("Failed to clear conversation.");
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

  const handleExecuteRecommendedAction = (action: RecommendedActionItem) => {
    if (action.type === "view_graph") {
      router.push("/knowledge-graph");
    } else if (action.type === "view_document") {
      router.push("/documents");
    } else if (action.type === "compare_policy" || action.type === "run_analysis") {
      router.push("/compliance");
    } else {
      router.push("/reports");
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-foreground text-sm">LexisGraph</span>
              <span className="text-muted-foreground text-xs">/</span>
              <span className="font-semibold text-xs text-indigo-500">AI Legal & Compliance Assistant</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <OrganizationSwitcher onOrganizationChanged={loadWorkspaceContext} />
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="bg-card border-border text-foreground hover:bg-muted text-xs gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (Desktop): Context Filters & History Sessions */}
        <aside className="hidden lg:flex w-80 flex-col border-r border-border bg-card/50 p-4 space-y-5 overflow-y-auto shrink-0">
          {/* Header Action */}
          <Button
            onClick={handleNewConversation}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 rounded-xl shadow-md cursor-pointer gap-1.5 font-semibold"
          >
            <Plus className="h-4 w-4" /> New Conversation
          </Button>

          {/* Context Selector Panel */}
          <div className="space-y-3 p-3 rounded-2xl bg-card border border-border/80 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-500" /> Active Context Scope
              </span>
              {(selectedPolicyId || selectedRegulationId || selectedReportId) && (
                <button
                  onClick={() => {
                    setSelectedPolicyId("");
                    setSelectedRegulationId("");
                    setSelectedReportId("");
                  }}
                  className="text-[10px] text-indigo-500 hover:underline cursor-pointer"
                >
                  Clear Scope
                </button>
              )}
            </div>

            {/* Active Org */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                Organization
              </label>
              <div className="p-2 rounded-xl bg-muted/30 border border-border/60 text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-indigo-500" />
                <span className="truncate">{orgName || "Active Workspace"}</span>
              </div>
            </div>

            {/* Policy Filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                Policy Scope
              </label>
              <select
                value={selectedPolicyId}
                onChange={(e) => setSelectedPolicyId(e.target.value)}
                className="w-full bg-background border border-border text-foreground text-xs h-8 rounded-xl px-2 truncate"
              >
                <option value="">All Company Policies</option>
                {entities.policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Regulation Filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                Regulation Scope
              </label>
              <select
                value={selectedRegulationId}
                onChange={(e) => setSelectedRegulationId(e.target.value)}
                className="w-full bg-background border border-border text-foreground text-xs h-8 rounded-xl px-2 truncate"
              >
                <option value="">All Applicable Regulations</option>
                {entities.regulations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Report Filter */}
            {entities.reports.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                  Report Scope
                </label>
                <select
                  value={selectedReportId}
                  onChange={(e) => setSelectedReportId(e.target.value)}
                  className="w-full bg-background border border-border text-foreground text-xs h-8 rounded-xl px-2 truncate"
                >
                  <option value="">All Audit Reports</option>
                  {entities.reports.map((rp) => (
                    <option key={rp.id} value={rp.id}>
                      {rp.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Persistent Conversation Threads */}
          <div className="space-y-2 flex-1 overflow-y-auto">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">
              Recent Threads ({conversations.length})
            </h4>

            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-1">No prior conversations.</p>
            ) : (
              <div className="space-y-1">
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setActiveConvId(c.id)}
                    className={`group p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${
                      activeConvId === c.id
                        ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-semibold"
                        : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="truncate text-xs">{c.title}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {format(new Date(c.updated_at), "MMM d · HH:mm")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Central Assistant Workspace */}
        <main className="flex flex-1 flex-col overflow-hidden bg-background">
          {/* Header Banner */}
          <div className="border-b border-border/80 px-6 py-3 bg-card/30 flex items-center justify-between shrink-0">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                {activeSession ? activeSession.title : "New Compliance Query"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Ask questions about policies, statutory regulations, compliance findings, and knowledge graph links for <span className="font-semibold text-foreground">{orgName}</span>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMobileFilterDrawer(true)}
                className="lg:hidden p-2 rounded-xl bg-card border border-border text-xs text-foreground cursor-pointer flex items-center gap-1"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-500" /> Context
              </button>

              {activeConvId && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleClearConversation}
                  className="text-xs text-muted-foreground hover:text-rose-500 cursor-pointer gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear Thread
                </Button>
              )}
            </div>
          </div>

          {/* Conversation Message List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeMessages.length === 0 ? (
              <div className="max-w-2xl mx-auto py-12 text-center space-y-6">
                <div className="h-16 w-16 mx-auto rounded-3xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center shadow-xl">
                  <Bot className="h-8 w-8" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-base font-bold text-foreground">
                    LexisGraph AI Legal & Compliance Assistant
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                    Powered by hybrid GraphRAG (Qdrant vectors + Neo4j legal knowledge graph). Answers are derived strictly from your workspace's statutory acts and company policies.
                  </p>
                </div>

                {/* Suggested Questions Grid */}
                <div className="space-y-3 pt-4 text-left">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5 text-indigo-500" /> Suggested Compliance Questions
                  </h4>
                  <div className="grid grid-cols-1 gap-2.5">
                    {suggestedQuestions.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(undefined, q)}
                        className="p-3 rounded-2xl bg-card border border-border/80 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-xs text-foreground font-medium flex items-center justify-between group cursor-pointer shadow-2xs"
                      >
                        <span>{q}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-6">
                {activeMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col space-y-3 ${
                      msg.sender === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    {/* Message Bubble */}
                    <div
                      className={`p-4 rounded-2xl text-xs max-w-2xl space-y-2 shadow-sm ${
                        msg.sender === "user"
                          ? "bg-indigo-600 text-white rounded-br-none"
                          : "bg-card border border-border/80 text-foreground rounded-bl-none"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 border-b border-white/10 dark:border-border/40 pb-1.5 text-[10px]">
                        <span className="font-bold uppercase tracking-wider flex items-center gap-1">
                          {msg.sender === "user" ? (
                            <>
                              <User className="h-3 w-3" /> You
                            </>
                          ) : (
                            <>
                              <Bot className="h-3 w-3 text-indigo-500" /> LexisGraph Assistant
                            </>
                          )}
                        </span>
                        <span className="opacity-70 font-mono">{msg.timestamp}</span>
                      </div>

                      <div className="leading-relaxed whitespace-pre-wrap font-medium">
                        {msg.text}
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-3 ml-1 bg-indigo-500 animate-pulse" />
                        )}
                      </div>
                    </div>

                    {/* Sources & Citations (for Assistant messages) */}
                    {msg.sender === "assistant" && msg.sources && msg.sources.length > 0 && (
                      <div className="w-full max-w-2xl space-y-2 p-3 rounded-2xl bg-card border border-border/60">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <BookOpen className="h-3.5 w-3.5 text-indigo-500" /> Verified Legal Citations & Sources ({msg.sources.length})
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.sources.map((src, sIdx) => (
                            <div
                              key={sIdx}
                              onClick={() => handleOpenSourceViewer(src.document_id, src.clause_id)}
                              className="p-2.5 rounded-xl border border-border/60 bg-muted/20 hover:border-indigo-500/40 cursor-pointer transition-all space-y-1"
                            >
                              <div className="flex items-center justify-between text-[10px]">
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-border/60">
                                  {src.type || "Source"}
                                </Badge>
                                <span className="font-mono text-indigo-500 font-semibold">
                                  {src.confidence_score ? `${(src.confidence_score * 100).toFixed(0)}% Match` : ""}
                                </span>
                              </div>
                              <h5 className="font-bold text-xs text-foreground truncate" title={src.document}>
                                {src.document}
                              </h5>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                                "{src.clause}"
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Follow-up Questions & Recommended Actions */}
                    {msg.sender === "assistant" && !msg.isStreaming && (
                      <div className="w-full max-w-2xl space-y-3 pt-1">
                        {/* Follow up prompts */}
                        {msg.follow_up_questions && msg.follow_up_questions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.follow_up_questions.map((fq, fIdx) => (
                              <button
                                key={fIdx}
                                onClick={() => handleSendMessage(undefined, fq)}
                                className="px-3 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[11px] font-semibold hover:bg-indigo-500/20 transition-all cursor-pointer"
                              >
                                ↳ {fq}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Recommended Legal Actions */}
                        {msg.recommended_actions && msg.recommended_actions.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                            {msg.recommended_actions.map((act, aIdx) => (
                              <Button
                                key={aIdx}
                                variant="outline"
                                size="xs"
                                onClick={() => handleExecuteRecommendedAction(act)}
                                className="text-xs h-7 gap-1.5 cursor-pointer bg-background border-border text-foreground hover:bg-muted"
                              >
                                <ExternalLink className="h-3 w-3 text-indigo-500" /> {act.title}
                              </Button>
                            ))}
                          </div>
                        )}

                        {/* Legal Disclaimer */}
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 pt-1">
                          <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span>
                            LexisGraph provides compliance analysis based on available documents. It is not a substitute for professional legal advice.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Chat Input Bar */}
          <div className="border-t border-border p-4 bg-card/60 backdrop-blur-md shrink-0">
            <form
              onSubmit={(e) => handleSendMessage(e)}
              className="max-w-3xl mx-auto flex items-center gap-2"
            >
              <Input
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Ask about your organization's compliance, policies, or statutory acts…"
                disabled={isSending}
                className="bg-background border-border text-xs h-10 text-foreground rounded-xl flex-1 focus:ring-2 focus:ring-indigo-500"
              />

              {isSending ? (
                <Button
                  type="button"
                  onClick={handleStopStreaming}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs h-10 px-4 rounded-xl cursor-pointer gap-1.5 font-semibold"
                >
                  <Square className="h-3.5 w-3.5 fill-white" /> Stop
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!inputQuery.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-10 px-5 rounded-xl shadow-md cursor-pointer gap-1.5 font-semibold"
                >
                  <Send className="h-3.5 w-3.5" /> Send
                </Button>
              )}
            </form>
          </div>
        </main>
      </div>

      {/* Document Viewer Drawer */}
      <DocumentViewerDrawer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        documentId={viewerDocId}
        clauseId={viewerClauseId}
      />

      {/* Mobile Context Drawer Modal */}
      {showMobileFilterDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs p-4 lg:hidden">
          <div className="bg-background border border-border rounded-2xl w-full max-w-xs p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4 text-indigo-500" /> Mobile Context Scope
              </h3>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowMobileFilterDrawer(false)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                  Policy Scope
                </label>
                <select
                  value={selectedPolicyId}
                  onChange={(e) => setSelectedPolicyId(e.target.value)}
                  className="w-full bg-card border border-border text-foreground text-xs h-9 rounded-xl px-2"
                >
                  <option value="">All Company Policies</option>
                  {entities.policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                  Regulation Scope
                </label>
                <select
                  value={selectedRegulationId}
                  onChange={(e) => setSelectedRegulationId(e.target.value)}
                  className="w-full bg-card border border-border text-foreground text-xs h-9 rounded-xl px-2"
                >
                  <option value="">All Applicable Regulations</option>
                  {entities.regulations.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2">
              <Button
                onClick={() => setShowMobileFilterDrawer(false)}
                className="w-full bg-indigo-600 text-white text-xs h-9 rounded-xl"
              >
                Apply Context
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AIAssistantPage() {
  return (
    <ProtectedRoute>
      <AIAssistantContent />
    </ProtectedRoute>
  );
}
