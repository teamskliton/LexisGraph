'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { OrganizationSwitcher } from '@/components/layout/OrganizationSwitcher';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { useAuth } from '@/context/auth-context';
import {
  Settings,
  Building,
  Sliders,
  Shield,
  Save,
  Loader2,
  Users,
  Trash2,
  AlertTriangle,
  Key,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { organizationsService, Organization } from '@/services/api/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRoleLabel, getRoleBadgeClass } from '@/utils/role-utils';
import { cn } from '@/lib/utils';

export function OrganizationSettingsContent() {
  const { user, activeRole } = useAuth();
  const router = useRouter();

  const [org, setOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  // Form Fields
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [industry, setIndustry] = useState<string>('');
  const [website, setWebsite] = useState<string>('');

  // AI & Preference Settings
  const [preferredModel, setPreferredModel] = useState<string>('gemini-1.5-pro');

  const fetchOrgDetails = useCallback(async () => {
    const orgId = typeof window !== 'undefined' ? localStorage.getItem('selected_organization_id') : null;
    if (!orgId) return;
    setIsLoading(true);
    try {
      const data = await organizationsService.getOrganizationById(orgId);
      setOrg(data);
      setName(data.name || '');
      setDescription(data.description || '');
      setIndustry(data.industry || '');
      setWebsite(data.website || '');
    } catch (err) {
      console.error('Failed loading organization details:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgDetails();
    const handleOrgChange = () => fetchOrgDetails();
    window.addEventListener('organization_changed', handleOrgChange);
    return () => window.removeEventListener('organization_changed', handleOrgChange);
  }, [fetchOrgDetails]);

  const isOwner = org ? org.created_by === user?.id || user?.is_superuser : false;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setIsSaving(true);
    try {
      await organizationsService.updateOrganization(org.id, {
        name,
        description,
        industry,
        website,
      });
      toast.success('Organization settings updated successfully!');
      fetchOrgDetails();
    } catch (err: any) {
      console.error('Failed updating organization settings:', err);
      toast.error(err?.response?.data?.detail || 'Failed to update organization settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOrg = async () => {
    if (!org) return;
    setIsDeleting(true);
    try {
      await organizationsService.deleteOrganization(org.id);
      toast.info(`Deleted organization '${org.name}'.`);
      localStorage.removeItem('selected_organization_id');
      window.dispatchEvent(new Event('organization_changed'));
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Failed deleting organization:', err);
      toast.error(err?.response?.data?.detail || 'Failed to delete organization.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isLoading || !org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <span className="text-xs">Loading organization settings...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold flex items-center gap-2 text-foreground">
              <Settings className="w-6 h-6 text-indigo-500" />
              Organization Settings
            </h1>
            <OrganizationSwitcher onOrganizationChanged={fetchOrgDetails} />
          </div>
          <p className="text-xs text-muted-foreground">
            Configure company workspace profile, active security sessions, and AI compliance engine preferences.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/team')}
            className="bg-card border-border text-foreground hover:bg-muted text-xs h-9 gap-1.5 cursor-pointer"
          >
            <Users className="w-4 h-4 text-indigo-500" />
            Manage Team
          </Button>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Profile Card */}
        <Card className="p-6 bg-card border-border rounded-2xl space-y-4 shadow-sm dark:shadow-xl">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <Building className="w-4 h-4 text-indigo-500" /> General Workspace Profile
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Organization Name</label>
              <Input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background border-border text-xs h-9 text-foreground"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Industry</label>
              <Input
                type="text"
                placeholder="e.g. Financial Services, Healthcare, IT"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="bg-background border-border text-xs h-9 text-foreground"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Description</label>
              <Input
                type="text"
                placeholder="Brief summary of company business and compliance scope"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-background border-border text-xs h-9 text-foreground"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Website URL</label>
              <Input
                type="url"
                placeholder="https://company.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="bg-background border-border text-xs h-9 text-foreground"
              />
            </div>
          </div>
        </Card>

        {/* Security & Authentication Info */}
        <Card className="p-6 bg-card border-border rounded-2xl space-y-4 shadow-sm dark:shadow-xl">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <Key className="w-4 h-4 text-indigo-500" /> Active Session & Authentication
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold block">Authenticated User</span>
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                {user?.full_name} ({user?.email})
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold block">Role Status</span>
              <div>
                <Badge className={cn("text-[10px] uppercase font-mono", getRoleBadgeClass(activeRole))}>
                  {user?.is_superuser ? 'Superuser Admin' : isOwner ? `Owner (${formatRoleLabel(activeRole)})` : formatRoleLabel(activeRole)}
                </Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* AI & Compliance Engine Preferences */}
        <Card className="p-6 bg-card border-border rounded-2xl space-y-4 shadow-sm dark:shadow-xl">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <Sliders className="w-4 h-4 text-indigo-500" /> Compliance Engine & AI Model Preferences
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Preferred Reasoning Engine</label>
              <select
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                className="w-full bg-background border border-border text-foreground text-xs h-9 rounded-xl px-3"
              >
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Recommended for Statutory Audits)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast Clause Matching)</option>
                <option value="gpt-4o">GPT-4o (Strict Regulatory Audit)</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Save CTA */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isSaving}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 px-6 rounded-xl shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Save Changes</>}
          </Button>
        </div>
      </form>

      {/* Danger Zone */}
      {isOwner && (
        <Card className="p-6 bg-rose-500/10 border-rose-500/30 rounded-2xl space-y-4 mt-8">
          <h2 className="text-sm font-bold text-rose-500 flex items-center gap-2 border-b border-rose-500/20 pb-3">
            <AlertTriangle className="w-4 h-4 text-rose-500" /> Danger Zone
          </h2>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h3 className="text-xs font-semibold text-foreground">Delete Organization</h3>
              <p className="text-[11px] text-muted-foreground max-w-md">
                Permanently delete this organization, including associated policy documents, compliance reports, and audit logs. This operation cannot be undone.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="border-rose-500/50 text-rose-500 hover:bg-rose-500/10 text-xs h-9 px-4 shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Organization
            </Button>
          </div>
        </Card>
      )}

      {/* Confirm Delete Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2 text-rose-500">
              <AlertTriangle className="w-5 h-5 text-rose-500" /> Delete {org.name}?
            </h3>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to permanently delete <span className="font-semibold text-foreground">{org.name}</span>? All documents, compliance reports, and team access will be permanently destroyed.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} className="text-xs h-8 text-muted-foreground cursor-pointer">
                Cancel
              </Button>
              <Button
                onClick={handleDeleteOrg}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs h-8 px-4 cursor-pointer"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm Deletion'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrganizationSettingsPage() {
  return (
    <ProtectedRoute>
      <OrganizationSettingsContent />
    </ProtectedRoute>
  );
}
