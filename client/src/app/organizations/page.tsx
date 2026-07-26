"use client";

import { useEffect, useState } from "react";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";

import { Organization, organizationsService, OrganizationCreate, OrganizationUpdate } from "@/services/api/organizations";
import { Button } from "@/components/ui/button";
import { OrganizationCard } from "@/components/features/organizations/OrganizationCard";
import { OrganizationDialog } from "@/components/features/organizations/OrganizationDialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchOrganizations = async () => {
    try {
      setIsLoading(true);
      const data = await organizationsService.getOrganizations();
      setOrganizations(data);
    } catch (error) {
      console.error("Failed to fetch organizations:", error);
      toast.error("Failed to load organizations. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const handleCreateNew = () => {
    setEditingOrg(undefined);
    setIsDialogOpen(true);
  };

  const handleEdit = (org: Organization) => {
    setEditingOrg(org);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this organization? This action cannot be undone.")) {
      return;
    }
    
    try {
      await organizationsService.deleteOrganization(id);
      setOrganizations(organizations.filter(org => org.id !== id));
      toast.success("Organization deleted successfully.");
    } catch (error) {
      console.error("Failed to delete organization:", error);
      toast.error("Failed to delete organization. Please try again.");
    }
  };

  const handleSubmit = async (data: OrganizationCreate | OrganizationUpdate) => {
    try {
      setIsSubmitting(true);
      
      if (editingOrg) {
        // Update
        const updatedOrg = await organizationsService.updateOrganization(editingOrg.id, data as OrganizationUpdate);
        setOrganizations(organizations.map(org => org.id === editingOrg.id ? updatedOrg : org));
        toast.success("Organization updated successfully.");
      } else {
        // Create
        const newOrg = await organizationsService.createOrganization(data as OrganizationCreate);
        setOrganizations([newOrg, ...organizations]);
        toast.success("Organization created successfully.");
      }
      
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Failed to save organization:", error);
      toast.error("Failed to save organization. Please check your inputs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground mt-1">
            Manage your organizations and their workspaces.
          </p>
        </div>
        <Button onClick={handleCreateNew} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Create Organization
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex flex-col h-full rounded-xl border bg-card p-6 gap-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-12 w-full mt-2" />
              <div className="flex gap-2 mt-auto pt-4">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : organizations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border rounded-xl bg-card/50 border-dashed">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Building2 className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight mb-2">No organizations found</h2>
          <p className="text-muted-foreground max-w-[500px] mb-8">
            You don't belong to any organizations yet. Create your first organization to start managing your resources.
          </p>
          <Button onClick={handleCreateNew} size="lg">
            <Plus className="mr-2 h-4 w-4" />
            Create your first Organization
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {organizations.map((org) => (
            <OrganizationCard
              key={org.id}
              organization={org}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <OrganizationDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        organization={editingOrg}
        onSubmit={handleSubmit}
        isLoading={isSubmitting}
      />
    </div>
  );
}
