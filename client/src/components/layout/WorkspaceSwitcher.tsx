"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ChevronDown,
  Check,
  Plus,
  Settings,
  Search,
  X,
  Loader2,
  Building2,
} from "lucide-react";
import { toast } from "sonner";

import {
  organizationsService,
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
} from "@/services/api/organizations";
import { OrganizationDialog } from "@/components/features/organizations/OrganizationDialog";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

export interface WorkspaceSwitcherProps {
  collapsed?: boolean;
  onNavigate?: () => void;
  onOrganizationChanged?: (org: Organization) => void;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFirstLetter(name?: string | null): string {
  if (!name) return "W";
  return name.trim().charAt(0).toUpperCase();
}

function formatRoleLabel(
  role?: string | null,
  isOwner?: boolean,
  isSuperuser?: boolean
): string {
  if (isOwner) return "Owner";
  if (!role) return isSuperuser ? "Admin" : "Member";

  switch (role.toUpperCase()) {
    case "ADMIN":
      return "Admin";
    case "COMPLIANCE_OFFICER":
      return "Compliance Officer";
    case "REVIEWER":
      return "Reviewer";
    case "AUDITOR":
      return "Auditor";
    case "MEMBER":
      return "Member";
    default:
      return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  }
}

// ─── Main WorkspaceSwitcher Component ────────────────────────────────────────

export function WorkspaceSwitcher({
  collapsed = false,
  onNavigate,
  onOrganizationChanged,
  className,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, permissions } = useAuth();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSwitching, setIsSwitching] = useState<string | null>(null);

  // Dialog State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── 1. Fetch accessible organizations ──────────────────────────────────────
  const loadOrgs = useCallback(async () => {
    try {
      const list = await organizationsService.getOrganizations();
      const orgList = list || [];
      setOrganizations(orgList);

      const storedId =
        typeof window !== "undefined"
          ? localStorage.getItem("selected_organization_id")
          : null;

      let active = orgList.find((o) => o.id === storedId);
      if (!active && orgList.length > 0) {
        active = orgList[0];
      }

      if (active) {
        setCurrentOrg(active);
        if (typeof window !== "undefined") {
          localStorage.setItem("selected_organization_id", active.id);
        }
      }
    } catch {
      // Graceful fallback: maintain existing state
    }
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  // Sync when external components dispatch organization_changed
  useEffect(() => {
    const handleOrgChanged = () => {
      const storedId =
        typeof window !== "undefined"
          ? localStorage.getItem("selected_organization_id")
          : null;
      if (storedId && currentOrg?.id !== storedId) {
        organizationsService.getOrganizations().then((list) => {
          if (!list) return;
          setOrganizations(list);
          const match = list.find((o) => o.id === storedId);
          if (match) setCurrentOrg(match);
        });
      }
    };

    window.addEventListener("organization_changed", handleOrgChanged);
    return () =>
      window.removeEventListener("organization_changed", handleOrgChanged);
  }, [currentOrg?.id]);

  // ── 2. Click outside & Escape listeners ────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearchQuery("");
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current && organizations.length > 2) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, organizations.length]);

  // ── 3. Role determination helper ───────────────────────────────────────────
  const getRoleForOrg = useCallback(
    (orgId: string): string => {
      const membership = user?.memberships?.find(
        (m) => m.organization_id === orgId
      );
      if (membership) {
        return formatRoleLabel(
          membership.role,
          membership.is_owner,
          user?.is_superuser
        );
      }
      return user?.is_superuser ? "Admin" : "Member";
    },
    [user]
  );

  const getOrgSubtitle = useCallback(
    (org: Organization, isActive: boolean): string => {
      const isPersonal = Boolean(
        user?.full_name &&
          org.name.toLowerCase().includes(user.full_name.toLowerCase())
      );
      const roleText = isPersonal ? "Personal Workspace" : getRoleForOrg(org.id);
      return isActive ? `${roleText} · Active` : roleText;
    },
    [user?.full_name, getRoleForOrg]
  );

  // ── 4. Switching organization ──────────────────────────────────────────────
  const handleSelectOrg = async (org: Organization) => {
    if (org.id === currentOrg?.id) {
      setIsOpen(false);
      setSearchQuery("");
      return;
    }

    if (isSwitching) return; // Prevent duplicate concurrent requests
    setIsSwitching(org.id);

    try {
      // 1. Update localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("selected_organization_id", org.id);
      }

      // 2. Update local state
      setCurrentOrg(org);

      // 3. Notify entire application & invalidation listeners
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("organization_changed"));
      }

      // 4. Invoke optional parent callback
      onOrganizationChanged?.(org);

      toast.success(`Switched to ${org.name}`);

      // 5. If currently viewing an org-scoped page like /organizations/:id, update route
      if (pathname.startsWith("/organizations/")) {
        router.push(`/organizations/${org.id}`);
      }

      setIsOpen(false);
      setSearchQuery("");
      onNavigate?.();
    } catch {
      toast.error("Failed to switch organization. Please try again.");
    } finally {
      setIsSwitching(null);
    }
  };

  // ── 5. Create new workspace ────────────────────────────────────────────────
  const handleCreateOrg = async (
    data: OrganizationCreate | OrganizationUpdate
  ) => {
    setIsSubmitting(true);
    try {
      const newOrg = await organizationsService.createOrganization(
        data as OrganizationCreate
      );
      toast.success(`Workspace "${newOrg.name}" created!`);
      setIsCreateOpen(false);
      await loadOrgs();
      handleSelectOrg(newOrg);
    } catch {
      toast.error("Failed to create workspace.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── 6. Filter & Sort Organizations ─────────────────────────────────────────
  const filteredOrgs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = organizations.filter((org) =>
      query ? org.name.toLowerCase().includes(query) : true
    );

    // Place active organization first, then sort remaining alphabetically
    return matches.sort((a, b) => {
      if (a.id === currentOrg?.id) return -1;
      if (b.id === currentOrg?.id) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [organizations, searchQuery, currentOrg?.id]);

  const activeLetter = getFirstLetter(currentOrg?.name);
  const activeRole = currentOrg ? getRoleForOrg(currentOrg.id) : "Workspace";

  return (
    <>
      <div ref={containerRef} className={cn("relative", className)}>
        {/* ── TRIGGER BUTTON ──────────────────────────────────────────────── */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            "w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-all duration-150 group cursor-pointer",
            "bg-sidebar-accent/50 hover:bg-sidebar-accent border border-sidebar-border text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring shadow-2xs",
            collapsed && "justify-center px-1.5 py-1.5"
          )}
          title={currentOrg?.name ?? "My Workspace"}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={
            currentOrg
              ? `Current workspace: ${currentOrg.name}`
              : "Switch workspace"
          }
          id="workspace-switcher-trigger"
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* Organization avatar badge / logo */}
            {currentOrg?.logo_url ? (
              <img
                src={currentOrg.logo_url}
                alt={currentOrg.name}
                className="w-5 h-5 rounded-[5px] object-cover shrink-0 select-none border border-border/40"
              />
            ) : (
              <div className="w-5 h-5 rounded-[5px] bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs select-none">
                {activeLetter}
              </div>
            )}

            {!collapsed && (
              <span className="text-[12.5px] font-semibold text-sidebar-foreground truncate text-left">
                {currentOrg?.name ?? "Select Workspace"}
              </span>
            )}
          </div>

          {!collapsed && (
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-70 group-hover:opacity-100 transition-transform duration-200",
                isOpen && "rotate-180"
              )}
              aria-hidden="true"
            />
          )}
        </button>

        {/* ── COMPACT WORKSPACE POPOVER ────────────────────────────────────── */}
        {isOpen && (
          <div
            role="listbox"
            aria-label="Select an organization to manage"
            className={cn(
              "absolute z-50 w-[310px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover text-popover-foreground shadow-xl backdrop-blur-md p-2 animate-in fade-in-50 zoom-in-95 duration-150",
              collapsed ? "left-full top-0 ml-2" : "left-0 top-full mt-1.5"
            )}
          >
            {/* ── SECTION 1: ACTIVE WORKSPACE ──────────────────────────────── */}
            <div className="px-2 py-1.5 mb-1.5 rounded-lg bg-muted/40 border border-border/40">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
                  Current Workspace
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                  Active
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                {currentOrg?.logo_url ? (
                  <img
                    src={currentOrg.logo_url}
                    alt={currentOrg.name}
                    className="w-7 h-7 rounded-md object-cover shrink-0 select-none border border-border/40"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs select-none">
                    {activeLetter}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-semibold text-foreground truncate leading-tight"
                    title={currentOrg?.name ?? "My Workspace"}
                  >
                    {currentOrg?.name ?? "My Workspace"}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground truncate leading-tight mt-0.5">
                    {activeRole}
                  </p>
                </div>
              </div>
            </div>

            {/* ── SECTION 2: WORKSPACE SEARCH (when > 2 workspaces) ───────── */}
            {organizations.length > 2 && (
              <div className="relative px-0.5 pb-1.5">
                <Search
                  className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search workspaces..."
                  aria-label="Search workspaces"
                  className="w-full h-7.5 pl-7.5 pr-7 text-xs bg-muted/50 border border-border/60 rounded-md placeholder:text-muted-foreground text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary transition-all"
                />
                {searchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* ── SECTION 3: AVAILABLE WORKSPACES ─────────────────────────── */}
            <div className="space-y-0.5 pt-0.5">
              <div className="flex items-center justify-between px-1.5 py-0.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
                  Your Workspaces
                </span>
                <span className="text-[10.5px] text-muted-foreground tabular-nums select-none">
                  {filteredOrgs.length}
                </span>
              </div>

              <div
                className="max-h-48 overflow-y-auto space-y-0.5 py-0.5 pr-0.5"
                style={{ scrollbarWidth: "thin" }}
              >
                {filteredOrgs.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    No workspaces found
                  </div>
                ) : (
                  filteredOrgs.map((org) => {
                    const isActive = org.id === currentOrg?.id;
                    const letter = getFirstLetter(org.name);
                    const subtitle = getOrgSubtitle(org, isActive);
                    const isSwitchingThis = isSwitching === org.id;

                    return (
                      <button
                        key={org.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        disabled={isSwitching !== null}
                        onClick={() => handleSelectOrg(org)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer group",
                          isActive
                            ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                            : "text-foreground hover:bg-muted/70 hover:text-foreground border border-transparent"
                        )}
                      >
                        {/* Org avatar initial / logo */}
                        {org.logo_url ? (
                          <img
                            src={org.logo_url}
                            alt={org.name}
                            className="w-5 h-5 rounded-[5px] object-cover shrink-0 select-none border border-border/40"
                          />
                        ) : (
                          <div
                            className={cn(
                              "w-5 h-5 rounded-[5px] flex items-center justify-center font-bold text-[10px] shrink-0 select-none",
                              isActive
                                ? "bg-primary text-primary-foreground shadow-2xs"
                                : "bg-muted text-muted-foreground border border-border/40 group-hover:bg-muted/90 group-hover:text-foreground"
                            )}
                          >
                            {letter}
                          </div>
                        )}

                        {/* Org title & role */}
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate leading-tight text-xs",
                              isActive
                                ? "font-semibold text-primary dark:text-sky-400"
                                : "font-medium text-foreground"
                            )}
                          >
                            {org.name}
                          </p>
                          <p className="text-[10.5px] text-muted-foreground truncate leading-tight mt-0.5">
                            {subtitle}
                          </p>
                        </div>

                        {/* Active checkmark or switching spinner */}
                        {isSwitchingThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                        ) : (
                          isActive && (
                            <Check className="w-3.5 h-3.5 text-primary dark:text-sky-400 shrink-0" />
                          )
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── SECTION 4: WORKSPACE ACTIONS ─────────────────────────────── */}
            <div className="border-t border-border mt-1.5 pt-1.5 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSearchQuery("");
                  router.push("/settings");
                  onNavigate?.();
                }}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors text-left cursor-pointer group"
              >
                <Settings className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                <span>Workspace Settings</span>
              </button>

              {permissions.canCreateOrganization && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setSearchQuery("");
                    setIsCreateOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors text-left cursor-pointer group"
                >
                  <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>Create Workspace</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Organization Creation Modal Dialog */}
      <OrganizationDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={handleCreateOrg}
        isLoading={isSubmitting}
      />
    </>
  );
}
