import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Building2, Upload, Image as ImageIcon, X, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

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
  website: z.string().optional().or(z.literal("")),
  logo_url: z.string().optional().or(z.literal("")),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

interface OrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: Organization;
  onSubmit: (data: OrganizationCreate | OrganizationUpdate) => void;
  isLoading?: boolean;
}

const compressImageFile = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const maxSize = 96;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/webp", 0.75) || canvas.toDataURL("image/jpeg", 0.75);
        resolve(dataUrl);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || "");
        reader.readAsDataURL(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || "");
      reader.readAsDataURL(file);
    };
  });
};

export function OrganizationDialog({
  open,
  onOpenChange,
  organization,
  onSubmit,
  isLoading = false,
}: OrganizationDialogProps) {
  const isEditing = !!organization;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
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

  const watchLogoUrl = watch("logo_url");

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
        setLogoPreview(organization.logo_url || "");
      } else {
        reset({
          name: "",
          description: "",
          industry: "",
          website: "",
          logo_url: "",
        });
        setLogoPreview("");
      }
    }
  }, [open, organization, reset]);

  // Keep preview synced with manual URL text input
  useEffect(() => {
    if (watchLogoUrl) {
      setLogoPreview(watchLogoUrl);
    }
  }, [watchLogoUrl]);

  // File upload handler with compression
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (PNG, JPG, SVG, WebP).");
      return;
    }

    try {
      const dataUrl = await compressImageFile(file);
      if (dataUrl) {
        setValue("logo_url", dataUrl, { shouldValidate: true, shouldDirty: true });
        setLogoPreview(dataUrl);
      }
    } catch {
      alert("Failed to process image. Please try another image.");
    }
  };

  const handleRemoveLogo = () => {
    setValue("logo_url", "", { shouldValidate: true });
    setLogoPreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onFormSubmit = (data: OrganizationFormValues) => {
    const cleanedData = {
      ...data,
      description: data.description || undefined,
      industry: data.industry || undefined,
      website: data.website || undefined,
      logo_url: data.logo_url || undefined,
    };
    onSubmit(cleanedData);
  };

  const onFormError = (formErrors: any) => {
    console.warn("Organization Form Validation Errors:", formErrors);
    const firstErrorKey = Object.keys(formErrors)[0];
    if (firstErrorKey && formErrors[firstErrorKey]?.message) {
      toast.error(`Validation: ${formErrors[firstErrorKey].message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Organization" : "Create Organization"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your organization details and logo below."
              : "Add a new organization to manage its compliance resources."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit, onFormError)} className="space-y-4 py-3">
          {/* Organization Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-semibold">
              Organization Name <span className="text-destructive">*</span>
            </Label>
            <Input id="name" placeholder="Acme Inc." {...register("name")} className="h-9 text-xs" />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Logo Upload Section */}
          <div className="space-y-2 p-3.5 rounded-xl border border-border/60 bg-muted/20">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <ImageIcon className="h-3.5 w-3.5 text-indigo-500" />
              <span>Organization Logo</span>
            </Label>

            <div className="flex items-center gap-3">
              {/* Logo Preview Avatar */}
              <div className="relative h-12 w-12 shrink-0 rounded-xl border border-border/70 bg-background overflow-hidden flex items-center justify-center shadow-2xs">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreview}
                    alt="Logo Preview"
                    className="h-full w-full object-cover"
                    onError={() => setLogoPreview("")}
                  />
                ) : (
                  <Building2 className="h-5 w-5 text-muted-foreground/60" />
                )}
              </div>

              {/* Upload Controls */}
              <div className="flex-1 space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/svg+xml, image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="logo-file-upload"
                />

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Upload Logo Image</span>
                  </Button>

                  {logoPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveLogo}
                      className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer gap-1"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Remove</span>
                    </Button>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Supports PNG, JPG, SVG, WebP (max 3MB).
                </p>
              </div>
            </div>

            {/* Direct Logo URL Option */}
            <div className="pt-2 border-t border-border/40 space-y-1">
              <Label htmlFor="logo_url" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <LinkIcon className="h-3 w-3" />
                <span>Or paste direct Logo Image URL</span>
              </Label>
              <Input
                id="logo_url"
                placeholder="https://example.com/logo.png"
                {...register("logo_url")}
                className="h-8 text-xs bg-background"
              />
              {errors.logo_url && (
                <p className="text-xs text-destructive">{errors.logo_url.message}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-semibold">Description</Label>
            <Input id="description" placeholder="Brief description of the organization" {...register("description")} className="h-9 text-xs" />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Industry & Website */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="industry" className="text-xs font-semibold">Industry</Label>
              <Input id="industry" placeholder="Legal / Technology" {...register("industry")} className="h-9 text-xs" />
              {errors.industry && (
                <p className="text-xs text-destructive">{errors.industry.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="website" className="text-xs font-semibold">Website</Label>
              <Input id="website" placeholder="https://example.com" {...register("website")} className="h-9 text-xs" />
              {errors.website && (
                <p className="text-xs text-destructive">{errors.website.message}</p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border/40">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs cursor-pointer">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isLoading}
              onClick={handleSubmit(onFormSubmit, onFormError)}
              className="text-xs font-semibold cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isLoading && <Building2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
