// DocumentCategorySection — Section wrapper that groups documents by category
// Sections: Policies, Regulations, Supporting Documents

"use client";

import { memo } from "react";
import { Shield, BookOpen, FileCheck2 } from "lucide-react";
import { DocumentGrid } from "./DocumentGrid";
import { DocumentTable } from "./DocumentTable";
import type { OrganizationDocumentExtended, DocumentCategory } from "./documents-types";

interface DocumentCategorySectionProps {
  category: DocumentCategory;
  documents: OrganizationDocumentExtended[];
  viewMode: "grid" | "list";
  selectedDocIds?: string[];
  onSelectDoc?: (id: string) => void;
  onPreviewDoc: (doc: OrganizationDocumentExtended) => void;
  onRenameDoc?: (id: string, currentName: string) => void;
  onReplaceDoc?: (doc: OrganizationDocumentExtended) => void;
  onDownloadDoc?: (doc: OrganizationDocumentExtended) => void;
  onDeleteDoc?: (id: string) => void;
}

function getCategoryConfig(category: DocumentCategory) {
  switch (category) {
    case "Policy":
      return {
        title: "Policies",
        subtitle: "Internal company rules, handbooks, codes of conduct, and HR policies",
        icon: <Shield className="h-4 w-4 text-info" />,
        badgeClass: "bg-info/10 text-info",
      };
    case "Regulation":
      return {
        title: "Regulations",
        subtitle: "Statutory acts, legal mandates, and regulatory framework texts",
        icon: <BookOpen className="h-4 w-4 text-success" />,
        badgeClass: "bg-success/10 text-success",
      };
    case "Supporting Document":
      return {
        title: "Supporting Documents",
        subtitle: "Circulars, notifications, filings, and internal reference notes",
        icon: <FileCheck2 className="h-4 w-4 text-primary" />,
        badgeClass: "bg-primary/10 text-primary",
      };
  }
}

export const DocumentCategorySection = memo(function DocumentCategorySection({
  category,
  documents,
  viewMode,
  selectedDocIds,
  onSelectDoc,
  onPreviewDoc,
  onRenameDoc,
  onReplaceDoc,
  onDownloadDoc,
  onDeleteDoc,
}: DocumentCategorySectionProps) {
  if (documents.length === 0) return null;

  const { title, subtitle, icon, badgeClass } = getCategoryConfig(category);

  return (
    <section className="space-y-3 pt-2">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-md ${badgeClass}`}>
            {icon}
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
              {title}
              <span className="text-xs font-normal text-muted-foreground">
                ({documents.length})
              </span>
            </h2>
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* Content Rendering */}
      {viewMode === "grid" ? (
        <DocumentGrid
          documents={documents}
          selectedDocIds={selectedDocIds}
          onSelectDoc={onSelectDoc}
          onPreviewDoc={onPreviewDoc}
          onRenameDoc={onRenameDoc}
          onReplaceDoc={onReplaceDoc}
          onDownloadDoc={onDownloadDoc}
          onDeleteDoc={onDeleteDoc}
        />
      ) : (
        <DocumentTable
          documents={documents}
          selectedDocIds={selectedDocIds}
          onSelectDoc={onSelectDoc}
          onPreviewDoc={onPreviewDoc}
          onRenameDoc={onRenameDoc}
          onReplaceDoc={onReplaceDoc}
          onDownloadDoc={onDownloadDoc}
          onDeleteDoc={onDeleteDoc}
        />
      )}
    </section>
  );
});
