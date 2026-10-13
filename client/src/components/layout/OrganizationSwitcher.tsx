'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { format } from 'date-fns';
import {
  Building2,
  ChevronDown,
  Check,
  Plus,
  Settings,
  Users,
  Blocks,
  LayoutTemplate,
  PenSquare,
  Bot,
  Tag,
  Info,
  Globe,
  Calendar,
  Pencil,
  ShieldAlert,
  Upload,
  Zap,
} from 'lucide-react';
import {
  organizationsService,
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
} from '@/services/api/organizations';
import { OrganizationDialog } from '@/components/features/organizations/OrganizationDialog';
import { useAuth } from '@/context/auth-context';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OrganizationSwitcherProps {
  onOrganizationChanged?: (org: Organization) => void;
  className?: string;
}

export const OrganizationSwitcher: React.FC<OrganizationSwitcherProps> = ({
  onOrganizationChanged,
  className,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const { permissions } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [showInfo, setShowInfo] = useState<boolean>(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadOrganizations = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await organizationsService.getOrganizations();
      setOrganizations(list || []);

      const storedId =
        typeof window !== 'undefined'
          ? localStorage.getItem('selected_organization_id')
          : null;
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

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectOrg = (org: Organization) => {
    setCurrentOrg(org);
    setIsOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selected_organization_id', org.id);
      window.dispatchEvent(new Event('organization_changed'));
    }
    toast.success(`Switched to ${org.name}`);
    if (pathname.startsWith('/organizations')) {
      router.push(`/organizations/${org.id}`);
    }
    if (onOrganizationChanged) {
      onOrganizationChanged(org);
    }
  };

  const handleCreateOrg = async (data: OrganizationCreate | OrganizationUpdate) => {
    setIsSubmitting(true);
    try {
      const newOrg = await organizationsService.createOrganization(
        data as OrganizationCreate
      );
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

  const handleEditOrg = async (data: OrganizationCreate | OrganizationUpdate) => {
    if (!currentOrg) return;
    setIsSubmitting(true);
    try {
      const updated = await organizationsService.updateOrganization(
        currentOrg.id,
        data as OrganizationUpdate
      );
      toast.success(`Organization '${updated.name}' updated!`);
      setIsEditOpen(false);
      await loadOrganizations();
      setCurrentOrg(updated);
    } catch (err: any) {
      console.error('Failed to update organization:', err);
      toast.error('Failed to update organization.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const firstLetter = currentOrg?.name
    ? currentOrg.name.trim().charAt(0).toUpperCase()
    : 'S';

  const formattedDate = currentOrg?.updated_at
    ? format(new Date(currentOrg.updated_at), 'MMM d, yyyy')
    : 'Sep 16, 2026';

  if (isLoading || !currentOrg) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#2a2b30] bg-[#16171a] text-zinc-400 text-xs">
        <Building2 className="w-4 h-4 text-emerald-500 animate-pulse" />
        <span>Loading Workspaces...</span>
      </div>
    );
  }

  return (
    <>
      <div ref={dropdownRef} className={cn("relative inline-block text-left", className)}>
        {/* Trigger Pill matching ClickUp style */}
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className={cn(
            "h-9 px-2.5 py-1.5 rounded-lg border border-[#2a2b30] bg-[#16171a] hover:bg-[#1f2025] hover:border-[#383a42]",
            "text-white text-xs shadow-xs transition-all flex items-center justify-between gap-2 cursor-pointer focus:outline-none"
          )}
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2 truncate">
            {/* Emerald rounded square initial badge */}
            <div className="w-5 h-5 rounded-[5px] bg-[#10b981] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
              {firstLetter}
            </div>
            <span className="font-semibold text-white/90 truncate max-w-[150px] sm:max-w-[200px]">
              {currentOrg.name}
            </span>
          </div>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-zinc-400 shrink-0 opacity-70 transition-transform duration-150",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {/* Dropdown Popover */}
        {isOpen && (
          <div
            className="absolute right-0 sm:left-0 sm:right-auto z-50 w-[315px] max-h-[85vh] overflow-y-auto mt-1.5 p-3 rounded-2xl border border-[#28292e] bg-[#16171a] shadow-2xl backdrop-blur-xl animate-in fade-in-50 zoom-in-95 duration-100"
            style={{ scrollbarWidth: 'thin' }}
          >
            {/* Top Workspace Header */}
            <div className="flex items-center gap-3 px-1 py-1">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-xl flex items-center justify-center shrink-0 shadow-md ring-1 ring-white/10">
                {firstLetter}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-white truncate leading-snug">
                  {currentOrg.name}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug truncate">
                  2 members • Free Forever •{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info('Workspace plan is currently Free Forever.');
                    }}
                    className="text-zinc-300 hover:text-white cursor-pointer underline font-medium"
                  >
                    Upgrade
                  </button>
                </p>
              </div>
            </div>

            {/* Quick Action Buttons: Settings, People, Info */}
            <div className="grid grid-cols-3 gap-1.5 mt-3">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/settings');
                }}
                className="h-8.5 rounded-lg border border-[#2a2b30] bg-[#1f2025] hover:bg-[#28292f] hover:border-[#383a42] text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Settings className="w-3.5 h-3.5 text-zinc-400" />
                <span>Settings</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/team');
                }}
                className="h-8.5 rounded-lg border border-[#2a2b30] bg-[#1f2025] hover:bg-[#28292f] hover:border-[#383a42] text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Users className="w-3.5 h-3.5 text-zinc-400" />
                <span>People</span>
              </button>

              <button
                type="button"
                onClick={() => setShowInfo((v) => !v)}
                className={cn(
                  "h-8.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs",
                  showInfo
                    ? "border-[#10b981]/50 bg-[#10b981]/15 text-[#10b981] font-semibold"
                    : "border-[#2a2b30] bg-[#1f2025] hover:bg-[#28292f] hover:border-[#383a42] text-zinc-200"
                )}
              >
                <Info className="w-3.5 h-3.5" />
                <span>Info</span>
              </button>
            </div>

            {/* Overview Organization Info Card from Overview Header */}
            {showInfo && (
              <div className="mt-2.5 p-3 rounded-xl border border-[#2a2b30] bg-[#1b1c21] space-y-2.5 animate-in fade-in-50 duration-150">
                {/* Score & Status Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#222329] border border-[#2e2f36]">
                    <span className="text-[9.5px] uppercase font-bold tracking-wider text-zinc-400">
                      Score
                    </span>
                    <span className="text-xs font-bold text-white tabular-nums">
                      82%
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/25">
                    <ShieldAlert className="w-3 h-3" />
                    Needs Review
                  </span>
                </div>

                {/* Industry, Website & Updated Date */}
                <div className="space-y-1 text-[11px] text-zinc-400">
                  <div className="flex items-center gap-1.5 text-zinc-300 font-medium truncate">
                    <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">
                      {currentOrg.industry || 'Information Technology & Software Services'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-zinc-400 truncate">
                    <Globe className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <a
                      href={
                        currentOrg.website?.startsWith('http')
                          ? currentOrg.website
                          : `https://${currentOrg.website || 'www.technovasolutions.com'}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-primary transition-colors truncate underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(currentOrg.website || 'www.technovasolutions.com').replace(/^https?:\/\//, '')}
                    </a>
                  </div>

                  <div className="flex items-center gap-1.5 text-zinc-500 text-[10px]">
                    <Calendar className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span>Updated {formattedDate}</span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-3 pt-0.5 border-t border-[#26272c]">
                  {currentOrg.description ||
                    'TechNova Solutions Pvt. Ltd. is an IT and software services company focused on enterprise software development, cloud computing, digital transformation, data management, and cybersecurity. The company provides technology...'}
                </p>

                {/* Action Buttons: Run Analysis, Upload Policy, Edit Org */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[#26272c]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      router.push('/compliance');
                    }}
                    className="h-7 px-1 rounded-md bg-[#0284c7] hover:bg-[#0369a1] text-white text-[10.5px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs truncate"
                    title="Run Analysis"
                  >
                    <Zap className="w-3 h-3 shrink-0" />
                    <span className="truncate">Analysis</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      router.push('/policies');
                    }}
                    className="h-7 px-1 rounded-md bg-[#222329] hover:bg-[#2b2c34] border border-[#2f3038] text-zinc-300 text-[10.5px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer truncate"
                    title="Upload Policy"
                  >
                    <Upload className="w-3 h-3 shrink-0" />
                    <span className="truncate">Upload</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setIsEditOpen(true);
                    }}
                    className="h-7 px-1 rounded-md bg-[#222329] hover:bg-[#2b2c34] border border-[#2f3038] text-zinc-300 text-[10.5px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer truncate"
                    title="Edit Organization"
                  >
                    <Pencil className="w-3 h-3 shrink-0" />
                    <span className="truncate">Edit</span>
                  </button>
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-[#232429] my-2.5" />

            {/* Manage Section */}
            <div className="space-y-0.5">
              <p className="text-[11px] font-medium text-zinc-400 px-2 py-0.5 select-none">
                Manage
              </p>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/compliance');
                }}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-xs font-normal text-zinc-300 hover:text-white hover:bg-[#222329] cursor-pointer transition-colors text-left"
              >
                <Blocks className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Apps</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/policies');
                }}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-xs font-normal text-zinc-300 hover:text-white hover:bg-[#222329] cursor-pointer transition-colors text-left"
              >
                <LayoutTemplate className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Templates</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/settings');
                }}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-xs font-normal text-zinc-300 hover:text-white hover:bg-[#222329] cursor-pointer transition-colors text-left"
              >
                <PenSquare className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Custom Fields</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/compliance');
                }}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-xs font-normal text-zinc-300 hover:text-white hover:bg-[#222329] cursor-pointer transition-colors text-left"
              >
                <Bot className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Automations</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/findings');
                }}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-xs font-normal text-zinc-300 hover:text-white hover:bg-[#222329] cursor-pointer transition-colors text-left"
              >
                <Tag className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Tag Manager</span>
                <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#23213d] text-[#818cf8] border border-[#35325c]">
                  New
                </span>
              </button>
            </div>

            {/* Switch Workspace Section (if multiple organizations exist) */}
            {organizations.length > 1 && (
              <>
                <div className="border-t border-[#232429] my-2" />
                <p className="text-[11px] font-medium text-zinc-400 px-2 py-0.5 select-none">
                  Switch Workspace
                </p>
                <div
                  className="max-h-36 overflow-y-auto py-0.5 space-y-0.5"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  {organizations.map((org) => {
                    const active = org.id === currentOrg.id;
                    const orgInitial = org.name
                      ? org.name.trim().charAt(0).toUpperCase()
                      : 'W';
                    return (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => handleSelectOrg(org)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer',
                          active
                            ? 'bg-[#10b981]/15 text-[#10b981] font-semibold'
                            : 'text-zinc-300 hover:bg-[#222329] hover:text-white'
                        )}
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded-[5px] flex items-center justify-center font-bold text-[10px] shrink-0',
                            active
                              ? 'bg-[#10b981] text-white'
                              : 'bg-zinc-800 text-zinc-400'
                          )}
                        >
                          {orgInitial}
                        </div>
                        <span className="flex-1 truncate">{org.name}</span>
                        {active && (
                          <Check className="w-3.5 h-3.5 shrink-0 text-[#10b981]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Bottom Create Workspace Button */}
            {permissions.canCreateOrganization && (
              <div className="border-t border-[#232429] mt-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setIsCreateOpen(true);
                  }}
                  className="w-full h-8.5 rounded-lg border border-[#2a2b30] bg-[#1c1d21] hover:bg-[#25262c] hover:border-[#383a42] text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Create Workspace</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <OrganizationDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={handleCreateOrg}
        isLoading={isSubmitting}
      />

      <OrganizationDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSubmit={handleEditOrg}
        organization={currentOrg ?? undefined}
        isLoading={isSubmitting}
      />
    </>
  );
};
