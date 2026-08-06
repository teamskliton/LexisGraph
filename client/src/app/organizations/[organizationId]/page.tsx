// /organizations/[organizationId] — Organization Workspace Page
// Route: /organizations/[organizationId]
// Workspace shell integrated with FastAPI backend organizationsService.

"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/layout/protected-route";
import {
  Organization,
  organizationsService,
  OrganizationUpdate,
} from "@/services/api/organizations";
import { OrganizationWorkspaceLayout } from "@/components/features/organizations/OrganizationWorkspaceLayout";
import { OrganizationDialog } from "@/components/features/organizations/OrganizationDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

function OrganizationWorkspaceContent({ organizationId }: { organizationId: string }) {
  const router = useRouter();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const fetchOrganization = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await organizationsService.getOrganizationById(organizationId);
      setOrganization(data);
    } catch (err) {
      console.warn(`Failed loading organization ${organizationId}:`, err);
      setError("Failed to load organization workspace. Please verify connection.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  const handleEditSubmit = async (data: OrganizationUpdate) => {
    if (!organization) return;
    try {
      setIsSubmittingEdit(true);
      const updated = await organizationsService.updateOrganization(organization.id, data);
      setOrganization(updated);
      toast.success("Organization updated successfully.");
      setIsEditDialogOpen(false);
    } catch {
      toast.error("Failed to update organization.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 lg:col-span-3 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 rounded-xl bg-danger/10 text-danger mb-4">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-base font-semibold text-foreground mb-1">
          {error || "Organization not found"}
        </h2>
        <p className="text-xs text-muted-foreground max-w-xs mb-6">
          The requested organization workspace could not be retrieved.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/organizations")} className="cursor-pointer">
            Back to Organizations
          </Button>
          <Button size="sm" onClick={fetchOrganization} className="gap-1.5 cursor-pointer">
            <RefreshCw className="h-3.5 w-3.5" /> Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <OrganizationWorkspaceLayout
        organization={organization}
        complianceScore={82}
        policyCount={12}
        reportCount={5}
        onEditOrg={() => setIsEditDialogOpen(true)}
      />

      <OrganizationDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        organization={organization}
        onSubmit={handleEditSubmit}
        isLoading={isSubmittingEdit}
      />
    </>
  );
}

export default function OrganizationWorkspacePage({ params }: PageProps) {
  const resolvedParams = use(params);
  return (
    <ProtectedRoute>
      <OrganizationWorkspaceContent organizationId={resolvedParams.organizationId} />
    </ProtectedRoute>
  );
}
