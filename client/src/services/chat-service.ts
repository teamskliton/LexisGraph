import { api } from "@/services/api";
import { getToken } from "@/utils/auth-storage";
import { RecommendedActionItem } from "@/components/chat/RecommendedActions";
import { RelatedDocumentItem } from "@/components/chat/RelatedDocuments";

export interface SourceCitation {
  document_id?: string | null;
  clause_id?: string | null;
  document: string;
  section?: string | null;
  clause: string;
  clause_number?: string | null;
  page?: number | null;
  similarity?: number | null;
  type?: string | null;
  confidence_score: number;
  search_source: "Vector Search" | "Graph Search" | "Both" | string;
}

export interface ChatRequestPayload {
  organization_id: string;
  question: string;
  conversation_id?: string;
}

export interface ChatResponsePayload {
  answer: string;
  sources: SourceCitation[];
  follow_up_questions?: string[];
  recommended_actions?: RecommendedActionItem[];
  related_documents?: RelatedDocumentItem[];
  conversation_id: string;
}

export interface ConversationSessionItem {
  id: string;
  title: string;
  organization_id?: string | null;
  is_pinned?: boolean;
  is_archived?: boolean;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessageItem {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  message: string;
  sources?: SourceCitation[] | null;
  follow_up_questions?: string[] | null;
  recommended_actions?: RecommendedActionItem[] | null;
  related_documents?: RelatedDocumentItem[] | null;
  created_at: string;
}

export interface ConversationDetailPayload {
  id: string;
  title: string;
  organization_id?: string | null;
  is_pinned?: boolean;
  is_archived?: boolean;
  created_at: string;
  updated_at: string;
  messages: ConversationMessageItem[];
}

export interface RecommendationsPayload {
  follow_up_questions?: string[];
  recommended_actions?: RecommendedActionItem[];
  related_documents?: RelatedDocumentItem[];
}

export const chatService = {
  /**
   * Send a question to the FastAPI /chat endpoint (batch mode).
   */
  async sendMessage(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
    const response = await api.post<ChatResponsePayload>("/chat", payload);
    return response.data;
  },

  /**
   * Stream tokens in real time from POST /chat/stream using SSE.
   */
  async streamMessage(
    payload: ChatRequestPayload,
    onToken: (token: string) => void,
    onSources: (sources: SourceCitation[]) => void,
    onRecommendations: (recs: RecommendationsPayload) => void,
    onDone: (data: { conversation_id: string }) => void,
    onError: (error: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const token = getToken();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

    const response = await fetch(`${baseUrl}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      let errDetail = `Request failed with status ${response.status}`;
      try {
        const errJson = await response.json();
        errDetail = errJson.detail || errJson.message || errDetail;
      } catch {
        // use default string
      }
      onError(errDetail);
      return;
    }

    if (!response.body) {
      onError("No readable response stream returned from server.");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue;

        let eventType = "message";
        let dataStr = "";

        const lines = eventBlock.split("\n");
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.replace("event: ", "").trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.replace("data: ", "").trim();
          }
        }

        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            if (eventType === "token") {
              if (parsed.text) onToken(parsed.text);
            } else if (eventType === "sources") {
              onSources(Array.isArray(parsed) ? parsed : []);
            } else if (eventType === "recommendations") {
              onRecommendations(parsed);
            } else if (eventType === "done") {
              onDone(parsed);
            } else if (eventType === "error") {
              onError(parsed.message || "Streaming error occurred.");
            }
          } catch {
            // fallback ignore parse error
          }
        }
      }
    }
  },

  /**
   * Fetch all conversation sessions for the authenticated user.
   */
  async getConversations(params?: {
    organization_id?: string;
    search?: string;
    include_archived?: boolean;
  }): Promise<ConversationSessionItem[]> {
    try {
      const response = await api.get<ConversationSessionItem[]>("/chat/conversations", {
        params: params || {},
      });
      return response.data || [];
    } catch (err) {
      console.warn("getConversations request error:", err);
      return [];
    }
  },

  /**
   * Create a new conversation session.
   */
  async createConversation(payload: {
    title?: string;
    organization_id?: string;
  }): Promise<ConversationSessionItem> {
    const response = await api.post<ConversationSessionItem>("/chat/conversations", payload);
    return response.data;
  },

  /**
   * Update conversation title, pin status, or archive status.
   */
  async updateConversation(
    conversationId: string,
    payload: { title?: string; is_pinned?: boolean; is_archived?: boolean }
  ): Promise<ConversationSessionItem> {
    const response = await api.patch<ConversationSessionItem>(
      `/chat/conversations/${conversationId}`,
      payload
    );
    return response.data;
  },

  /**
   * Duplicate a conversation thread.
   */
  async duplicateConversation(conversationId: string): Promise<ConversationDetailPayload> {
    const response = await api.post<ConversationDetailPayload>(
      `/chat/conversations/${conversationId}/duplicate`
    );
    return response.data;
  },

  /**
   * Export a conversation thread.
   */
  async exportConversation(conversationId: string, format: "markdown" | "text" | "json" = "markdown"): Promise<Blob> {
    const response = await api.get(`/chat/conversations/${conversationId}/export`, {
      params: { format },
      responseType: "blob",
    });
    return response.data;
  },

  /**
   * Get full message history for a conversation session.
   */
  async getConversationDetail(conversationId: string): Promise<ConversationDetailPayload> {
    const response = await api.get<ConversationDetailPayload>(`/chat/conversations/${conversationId}`);
    return response.data;
  },

  /**
   * Delete or archive a conversation session.
   */
  async deleteConversation(conversationId: string, soft: boolean = true): Promise<void> {
    await api.delete(`/chat/conversations/${conversationId}`, {
      params: { soft },
    });
  },
};
