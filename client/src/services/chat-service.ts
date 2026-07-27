import { api } from "@/services/api";

export interface SourceCitation {
  document: string;
  clause: string;
  clause_number?: string | null;
  confidence_score: number;
  search_source: "Vector Search" | "Graph Search" | "Both" | string;
}

export interface ChatRequestPayload {
  organization_id: string;
  question: string;
}

export interface ChatResponsePayload {
  answer: string;
  sources: SourceCitation[];
}

export const chatService = {
  /**
   * Send a question to the FastAPI /chat endpoint.
   */
  async sendMessage(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
    const response = await api.post<ChatResponsePayload>("/chat", payload);
    return response.data;
  },
};
