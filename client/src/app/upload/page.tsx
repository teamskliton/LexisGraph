"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, LogOut, Upload, ArrowLeft } from "lucide-react";

import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { organizationsService, Organization } from "@/services/api/organizations";
import { documentService, validateFile, formatFileSize } from "@/services/document-service";
import { DocumentType } from "@/types/document";

import { OrganizationSelector } from "@/components/features/upload/organization-selector";
import { DocumentTypeSelector } from "@/components/features/upload/document-type-selector";
import { FileUploadArea } from "@/components/features/upload/file-upload-area";

function UploadPageContent() {
  const { logout } = useAuth();
  const router = useRouter();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isOrgLoading, setIsOrgLoading] = useState(true);

  const [organizationId, setOrganizationId] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType | "">("");
  const [file, setFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [orgError, setOrgError] = useState<string | undefined>();
  const [typeError, setTypeError] = useState<string | undefined>();
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        setIsOrgLoading(true);
        const data = await organizationsService.getOrganizations();
        setOrganizations(data);
      } catch (error) {
        console.error("Failed to fetch organizations:", error);
        toast.error("Failed to load your organizations. Please try again.");
      } finally {
        setIsOrgLoading(false);
      }
    };
    loadOrganizations();
  }, []);

  const handleFileSelect = (selected: File | null) => {
    setFile(selected);
    setFileError(null);
    if (selected) {
      const result = validateFile(selected);
      if (!result.valid) {
        setFileError(result.error || "Invalid file.");
      }
    }
  };

  const handleOrganizationChange = (value: string) => {
    setOrganizationId(value);
    setOrgError(undefined);
  };

  const handleTypeChange = (value: DocumentType) => {
    setDocumentType(value);
    setTypeError(undefined);
  };

  const resetForm = () => {
    setFile(null);
    setDocumentType("");
    setUploadProgress(0);
    setFileError(null);
  };

  const handleUpload = async () => {
    // Validate inputs
    let hasError = false;
    if (!organizationId) {
      setOrgError("Please select an organization.");
      hasError = true;
    }
    if (!documentType) {
      setTypeError("Please select a document type.");
      hasError = true;
    }
    if (!file) {
      setFileError("Please select a PDF file to upload.");
      hasError = true;
    } else {
      const result = validateFile(file);
      if (!result.valid) {
        setFileError(result.error || "Invalid file.");
        hasError = true;
      }
    }

    if (hasError) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uploaded = await documentService.uploadDocument({
        organizationId,
        documentType: documentType as DocumentType,
        file: file as File,
        onUploadProgress: setUploadProgress,
      });

      toast.success(`"${uploaded.original_filename}" uploaded successfully.`);
      resetForm();
    } catch (error: unknown) {
      console.error("Upload failed:", error);
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Upload failed. Please try again.";
      setFileError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const canSubmit = Boolean(organizationId && documentType && file) && !isUploading;

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-foreground">LexisGraph</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="mb-2 -ml-2 flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Upload Document
          </h1>
          <p className="text-muted-foreground">
            Upload a regulation or policy PDF file to one of your organizations.
          </p>
        </div>

        <Card className="border-border/50 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Document Details</CardTitle>
            <CardDescription>
              Select an organization and document type, then choose a PDF file (max 50 MB).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {organizations.length === 0 && !isOrgLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/50 bg-muted/30 px-6 py-10 text-center">
                <p className="text-sm font-medium text-foreground">
                  You have no organizations yet.
                </p>
                <p className="text-xs text-muted-foreground">
                  Create one first to start uploading documents.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/organizations")}
                  className="mt-1 flex items-center gap-1.5"
                >
                  Create Organization
                </Button>
              </div>
            ) : (
              <OrganizationSelector
                value={organizationId}
                onChange={handleOrganizationChange}
                organizations={organizations}
                isLoading={isOrgLoading}
                disabled={isUploading}
                error={orgError}
              />
            )}

            <DocumentTypeSelector
              value={documentType}
              onChange={handleTypeChange}
              disabled={isUploading}
              error={typeError}
            />

            <div className="space-y-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  PDF File <span className="text-destructive">*</span>
                </p>
                <FileUploadArea
                  file={file}
                  onFileSelect={handleFileSelect}
                  isUploading={isUploading}
                  uploadProgress={uploadProgress}
                  error={fileError}
                  disabled={isUploading}
                />
              </div>
              {file && !fileError && (
                <p className="text-xs text-muted-foreground">
                  Selected: {file.name} ({formatFileSize(file.size)})
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={resetForm}
                disabled={isUploading || (!file && !documentType && !organizationId)}
              >
                Reset
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!canSubmit}
                className="flex items-center gap-1.5"
              >
                <Upload className="h-4 w-4" />
                {isUploading ? "Uploading..." : "Upload Document"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function UploadPage() {
  return (
    <ProtectedRoute>
      <UploadPageContent />
    </ProtectedRoute>
  );
}
