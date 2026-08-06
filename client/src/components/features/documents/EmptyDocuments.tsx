// EmptyDocuments — Empty and Error states for Workspace Documents page

"use client";

import { memo } from "react";
import { FolderUp, Upload, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyDocumentsProps {
  onUploadClick: () => void;
}

export const EmptyDocuments = memo(function EmptyDocuments({
  onUploadClick,
}: EmptyDocumentsProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center rounded-xl border border-dashed border-border/60 bg-muted/10">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
        <FolderUp className="h-7 w-7" />
      </div>

      <h2 className="text-base font-semibold text-foreground mb-1">
        No documents uploaded
      </h2>
      <p className="text-xs text-muted-foreground max-w-sm mb-6 leading-relaxed">
        Upload company policies and applicable regulations to begin AI-powered compliance analysis.
      </p>

      <Button size="sm" onClick={onUploadClick} className="gap-1.5 cursor-pointer font-semibold">
        <Upload className="h-3.5 w-3.5" />
        Upload Documents
      </Button>
    </div>
  );
});

interface ErrorDocumentsProps {
  message: string;
  onRetry: () => void;
}

export const ErrorDocuments = memo(function ErrorDocuments({
  message,
  onRetry,
}: ErrorDocumentsProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-danger/20 bg-danger/5">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger mb-4">
        <AlertCircle className="h-6 w-6" />
      </div>

      <h2 className="text-base font-semibold text-foreground mb-1">
        Failed to load documents
      </h2>
      <p className="text-xs text-muted-foreground max-w-xs mb-6 leading-relaxed">
        {message}
      </p>

      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 cursor-pointer">
        <RefreshCw className="h-3.5 w-3.5" /> Try Again
      </Button>
    </div>
  );
});
