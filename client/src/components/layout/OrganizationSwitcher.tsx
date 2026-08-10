'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Building2, ChevronDown, Check, Plus, Shield } from 'lucide-react';
import { organizationsService, Organization, OrganizationCreate, OrganizationUpdate } from '@/services/api/organizations';
import { OrganizationDialog } from '@/components/features/organizations/OrganizationDialog';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface OrganizationSwitcherProps {
  onOrganizationChanged?: (org: Organization) => void;
}

export const OrganizationSwitcher: React.FC<OrganizationSwitcherProps> = ({
  onOrganizationChanged,
}) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Create Organization Modal State
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadOrganizations = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await organizationsService.getOrganizations();
      setOrganizations(list || []);
      
      const storedId = typeof window !== 'undefined' ? localStorage.getItem('selected_organization_id') : null;
      let active = (list || []).find((o) => o.id === storedId);
      if (!active && list && list.length > 0) {
        active = list[0];
      }
      
      if (active) {
        setCurrentOrg(active);
        if (typeof window !== 'undefined') {
          localStorage.setItem('selected_organization_id', active.id);
        }
      }
    } catch (err) {
      console.error('Failed loading user organizations:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const handleSelectOrg = (org: Organization) => {
    setCurrentOrg(org);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selected_organization_id', org.id);
      window.dispatchEvent(new Event('organization_changed'));
    }
    if (onOrganizationChanged) {
      onOrganizationChanged(org);
    }
  };

  const handleCreateOrg = async (data: OrganizationCreate | OrganizationUpdate) => {
    setIsSubmitting(true);
    try {
      const newOrg = await organizationsService.createOrganization(data as OrganizationCreate);
      toast.success(`Organization '${newOrg.name}' created!`);
      setIsCreateOpen(false);
      await loadOrganizations();
      handleSelectOrg(newOrg);
    } catch (err: any) {
      console.error('Failed to create organization:', err);
      toast.error('Failed to create organization.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !currentOrg) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 text-xs">
        <Building2 className="w-4 h-4 text-indigo-400 animate-pulse" />
        <span>Loading Workspaces...</span>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="h-9 px-3 gap-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs rounded-xl shadow-sm transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-2 truncate">
            <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-semibold truncate max-w-[140px] sm:max-w-[180px]">
              {currentOrg.name}
            </span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 opacity-70 ml-1" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-60 bg-slate-900 border-slate-800 text-slate-200 shadow-2xl rounded-xl p-1">
          <DropdownMenuLabel className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5">
            Select Active Workspace
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-800" />

          {organizations.map((org) => {
            const isSelected = org.id === currentOrg.id;
            return (
              <DropdownMenuItem
                key={org.id}
                onClick={() => handleSelectOrg(org)}
                className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600/10 text-indigo-400 font-semibold'
                    : 'hover:bg-slate-800/80 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className="truncate">{org.name}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator className="bg-slate-800 my-1" />

          <DropdownMenuItem
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-2.5 py-2 text-indigo-400 hover:bg-indigo-950/40 font-semibold text-xs cursor-pointer rounded-lg"
          >
            <Plus className="w-4 h-4 shrink-0 text-indigo-400" />
            <span>Create Organization</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OrganizationDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={handleCreateOrg}
        isLoading={isSubmitting}
      />
    </>
  );
};

