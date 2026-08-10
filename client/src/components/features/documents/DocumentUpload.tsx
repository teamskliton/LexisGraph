"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { documentService, validateFile } from "@/services/document-service";
import type { DocumentCategory, OrganizationDocumentExtended } from "./documents-types";

interface DocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess: (docs: OrganizationDocumentExtended[]) => void;
  organizationId?: string;
}

export function DocumentUpload({
  open,
  onOpenChange,
  onUploadSuccess,
  organizationId = "",
}: DocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>("Policy");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    const check = validateFile(file);
    if (!check.valid) {
      setError(check.error || "Invalid file selected.");
      toast.error(check.error || "Invalid file selected.");
      return;
    }
    setError(null);
    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const startUpload = async () => {
    if (!selectedFile || !organizationId) {
      if (!organizationId) toast.error("Please select an organization first.");
      return;
    }

    setIsUploading(true);
    setProgress(10);
    setError(null);

    try {
      const docType = selectedCategory === "Regulation" ? "REGULATION" : "POLICY";
      const uploadedDoc = await documentService.uploadDocument({
        organizationId,
        documentType: docType,
        file: selectedFile,
        onUploadProgress: (p) => setProgress(p),
      });

      toast.success(`Uploaded ${uploadedDoc.original_filename || selectedFile.name}`);

      const createdDoc: OrganizationDocumentExtended = {
        id: uploadedDoc.id,
        organizationId: uploadedDoc.organization_id || organizationId,
        name: uploadedDoc.original_filename || selectedFile.name,
        category: selectedCategory,
        file_size: `${(uploadedDoc.file_size / (1024 * 1024)).toFixed(1)} MB`,
        file_type: "pdf",
        version: "v1.0",
        uploaded_at: uploadedDoc.created_at || new Date().toISOString(),
        uploaded_by: "Current User",
        status: "Processing",
        tags: [selectedCategory],
      };

      onUploadSuccess([createdDoc]);
      setSelectedFile(null);
      setProgress(0);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to upload document:", err);
      const msg = err?.response?.data?.detail || "Failed to upload document.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderUp className="h-5 w-5 text-primary" />
            Upload Document
          </DialogTitle>
          <DialogDescription>
            Upload a company policy or statutory regulation (PDF format up to 50MB).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Category Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Document Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["Policy", "Regulation"] as DocumentCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "p-2.5 text-xs font-semibold rounded-lg border transition-all text-center cursor-pointer",
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/30"
                  )}
                >
                  {cat === "Policy" ? "Company Policy" : "Statutory Regulation"}
                </button>
              ))}
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all text-center",
              isDragOver
                ? "border-primary bg-primary/10"
                : "border-border/60 bg-muted/10 hover:border-border hover:bg-muted/20"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={(e) => e.target.files?.length && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Click to browse or drag & drop PDF policy file
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports PDF documents up to 50MB
            </p>
          </div>

          {/* Selected File */}
          {selectedFile && (
            <div className="p-3 rounded-lg border border-border/50 bg-card space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold text-foreground truncate max-w-xs">
                    {selectedFile.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </div>

                {!isUploading && (
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {isUploading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Uploading file & initiating pipeline...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
            className="cursor-pointer text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={startUpload}
            disabled={!selectedFile || isUploading}
            className="cursor-pointer gap-1.5 font-semibold text-xs"
          >
            {isUploading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" /> Start Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
