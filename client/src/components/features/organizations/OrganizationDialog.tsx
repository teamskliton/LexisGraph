import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Building2 } from "lucide-react";

import { Organization, OrganizationCreate, OrganizationUpdate } from "@/services/api/organizations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const organizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(150, "Name must be less than 150 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional().or(z.literal("")),
  industry: z.string().max(100, "Industry must be less than 100 characters").optional().or(z.literal("")),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  logo_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

interface OrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: Organization;
  onSubmit: (data: OrganizationCreate | OrganizationUpdate) => void;
  isLoading?: boolean;
}

export function OrganizationDialog({
  open,
  onOpenChange,
  organization,
  onSubmit,
  isLoading = false,
}: OrganizationDialogProps) {
  const isEditing = !!organization;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: "",
      description: "",
      industry: "",
      website: "",
      logo_url: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (organization) {
        reset({
          name: organization.name,
          description: organization.description || "",
          industry: organization.industry || "",
          website: organization.website || "",
          logo_url: organization.logo_url || "",
        });
      } else {
        reset({
          name: "",
          description: "",
          industry: "",
          website: "",
          logo_url: "",
        });
      }
    }
  }, [open, organization, reset]);

  const onFormSubmit = (data: OrganizationFormValues) => {
    // Clean up empty strings to undefined to match API types if needed
    const cleanedData = {
      ...data,
      description: data.description || undefined,
      industry: data.industry || undefined,
      website: data.website || undefined,
      logo_url: data.logo_url || undefined,
    };
    onSubmit(cleanedData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Organization" : "Create Organization"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your organization details below."
              : "Add a new organization to manage its resources."}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name <span className="text-destructive">*</span></Label>
            <Input id="name" placeholder="Acme Inc." {...register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" placeholder="A brief description of what you do" {...register("description")} />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" placeholder="Technology" {...register("industry")} />
              {errors.industry && (
                <p className="text-sm text-destructive">{errors.industry.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" placeholder="https://example.com" type="url" {...register("website")} />
              {errors.website && (
                <p className="text-sm text-destructive">{errors.website.message}</p>
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="logo_url">Logo URL</Label>
            <Input id="logo_url" placeholder="https://example.com/logo.png" type="url" {...register("logo_url")} />
            {errors.logo_url && (
              <p className="text-sm text-destructive">{errors.logo_url.message}</p>
            )}
          </div>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Building2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
