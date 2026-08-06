// DocumentsHeader — Header component for Documents page
// Displays Breadcrumbs, Workspace Name, Document Count, Last Updated, Primary CTA (Upload Documents).

"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FolderPlus,
  Calendar,
  FileText,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DocumentsHeaderProps {
  organizationName?: string;
  documentCount: number;
  onUploadClick: () => void;
}

export const DocumentsHeader = memo(function DocumentsHeader({
  organizationName = "Workspace Documents",
  documentCount,
  onUploadClick,
}: DocumentsHeaderProps) {
  const router = useRouter();

  return (
    <div className="border-b border-border/40 bg-background/95 backdrop-blur-md sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 py-4 space-y-3">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <button
            onClick={() => router.push("/dashboard")}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Dashboard
          </button>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <button
            onClick={() => router.push("/organizations")}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Organizations
          </button>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="font-medium text-foreground">Documents</span>
        </nav>

        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl truncate">
                Document Repository
              </h1>
              <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 border-border/60">
                Active Workspace
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
              <span>
                Managing documents for <strong className="font-semibold text-foreground">{organizationName}</strong>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                <strong className="font-semibold text-foreground">{documentCount}</strong> files
              </span>
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={onUploadClick}
              className="gap-1.5 text-xs font-semibold cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Documents
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
