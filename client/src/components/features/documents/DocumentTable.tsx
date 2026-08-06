// DocumentTable — List/Table layout container for DocumentRow items

"use client";

import { memo } from "react";
import { DocumentRow } from "./DocumentRow";
import type { OrganizationDocumentExtended } from "./documents-types";

interface DocumentTableProps {
  documents: OrganizationDocumentExtended[];
  selectedDocIds?: string[];
  onSelectDoc?: (id: string) => void;
  onPreviewDoc: (doc: OrganizationDocumentExtended) => void;
  onRenameDoc?: (id: string, currentName: string) => void;
  onReplaceDoc?: (doc: OrganizationDocumentExtended) => void;
  onDownloadDoc?: (doc: OrganizationDocumentExtended) => void;
  onDeleteDoc?: (id: string) => void;
}

export const DocumentTable = memo(function DocumentTable({
  documents,
  selectedDocIds = [],
  onSelectDoc,
  onPreviewDoc,
  onRenameDoc,
  onReplaceDoc,
  onDownloadDoc,
  onDeleteDoc,
}: DocumentTableProps) {
  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <DocumentRow
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
