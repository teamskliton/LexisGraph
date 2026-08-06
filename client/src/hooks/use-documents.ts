// useDocuments — Custom hook for managing workspace documents state
// Supports filtering, sorting, selection, upload simulation, and preview drawer state.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OrganizationDocumentExtended,
  MOCK_ORGANIZATION_DOCUMENTS,
  DocumentCategory,
  ProcessingStatus,
} from "@/components/features/documents/documents-types";

export type DocumentSortKey = "name" | "uploaded_at" | "file_size";

export interface UseDocumentsResult {
  documents: OrganizationDocumentExtended[];
  isLoading: boolean;
  error: string | null;

  // Filter & Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  typeFilter: "All" | DocumentCategory;
  setTypeFilter: (t: "All" | DocumentCategory) => void;

  statusFilter: "All" | ProcessingStatus;
  setStatusFilter: (s: "All" | ProcessingStatus) => void;

  sortKey: DocumentSortKey;
  setSortKey: (k: DocumentSortKey) => void;

  viewMode: "grid" | "list";
  setViewMode: (v: "grid" | "list") => void;

  // Selection
  selectedDocIds: string[];
  toggleSelectDoc: (id: string) => void;
  selectAllDocs: () => void;
  clearSelection: () => void;

  // Preview Drawer
  previewDoc: OrganizationDocumentExtended | null;
  openPreview: (doc: OrganizationDocumentExtended) => void;
  closePreview: () => void;

  // Upload Modal State
  isUploadOpen: boolean;
  openUpload: () => void;
  closeUpload: () => void;

  // Handlers
  refetch: () => void;
  addDocument: (doc: OrganizationDocumentExtended) => void;
  deleteDocument: (id: string) => void;
  renameDocument: (id: string, newName: string) => void;
}

export function useDocuments(organizationId?: string): UseDocumentsResult {
  const [documents, setDocuments] = useState<OrganizationDocumentExtended[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | DocumentCategory>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | ProcessingStatus>("All");
  const [sortKey, setSortKey] = useState<DocumentSortKey>("uploaded_at");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("doc_view_mode") as "grid" | "list") || "list";
    }
    return "list";
  });

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [previewDoc, setPreviewDoc] = useState<OrganizationDocumentExtended | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      setDocuments(MOCK_ORGANIZATION_DOCUMENTS);
    } catch {
      setError("Failed to load workspace documents. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleSetViewMode = useCallback((mode: "grid" | "list") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("doc_view_mode", mode);
    }
  }, []);

  // Selection
  const toggleSelectDoc = useCallback((id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const selectAllDocs = useCallback(() => {
    setSelectedDocIds(documents.map((d) => d.id));
  }, [documents]);

  const clearSelection = useCallback(() => {
    setSelectedDocIds([]);
  }, []);

  // Preview Drawer
  const openPreview = useCallback((doc: OrganizationDocumentExtended) => {
    setPreviewDoc(doc);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewDoc(null);
  }, []);

  // Upload Modal
  const openUpload = useCallback(() => setIsUploadOpen(true), []);
  const closeUpload = useCallback(() => setIsUploadOpen(false), []);

  // Handlers
  const addDocument = useCallback((newDoc: OrganizationDocumentExtended) => {
    setDocuments((prev) => [newDoc, ...prev]);
  }, []);

  const deleteDocument = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setSelectedDocIds((prev) => prev.filter((i) => i !== id));
  }, []);

  const renameDocument = useCallback((id: string, newName: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, name: newName } : d))
    );
  }, []);

  // Derived filtered & sorted docs
  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (typeFilter !== "All") {
      result = result.filter((d) => d.category === typeFilter);
    }

    if (statusFilter !== "All") {
      result = result.filter((d) => d.status === statusFilter);
    }

    result.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "file_size") return a.file_size.localeCompare(b.file_size);
      return (
        new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
      );
    });

    return result;
  }, [documents, searchQuery, typeFilter, statusFilter, sortKey]);

  return {
    documents: filteredDocuments,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    sortKey,
    setSortKey,
    viewMode,
    setViewMode: handleSetViewMode,
    selectedDocIds,
    toggleSelectDoc,
    selectAllDocs,
    clearSelection,
    previewDoc,
    openPreview,
    closePreview,
    isUploadOpen,
    openUpload,
    closeUpload,
    refetch: fetchDocuments,
    addDocument,
    deleteDocument,
    renameDocument,
  };
}


