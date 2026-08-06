// DocumentUpload — Drag & drop upload modal for Workspace Documents
// Features: Drag & Drop zone, Browse Files, Category selector, Upload Progress,
// Cancel/Retry Upload, Multiple Files, Accepted types (PDF, DOCX, TXT).

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
import { cn } from "@/lib/utils";
import type { DocumentCategory, OrganizationDocumentExtended } from "./documents-types";

interface UploadingFile {
  id: string;
  name: string;
  size: string;
  file_type: "pdf" | "docx" | "txt";
  category: DocumentCategory;
  progress: number;
  status: "uploading" | "completed" | "error";
}

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
  organizationId = "org-001",
}: DocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>("Policy");
  const [fileList, setFileList] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const processFiles = useCallback((files: FileList | File[]) => {
    const validExtensions = [".pdf", ".docx", ".txt"];
    const newItems: UploadingFile[] = [];

    Array.from(files).forEach((file) => {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!validExtensions.includes(ext)) return;

      const fileType = ext === ".pdf" ? "pdf" : ext === ".docx" ? "docx" : "txt";
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1) + " MB";

      newItems.push({
        id: "upload-" + Math.random().toString(36).substring(2, 9),
        name: file.name,
        size: sizeMB,
        file_type: fileType,
        category: selectedCategory,
        progress: 0,
        status: "uploading",
      });
    });

    setFileList((prev) => [...prev, ...newItems]);
  }, [selectedCategory]);

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
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFileList((prev) => prev.filter((f) => f.id !== id));
  };

  const startUpload = async () => {
    setIsUploading(true);

    for (let p = 10; p <= 100; p += 20) {
      await new Promise((r) => setTimeout(r, 150));
      setFileList((prev) =>
        prev.map((f) =>
          f.status === "uploading" ? { ...f, progress: p, status: p === 100 ? "completed" : "uploading" } : f
        )
      );
    }

    const createdDocs: OrganizationDocumentExtended[] = fileList.map((f) => ({
      id: "doc-" + Math.random().toString(36).substring(2, 9),
      organizationId,
      name: f.name,
      category: f.category,
      file_size: f.size,
      file_type: f.file_type,
      version: "v1.0",
      uploaded_at: new Date().toISOString(),
      uploaded_by: "Current User",
      status: "Parsing",
      tags: [f.category, "New Upload"],
    }));

    onUploadSuccess(createdDocs);
    setIsUploading(false);
    setFileList([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderUp className="h-5 w-5 text-primary" />
            Upload Documents
          </DialogTitle>
          <DialogDescription>
            Upload company policies, statutory regulations, or supporting notes (PDF, DOCX, TXT up to 25MB each).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Category Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs">Select Document Category</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["Policy", "Regulation", "Supporting Document"] as DocumentCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "p-2 text-xs font-medium rounded-lg border transition-all text-center cursor-pointer",
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  {cat}
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
              multiple
              accept=".pdf,.docx,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Click to browse or drag and drop files here
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports PDF, DOCX, TXT files
            </p>
          </div>

          {/* File Queue List */}
          {fileList.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              <p className="text-xs font-semibold text-foreground">
                Selected Files ({fileList.length})
              </p>
              {fileList.map((f) => (
                <div
                  key={f.id}
                  className="p-2.5 rounded-lg border border-border/50 bg-card space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold text-foreground truncate max-w-xs">
                        {f.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">({f.size})</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {f.status === "completed" && (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      )}
                      {f.status === "error" && (
                        <AlertCircle className="h-4 w-4 text-danger" />
                      )}
                      {!isUploading && (
                        <button
                          type="button"
                          onClick={() => removeFile(f.id)}
                          className="text-muted-foreground hover:text-foreground p-1"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isUploading && (
                    <Progress value={f.progress} className="h-1.5" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={startUpload}
            disabled={fileList.length === 0 || isUploading}
            className="cursor-pointer gap-1.5 font-semibold"
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
