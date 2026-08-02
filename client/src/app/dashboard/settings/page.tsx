'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { OrganizationSwitcher } from '@/components/layout/OrganizationSwitcher';
import { Settings, Building, Sliders, Shield, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { organizationsService, Organization } from '@/services/api/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export function OrganizationSettingsContent() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Form Fields
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [industry, setIndustry] = useState<string>('');
  const [website, setWebsite] = useState<string>('');

  // AI & Preference Settings
  const [preferredModel, setPreferredModel] = useState<string>('gemini-1.5-pro');

  const fetchOrgDetails = useCallback(async () => {
    const orgId = localStorage.getItem('selected_organization_id');
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
    } catch (err) {
      console.error('Failed updating organization settings:', err);
      toast.error('Failed to update organization settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="text-xs">Loading organization settings...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Settings className="w-6 h-6 text-indigo-400" />
              Organization Settings
            </h1>
            <OrganizationSwitcher onOrganizationChanged={fetchOrgDetails} />
          </div>
          <p className="text-xs text-slate-400">
            Configure company workspace profile, AI compliance models, and retention preferences.
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Profile Card */}
        <Card className="p-6 bg-slate-900 border-slate-800 rounded-2xl space-y-4">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Building className="w-4 h-4 text-indigo-400" /> Company Profile
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Company Name</label>
              <Input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-slate-950 border-slate-800 text-xs h-9 text-slate-200"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Industry</label>
              <Input
                type="text"
                placeholder="e.g. Information Technology, Healthcare"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="bg-slate-950 border-slate-800 text-xs h-9 text-slate-200"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-300 block mb-1">Description</label>
              <Input
                type="text"
                placeholder="Brief summary of company business and compliance scope"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-slate-950 border-slate-800 text-xs h-9 text-slate-200"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Website URL</label>
              <Input
                type="url"
                placeholder="https://company.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="bg-slate-950 border-slate-800 text-xs h-9 text-slate-200"
              />
            </div>
          </div>
        </Card>

        {/* AI & Compliance Engine Preferences */}
        <Card className="p-6 bg-slate-900 border-slate-800 rounded-2xl space-y-4">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sliders className="w-4 h-4 text-indigo-400" /> Compliance Engine & AI Model Preferences
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Preferred Reasoning Model</label>
              <select
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs h-9 rounded-xl px-3"
              >
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Recommended)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast Analysis)</option>
                <option value="gpt-4o">GPT-4o (Strict Audit mode)</option>
              </select>
            </div>
          </div>
        </Card>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isSaving}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 px-6 rounded-xl shadow-lg shadow-indigo-600/20"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Save Changes</>}
          </Button>
        </div>
      </form>
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
