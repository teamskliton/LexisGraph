'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/context/auth-context';
import {
  Settings,
  Building,
  Cpu,
  Save,
  Loader2,
  Trash2,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Globe,
  Briefcase,
  FileText,
  ShieldAlert,
  Info,
  ExternalLink,
  Upload,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { organizationsService, Organization } from '@/services/api/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRoleLabel } from '@/utils/role-utils';
import { cn } from '@/lib/utils';
import { NotificationPreferencesCard } from '@/components/settings/NotificationPreferencesCard';

const compressImageFile = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const maxSize = 128;
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
        const dataUrl =
          canvas.toDataURL("image/webp", 0.8) ||
          canvas.toDataURL("image/jpeg", 0.8);
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

const STANDARD_INDUSTRIES = [
  'Information Technology & Services',
  'Financial Services & Banking',
  'Healthcare & Life Sciences',
  'Legal Services & Regulatory Consulting',
  'Manufacturing & Supply Chain',
  'Telecommunications',
  'Energy, Utilities & Mining',
  'E-Commerce & Retail',
  'Education & Research',
  'Government & Public Sector',
  'Other',
];

export function OrganizationSettingsContent() {
  const { user, activeMembership, activeRole, isAdmin } = useAuth();
  const router = useRouter();

  const activeOrgId =
    activeMembership?.organization_id ||
    (typeof window !== 'undefined' ? localStorage.getItem('selected_organization_id') : null);

  const [org, setOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('');
  const [customIndustry, setCustomIndustry] = useState<string>('');
  const [website, setWebsite] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [showLogoUrlInput, setShowLogoUrlInput] = useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Field-level validation errors
  const [errors, setErrors] = useState<{ name?: string; website?: string }>({});

  // Saving & Deletion states
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState<string>('');

  // Determine permissions
  const isOwner = Boolean(org && (org.created_by === user?.id || user?.is_superuser));
  const canEdit = Boolean(isAdmin || isOwner);
  const canDelete = Boolean(isOwner || isAdmin);

  // Fetch organization details for activeOrgId
  const fetchOrgDetails = useCallback(async () => {
    if (!activeOrgId) {
      setIsLoading(false);
      setOrg(null);
      return;
    }

    setIsLoading(true);
    setFetchError(null);

    try {
      const data = await organizationsService.getOrganizationById(activeOrgId);
      setOrg(data);
      setName(data.name || '');
      setDescription(data.description || '');
      setWebsite(data.website || '');
      setLogoUrl(data.logo_url || '');

      const currentInd = data.industry || '';
      if (STANDARD_INDUSTRIES.slice(0, -1).includes(currentInd)) {
        setSelectedIndustry(currentInd);
        setCustomIndustry('');
      } else if (currentInd) {
        setSelectedIndustry('Other');
        setCustomIndustry(currentInd);
      } else {
        setSelectedIndustry('');
        setCustomIndustry('');
      }
    } catch (err: any) {
      console.error('Failed loading organization details:', err);
      const detail =
        err?.response?.data?.detail ||
        'Failed to load organization settings. Please try again.';
      setFetchError(detail);
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    fetchOrgDetails();
  }, [fetchOrgDetails]);

  // Sync when workspace switches globally
  useEffect(() => {
    const handleOrgChange = () => fetchOrgDetails();
    window.addEventListener('organization_changed', handleOrgChange);
    return () => window.removeEventListener('organization_changed', handleOrgChange);
  }, [fetchOrgDetails]);

  // Derive resolved industry value
  const effectiveIndustry =
    selectedIndustry === 'Other' ? customIndustry.trim() : selectedIndustry;

  // Handle Logo Upload from Local File
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file (PNG, JPG, WebP, SVG).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo file size exceeds the 2MB limit.');
      return;
    }

    try {
      const dataUrl = await compressImageFile(file);
      setLogoUrl(dataUrl);
      toast.success('Logo uploaded. Click "Save Changes" to apply.');
    } catch {
      toast.error('Failed to process logo image.');
    }
  };

  // Dirty state tracking (compares against loaded org data)
  const isDirty = useMemo(() => {
    if (!org) return false;
    const initialName = org.name || '';
    const initialDesc = org.description || '';
    const initialInd = org.industry || '';
    const initialWeb = org.website || '';
    const initialLogo = org.logo_url || '';

    return (
      name.trim() !== initialName.trim() ||
      description.trim() !== initialDesc.trim() ||
      effectiveIndustry !== initialInd ||
      website.trim() !== initialWeb.trim() ||
      logoUrl.trim() !== initialLogo.trim()
    );
  }, [org, name, description, effectiveIndustry, website, logoUrl]);

  // Warn user before navigating away if form is dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Discard local edits and restore saved org values
  const handleDiscardChanges = () => {
    if (!org) return;
    setName(org.name || '');
    setDescription(org.description || '');
    setWebsite(org.website || '');
    setLogoUrl(org.logo_url || '');
    setErrors({});

    const currentInd = org.industry || '';
    if (STANDARD_INDUSTRIES.slice(0, -1).includes(currentInd)) {
      setSelectedIndustry(currentInd);
      setCustomIndustry('');
    } else if (currentInd) {
      setSelectedIndustry('Other');
      setCustomIndustry(currentInd);
    } else {
      setSelectedIndustry('');
      setCustomIndustry('');
    }
    toast.info('Reverted unsaved changes to saved organization profile.');
  };

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: { name?: string; website?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Organization name is required.';
    } else if (name.trim().length > 150) {
      newErrors.name = 'Organization name cannot exceed 150 characters.';
    }

    if (website.trim()) {
      const urlPattern = /^https?:\/\/.+/i;
      if (!urlPattern.test(website.trim())) {
        newErrors.website = 'Website must be a valid URL starting with http:// or https://';
      } else if (website.trim().length > 255) {
        newErrors.website = 'Website URL cannot exceed 255 characters.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Save General Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || !canEdit) return;

    if (!validateForm()) {
      toast.error('Please correct the validation errors before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await organizationsService.updateOrganization(org.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        industry: effectiveIndustry || undefined,
        website: website.trim() || undefined,
        logo_url: logoUrl.trim() || '',
      });

      setOrg(updated);
      toast.success(`Organization profile for '${updated.name}' saved successfully!`);
      // Notify other components if org name or logo changed
      if (updated.name !== org.name || (updated.logo_url || '') !== (org.logo_url || '')) {
        window.dispatchEvent(new Event('organization_changed'));
      }
    } catch (err: any) {
      console.error('Failed updating organization profile:', err);
      const detail =
        err?.response?.data?.detail ||
        'Failed to save organization settings. Please verify inputs and permissions.';
      toast.error(detail);
    } finally {
      setIsSaving(false);
    }
  };

  // Secure Delete Organization
  const handleDeleteOrg = async () => {
    if (!org || !canDelete) return;

    if (deleteConfirmationText.trim() !== org.name.trim()) {
      toast.error(`Confirmation mismatch. Please type exactly '${org.name}'.`);
      return;
    }

    setIsDeleting(true);
    try {
      const deletedName = org.name;
      const deletedId = org.id;
      await organizationsService.deleteOrganization(deletedId);

      // Clean up localStorage
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('selected_organization_id');
        if (stored === deletedId) {
          localStorage.removeItem('selected_organization_id');
        }
      }

      // Check remaining workspaces
      const remainingOrgs = await organizationsService.getOrganizations().catch(() => []);
      const otherOrgs = remainingOrgs.filter((o) => o.id !== deletedId);

      if (otherOrgs.length > 0) {
        const nextOrg = otherOrgs[0];
        localStorage.setItem('selected_organization_id', nextOrg.id);
        window.dispatchEvent(new Event('organization_changed'));
        toast.success(`Deleted '${deletedName}'. Switched to '${nextOrg.name}'.`);
        router.push('/dashboard');
      } else {
        window.dispatchEvent(new Event('organization_changed'));
        toast.success(`Deleted '${deletedName}'. No other workspaces remaining.`);
        router.push('/dashboard');
      }
    } catch (err: any) {
      console.error('Failed deleting organization:', err);
      const detail =
        err?.response?.data?.detail ||
        'Failed to delete organization. You may not have administrative deletion rights.';
      toast.error(detail);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmationText('');
    }
  };

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-xl" />
              <Skeleton className="w-48 h-7 rounded-lg" />
            </div>
            <Skeleton className="w-80 h-4 rounded-md ml-12" />
          </div>
          <Skeleton className="w-32 h-6 rounded-full self-start sm:self-center" />
        </div>

        {/* Profile Card Skeleton */}
        <Card className="p-6 bg-card border-border rounded-2xl space-y-5">
          <Skeleton className="w-56 h-5 rounded-md" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="md:col-span-2 h-24 rounded-xl" />
            <Skeleton className="md:col-span-2 h-10 rounded-xl" />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-border/50">
            <Skeleton className="w-24 h-9 rounded-xl" />
            <Skeleton className="w-32 h-9 rounded-xl" />
          </div>
        </Card>

        {/* AI Card Skeleton */}
        <Card className="p-6 bg-card border-border rounded-2xl space-y-4">
          <Skeleton className="w-60 h-5 rounded-md" />
          <Skeleton className="h-20 rounded-xl" />
        </Card>

        {/* Danger Zone Skeleton */}
        <Card className="p-6 bg-rose-500/[0.04] border-rose-500/20 rounded-2xl space-y-3">
          <Skeleton className="w-40 h-5 rounded-md" />
          <Skeleton className="w-full h-12 rounded-xl" />
        </Card>
      </div>
    );
  }

  // Failed Fetch Error State
  if (fetchError || !org) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 flex flex-col items-center justify-center max-w-xl mx-auto text-center gap-4">
        <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">
            {fetchError ? 'Failed to Load Workspace Settings' : 'No Workspace Selected'}
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
            {fetchError ||
              'Please select an active workspace from the global workspace switcher or create a new organization.'}
          </p>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={() => fetchOrgDetails()}
            variant="outline"
            className="border-border text-xs h-9 gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retry
          </Button>
          <Button
            onClick={() => router.push('/dashboard')}
            className="bg-primary hover:bg-primary-hover text-primary-foreground text-xs h-9 cursor-pointer"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const activeOrgDisplayName = org.name || activeMembership?.organization_name || 'Active Workspace';

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6 max-w-4xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Organization Settings
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Manage workspace configuration for{' '}
                <span className="font-semibold text-foreground">{activeOrgDisplayName}</span>.
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground/80 pl-11">
            Changes made here apply only to this organization.
          </p>
        </div>

        {/* Compact Read-Only Role Context */}
        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <Badge
            variant="outline"
            className="text-[11px] px-3 py-1 border-border bg-card/60 text-muted-foreground font-medium flex items-center gap-1.5"
          >
            <span>Your role in this workspace:</span>
            <span className="font-semibold text-foreground">
              {formatRoleLabel(activeRole)}
            </span>
          </Badge>
        </div>
      </div>

      {/* Non-Admin Read-Only Notice */}
      {!canEdit && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold block">View-Only Workspace Access</span>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              You are signed in with view permissions. Only Organization Administrators can modify
              workspace metadata, update company profile settings, or delete organizations.
            </p>
          </div>
        </div>
      )}

      {/* ── Section 1: General Workspace Profile ── */}
      <Card className="p-6 bg-card border-border rounded-2xl space-y-5 shadow-sm dark:shadow-xl">
        <div className="flex items-center justify-between border-b border-border pb-3.5">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Building className="w-4 h-4 text-primary" /> General Workspace Profile
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Core company profile, legal entity details, and compliance boundary information.
            </p>
          </div>

          {isDirty && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30">
              Unsaved Changes
            </Badge>
          )}
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-5">
          {/* ── Organization Logo ── */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/60">
            <div className="relative group shrink-0">
              <div className="w-16 h-16 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-background shadow-xs">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={name || "Workspace logo"}
                    className="w-full h-full object-cover rounded-xl"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground bg-primary/5">
                    <span className="text-xl font-bold text-primary select-none">
                      {name ? name.trim().charAt(0).toUpperCase() : "W"}
                    </span>
                  </div>
                )}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSaving}
                  className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[11px] font-medium transition-opacity cursor-pointer"
                  title="Change logo"
                >
                  <Upload className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-primary" /> Workspace Logo
                </label>
                {logoUrl && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  >
                    Custom Logo Active
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Add a logo to customize your workspace avatar across navigation, reports, and team views.
                Recommended: square PNG, WebP, SVG, or JPG up to 2MB.
              </p>

              {canEdit && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                    disabled={isSaving}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 text-xs px-2.5 gap-1.5 border-border bg-background hover:bg-muted text-foreground cursor-pointer shadow-2xs"
                  >
                    <Upload className="w-3 h-3 text-muted-foreground" />
                    <span>{logoUrl ? "Change Logo" : "Upload Logo"}</span>
                  </Button>

                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => setLogoUrl("")}
                      className="h-7 text-xs px-2 gap-1 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </Button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowLogoUrlInput((v) => !v)}
                    className="text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer underline-offset-2 hover:underline ml-1"
                  >
                    {showLogoUrlInput ? "Hide URL input" : "Or link by image URL"}
                  </button>
                </div>
              )}

              {canEdit && showLogoUrlInput && (
                <div className="pt-2">
                  <Input
                    type="url"
                    disabled={isSaving}
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="bg-background border-border text-xs h-8 text-foreground rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Organization Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>
                  Organization Name <span className="text-rose-500">*</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">Required</span>
              </label>
              <Input
                type="text"
                disabled={!canEdit || isSaving}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="e.g. TechNova Solutions Pvt. Ltd."
                className={cn(
                  'bg-background border-border text-xs h-9 text-foreground rounded-xl',
                  errors.name && 'border-rose-500 focus-visible:ring-rose-500'
                )}
              />
              {errors.name && (
                <p className="text-[11px] text-rose-500 font-medium">{errors.name}</p>
              )}
            </div>

            {/* Industry */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-3 h-3 text-muted-foreground" /> Industry
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">Classification</span>
              </label>
              <select
                disabled={!canEdit || isSaving}
                value={selectedIndustry}
                onChange={(e) => setSelectedIndustry(e.target.value)}
                className="w-full bg-background border border-border text-foreground text-xs h-9 rounded-xl px-3 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <option value="">Select an industry...</option>
                {STANDARD_INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>

              {/* Custom Industry Input when 'Other' is selected */}
              {selectedIndustry === 'Other' && (
                <div className="pt-1.5">
                  <Input
                    type="text"
                    disabled={!canEdit || isSaving}
                    value={customIndustry}
                    onChange={(e) => setCustomIndustry(e.target.value)}
                    placeholder="Specify custom industry classification"
                    className="bg-background border-border text-xs h-9 text-foreground rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Description (Multiline Textarea) */}
            <div className="md:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FileText className="w-3 h-3 text-muted-foreground" /> Workspace Description
                </label>
                <span className="text-[10px] text-muted-foreground">
                  {description.length} / 500 characters
                </span>
              </div>
              <textarea
                disabled={!canEdit || isSaving}
                rows={3}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of company business domain, compliance scope, and regulatory jurisdiction..."
                className="w-full bg-background border border-border text-foreground text-xs rounded-xl p-3 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed resize-none transition-colors"
              />
              <p className="text-[10px] text-muted-foreground">
                Optional business scope provided to AI reasoning engines during regulatory clause gap analysis.
              </p>
            </div>

            {/* Website URL */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3 h-3 text-muted-foreground" /> Website URL
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">Optional</span>
              </label>
              <div className="relative">
                <Input
                  type="url"
                  disabled={!canEdit || isSaving}
                  value={website}
                  onChange={(e) => {
                    setWebsite(e.target.value);
                    if (errors.website) setErrors((prev) => ({ ...prev, website: undefined }));
                  }}
                  placeholder="https://technova.com"
                  className={cn(
                    'bg-background border-border text-xs h-9 text-foreground rounded-xl pl-8',
                    errors.website && 'border-rose-500 focus-visible:ring-rose-500'
                  )}
                />
                <Globe className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              {errors.website && (
                <p className="text-[11px] text-rose-500 font-medium">{errors.website}</p>
              )}
            </div>
          </div>

          {/* Section Action Footer */}
          {canEdit && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border">
              <span className="text-[11px] text-muted-foreground order-2 sm:order-1">
                {isDirty ? 'You have unsaved changes in this profile.' : 'Profile is up to date.'}
              </span>

              <div className="flex items-center gap-2.5 order-1 sm:order-2 w-full sm:w-auto justify-end">
                {isDirty && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDiscardChanges}
                    disabled={isSaving}
                    className="text-xs h-9 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Discard Changes
                  </Button>
                )}

                <Button
                  type="submit"
                  size="sm"
                  disabled={!isDirty || isSaving}
                  className="bg-primary hover:bg-primary-hover text-primary-foreground text-xs h-9 px-5 rounded-xl shadow-md shadow-primary/10 gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      Saving Profile...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 mr-1" />
                      Save Profile
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </form>
      </Card>

      {/* ── Section 2: AI Analysis Preferences ── */}
      <Card className="p-6 bg-card border-border rounded-2xl space-y-4 shadow-sm dark:shadow-xl">
        <div className="flex items-center justify-between border-b border-border pb-3.5">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" /> AI Analysis Preferences
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Configure the default AI analysis settings for this workspace.
            </p>
          </div>

          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
            System Managed
          </Badge>
        </div>

        <div className="space-y-3 pt-1">
          <div className="p-4 rounded-xl bg-background border border-border/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Default Analysis Engine: Automatic Reasoning Pipeline
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-border text-muted-foreground">
                Hybrid GraphRAG + Gemini / OpenRouter
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              LexisGraph utilizes an automated multi-stage pipeline: semantic vector search (Qdrant),
              structural knowledge graph reasoning (Neo4j), and high-precision LLM clause evaluation
              with resilient failover. Reasoning models are calibrated centrally to ensure deterministic
              accuracy and audit fidelity across all workspaces.
            </p>
          </div>

          <p className="text-[11px] text-muted-foreground/90 flex items-center gap-1.5 pt-1">
            <Info className="w-3.5 h-3.5 text-primary shrink-0" />
            Individual compliance analyses evaluate workspace-specific policy documents against global regulations with automated clause matching.
          </p>
        </div>
      </Card>
 
      {/* ── Section: Notifications & Communication Preferences ── */}
      <NotificationPreferencesCard organizationId={activeOrgId} />

      {/* ── Section 3: Danger Zone ── */}
      {canDelete && (
        <Card className="p-6 bg-rose-500/[0.04] dark:bg-rose-950/20 border border-rose-500/30 rounded-2xl space-y-4 mt-8">
          <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
            <h2 className="text-sm font-bold text-rose-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" /> Danger Zone
            </h2>
            <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-500 border-rose-500/30">
              Irreversible
            </Badge>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground">Delete Organization</h3>
              <p className="text-[11px] text-muted-foreground max-w-xl leading-relaxed">
                Delete this workspace and its associated organization-specific data, subject to applicable retention requirements. This action may be irreversible.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteConfirmationText('');
                setShowDeleteConfirm(true);
              }}
              className="border-rose-500/40 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 text-xs h-9 px-4 shrink-0 cursor-pointer rounded-xl"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Organization
            </Button>
          </div>
        </Card>
      )}

      {/* ── Secure Deletion Confirmation Modal ── */}
      {showDeleteConfirm && org && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
                <ShieldAlert className="w-6 h-6 text-rose-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">
                  Delete {org.name}?
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This action may permanently remove this organization&apos;s private policies, compliance reports, findings, analysis history, and member access. Other organizations and shared global regulations will remain unaffected.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-background border border-border/80 space-y-2">
              <label className="text-xs font-semibold text-foreground block">
                To confirm, please type <span className="font-mono text-rose-500 select-all font-bold">{org.name}</span> below:
              </label>
              <Input
                type="text"
                autoFocus
                disabled={isDeleting}
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder={`Type "${org.name}" to confirm`}
                className="bg-card border-border text-xs h-9 text-foreground rounded-xl"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={isDeleting}
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmationText('');
                }}
                className="text-xs h-8 text-muted-foreground cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteOrg}
                disabled={isDeleting || deleteConfirmationText.trim() !== org.name.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-8 px-4 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rose-600/20"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Deleting...
                  </>
                ) : (
                  'Delete Organization'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrganizationSettingsPage() {
  const { activeMembership } = useAuth();
  const activeOrgId = activeMembership?.organization_id;

  return (
    <ProtectedRoute>
      <AppShell>
        <OrganizationSettingsContent key={activeOrgId || 'no-org'} />
      </AppShell>
    </ProtectedRoute>
  );
}
