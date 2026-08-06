// DocumentGrid — Grid layout container for DocumentCard items

"use client";

import { memo } from "react";
import { DocumentCard } from "./DocumentCard";
import type { OrganizationDocumentExtended } from "./documents-types";

interface DocumentGridProps {
  documents: OrganizationDocumentExtended[];
  selectedDocIds?: string[];
  onSelectDoc?: (id: string) => void;
  onPreviewDoc: (doc: OrganizationDocumentExtended) => void;
  onRenameDoc?: (id: string, currentName: string) => void;
  onReplaceDoc?: (doc: OrganizationDocumentExtended) => void;
  onDownloadDoc?: (doc: OrganizationDocumentExtended) => void;
  onDeleteDoc?: (id: string) => void;
}

export const DocumentGrid = memo(function DocumentGrid({
  documents,
  selectedDocIds = [],
  onSelectDoc,
  onPreviewDoc,
  onRenameDoc,
  onReplaceDoc,
  onDownloadDoc,
  onDeleteDoc,
}: DocumentGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          document={doc}
          isSelected={selectedDocIds.includes(doc.id)}
          onSelect={onSelectDoc}
          onPreview={onPreviewDoc}
          onRename={onRenameDoc}
          onReplace={onReplaceDoc}
          onDownload={onDownloadDoc}
          onDelete={onDeleteDoc}
        />
      ))}
    </div>
  );
});
