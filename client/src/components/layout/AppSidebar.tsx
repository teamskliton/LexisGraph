"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { NaturalAvatar } from "@/components/ui/NaturalAvatar";
import { cn } from "@/lib/utils";
import {
  organizationsService,
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
} from "@/services/api/organizations";
import { OrganizationDialog } from "@/components/features/organizations/OrganizationDialog";
import { formatRoleLabel } from "@/utils/role-utils";
import { toast } from "sonner";
import {
  LayoutDashboard,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Network,
  BarChart3,
  MessageSquare,
  Upload,
  Users,
  Settings,
  Building2,
  LogOut,
  ChevronsUpDown,
  Check,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  History,
  Clock,
  X,
  Sparkles,
  Command,
  ArrowUpRight,
  FolderOpen,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

export const SIDEBAR_W_EXPANDED = 244;
export const SIDEBAR_W_COLLAPSED = 58;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NavSubItem {
  label: string;
  href: string;
  icon?: React.ElementType;
}

export interface NavItemDef {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  exact?: boolean;
  children?: NavSubItem[];
}

export interface RecentPageItem {
  title: string;
  href: string;
  timestamp: number;
}

export interface AppSidebarProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  isMobile?: boolean;
  onMobileClose?: () => void;
}

// ─── Workspace Switcher (Linear style) ────────────────────────────────────────

function WorkspaceSwitcher({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { permissions } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadOrgs = useCallback(async () => {
    try {
      const list = await organizationsService.getOrganizations();
      setOrganizations(list || []);
      const storedId =
        typeof window !== "undefined"
          ? localStorage.getItem("selected_organization_id")
          : null;
      let active = (list || []).find((o) => o.id === storedId);
      if (!active && list?.length) active = list[0];
      if (active) {
        setCurrentOrg(active);
        if (typeof window !== "undefined")
          localStorage.setItem("selected_organization_id", active.id);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectOrg = (org: Organization) => {
    setCurrentOrg(org);
    setIsOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("selected_organization_id", org.id);
      window.dispatchEvent(new Event("organization_changed"));
    }
    toast.success(`Switched to ${org.name}`);
  };

  const handleCreate = async (data: OrganizationCreate | OrganizationUpdate) => {
    setIsSubmitting(true);
    try {
      const newOrg = await organizationsService.createOrganization(
        data as OrganizationCreate
      );
      toast.success(`Organization '${newOrg.name}' created!`);
      setIsCreateOpen(false);
      await loadOrgs();
      selectOrg(newOrg);
    } catch {
      toast.error("Failed to create organization.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const initials = currentOrg?.name
    ? currentOrg.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "LG";

  return (
    <>
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen((v) => !v)}
          className={cn(
            "w-full flex items-center gap-2 rounded-lg p-1.5 transition-all duration-150 group",
            "hover:bg-[var(--sidebar-accent)]/70 text-[var(--sidebar-foreground)] focus:outline-none",
            collapsed && "justify-center px-1"
          )}
          title={collapsed ? currentOrg?.name ?? "Workspace" : undefined}
          aria-expanded={isOpen}
          id="workspace-switcher-trigger"
        >
          <NaturalAvatar
            name={currentOrg?.name ?? "LexisGraph"}
            src={currentOrg?.logo_url}
            shape="rounded"
            maxInitials={2}
            className="w-6 h-6 rounded-md text-[10px] shrink-0 shadow-2xs ring-1 ring-black/5 dark:ring-white/10"
          />

          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12px] font-semibold leading-none text-[var(--sidebar-foreground)] truncate">
                  {currentOrg?.name ?? "Select Workspace"}
                </p>
                <p className="text-[10px] text-[var(--sidebar-muted)] mt-0.5 leading-none truncate">
                  Workspace
                </p>
              </div>
              <ChevronsUpDown className="w-3.5 h-3.5 text-[var(--sidebar-muted)] shrink-0 group-hover:text-[var(--sidebar-foreground)] transition-colors opacity-70" />
            </>
          )}
        </button>

        {isOpen && (
          <div
            className={cn(
              "absolute z-50 w-60 mt-1 py-1.5 rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar)] shadow-2xl backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-100",
              collapsed ? "left-full top-0 ml-2" : "left-0 top-full"
            )}
          >
            <div className="px-3 py-1 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sidebar-muted)]">
                Workspaces
              </span>
              <span className="text-[10px] text-[var(--sidebar-muted)] font-mono">
                {organizations.length}
              </span>
            </div>
            <div className="border-b border-[var(--sidebar-border)]/60 my-1" />

            <div className="max-h-56 overflow-y-auto py-0.5" style={{ scrollbarWidth: "thin" }}>
              {organizations.map((org) => {
                const active = org.id === currentOrg?.id;
                return (
                  <button
                    key={org.id}
                    onClick={() => selectOrg(org)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors group text-left",
                      active
                        ? "text-[var(--sidebar-primary)] bg-[var(--sidebar-accent)]/80 font-medium"
                        : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/40"
                    )}
                  >
                    <NaturalAvatar
                      name={org.name}
                      src={org.logo_url}
                      shape="rounded"
                      maxInitials={2}
                      className="w-5 h-5 rounded-md text-[9px] shrink-0"
                    />
                    <span className="flex-1 truncate">{org.name}</span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0 text-[var(--sidebar-primary)]" />}
                  </button>
                );
              })}
            </div>

            {permissions.canCreateOrganization && (
              <>
                <div className="border-t border-[var(--sidebar-border)]/60 my-1" />
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setIsCreateOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--sidebar-primary)] hover:bg-[var(--sidebar-accent)]/40 transition-colors font-medium"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Create Organization</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <OrganizationDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={handleCreate}
        isLoading={isSubmitting}
      />
    </>
  );
}

// ─── Quick Actions (+ New Button) ────────────────────────────────────────────

function QuickActions({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { permissions } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isOrgDialogOpen, setIsOrgDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAction = (href?: string, callback?: () => void) => {
    setIsOpen(false);
    if (href) {
      router.push(href);
      onNavigate?.();
    } else if (callback) {
      callback();
    }
  };

  return (
    <>
      <div ref={menuRef} className="relative">
        {collapsed ? (
          <button
            onClick={() => setIsOpen((v) => !v)}
            title="Create new (+)"
            className={cn(
              "w-8 h-8 mx-auto flex items-center justify-center rounded-lg bg-[var(--sidebar-primary)] text-[var(--sidebar-primary-foreground)]",
              "hover:brightness-110 active:scale-95 transition-all shadow-xs focus:outline-none"
            )}
            id="quick-action-collapsed-btn"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        ) : (
          <button
            onClick={() => setIsOpen((v) => !v)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150",
              "bg-[var(--sidebar-primary)]/15 hover:bg-[var(--sidebar-primary)]/25 text-[var(--sidebar-primary)] border border-[var(--sidebar-primary)]/30 shadow-2xs focus:outline-none"
            )}
            id="quick-action-expanded-btn"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="font-semibold">New</span>
            </div>
            <ChevronDown
              className={cn(
                "w-3 h-3 transition-transform duration-150 opacity-70",
                isOpen && "rotate-180"
              )}
            />
          </button>
        )}

        {isOpen && (
          <div
            className={cn(
              "absolute z-50 w-56 mt-1 py-1 rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar)] shadow-2xl backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-100",
              collapsed ? "left-full top-0 ml-2" : "left-0 top-full"
            )}
          >
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--sidebar-muted)]">
              Quick Actions
            </p>
            <div className="border-b border-[var(--sidebar-border)]/60 mb-1" />

            <button
              onClick={() => handleAction("/upload")}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/50 transition-colors text-left"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div className="flex-1 truncate">
                <p className="font-medium">Upload Document</p>
                <p className="text-[10px] text-[var(--sidebar-muted)]">PDF, Word, regulatory texts</p>
              </div>
            </button>

            <button
              onClick={() => handleAction("/compliance/new")}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/50 transition-colors text-left"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div className="flex-1 truncate">
                <p className="font-medium">New Compliance Run</p>
                <p className="text-[10px] text-[var(--sidebar-muted)]">Analyze policies vs standards</p>
              </div>
            </button>

            <button
              onClick={() => handleAction("/ai-assistant")}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/50 transition-colors text-left"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
              <div className="flex-1 truncate">
                <p className="font-medium">AI Legal Assistant</p>
                <p className="text-[10px] text-[var(--sidebar-muted)]">Query regulatory graph</p>
              </div>
            </button>

            {permissions.canCreateOrganization && (
              <>
                <div className="border-t border-[var(--sidebar-border)]/60 my-1" />
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setIsOrgDialogOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/50 transition-colors text-left"
                >
                  <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-medium truncate">Create Organization</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <OrganizationDialog
        open={isOrgDialogOpen}
        onOpenChange={setIsOrgDialogOpen}
        onSubmit={async (data) => {
          try {
            const newOrg = await organizationsService.createOrganization(data as OrganizationCreate);
            toast.success(`Organization '${newOrg.name}' created!`);
            setIsOrgDialogOpen(false);
            if (typeof window !== "undefined") {
              localStorage.setItem("selected_organization_id", newOrg.id);
              window.dispatchEvent(new Event("organization_changed"));
            }
          } catch {
            toast.error("Failed to create organization.");
          }
        }}
        isLoading={false}
      />
    </>
  );
}

// ─── Command / Quick Search Modal ────────────────────────────────────────────

function CommandSearchModal({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate?: (href: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const allActions = useMemo(
    () => [
      { label: "Dashboard", href: "/dashboard", group: "Pages", icon: LayoutDashboard },
      { label: "Compliance Analysis", href: "/compliance", group: "Pages", icon: ShieldCheck },
      { label: "New Compliance Run", href: "/compliance/new", group: "Quick Actions", icon: PlusCircle },
      { label: "Compliance History", href: "/compliance/history", group: "Pages", icon: History },
      { label: "All Findings & Remediation", href: "/findings", group: "Pages", icon: ShieldAlert },
      { label: "Documents Library", href: "/documents", group: "Pages", icon: FileText },
      { label: "Upload New Document", href: "/upload", group: "Quick Actions", icon: Upload },
      { label: "Knowledge Graph", href: "/knowledge-graph", group: "Pages", icon: Network },
      { label: "AI Legal Assistant", href: "/ai-assistant", group: "Pages", icon: MessageSquare },
      { label: "Audit Reports", href: "/reports", group: "Pages", icon: BarChart3 },
      { label: "Organizations", href: "/organizations", group: "Admin", icon: Building2 },
      { label: "Team Members", href: "/team", group: "Admin", icon: Users },
      { label: "Workspace Settings", href: "/settings", group: "Admin", icon: Settings },
    ],
    []
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return allActions;
    const q = query.toLowerCase();
    return allActions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.href.toLowerCase().includes(q) ||
        a.group.toLowerCase().includes(q)
    );
  }, [query, allActions]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150">
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[var(--sidebar-border)] bg-[var(--sidebar)] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--sidebar-border)]/70">
          <Search className="w-4 h-4 text-[var(--sidebar-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or jump to page..."
            className="flex-1 bg-transparent text-[13px] text-[var(--sidebar-foreground)] placeholder-[var(--sidebar-muted)] focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded bg-[var(--sidebar-accent)] text-[var(--sidebar-muted)] border border-[var(--sidebar-border)]">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1" style={{ scrollbarWidth: "thin" }}>
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-[var(--sidebar-muted)]">
              No matching pages or actions found.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  onClick={() => {
                    onClose();
                    router.push(item.href);
                    onNavigate?.(item.href);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/70 transition-colors text-left group"
                >
                  <div className="p-1.5 rounded-md bg-[var(--sidebar-accent)]/80 text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-primary)] transition-colors">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 font-medium">{item.label}</span>
                  <span className="text-[10px] font-mono text-[var(--sidebar-muted)] opacity-60">
                    {item.group}
                  </span>
                  <ArrowUpRight className="w-3 h-3 text-[var(--sidebar-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2 border-t border-[var(--sidebar-border)]/50 bg-[var(--sidebar-accent)]/20 flex items-center justify-between text-[11px] text-[var(--sidebar-muted)]">
          <div className="flex items-center gap-2">
            <span>Navigation shortcut</span>
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-[var(--sidebar)] border border-[var(--sidebar-border)]">
              ↵ Enter
            </kbd>
          </div>
          <span>LexisGraph Quick Palette</span>
        </div>
      </div>
    </div>
  );
}

// ─── Nav Item Row with Optional Expandable Sub-items ─────────────────────────

function NavItemRow({
  item,
  collapsed,
  pathname,
  onNavigate,
}: {
  item: NavItemDef;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const hasChildren = item.children && item.children.length > 0;

  const isExactActive = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");

  // Accordion state: auto-expand if any child is active
  const isChildActive = useMemo(() => {
    return Boolean(
      item.children?.some(
        (c) => pathname === c.href || pathname.startsWith(c.href + "/")
      )
    );
  }, [item.children, pathname]);

  const [expanded, setExpanded] = useState<boolean>(() => isChildActive);

  // Sync expanded state if child becomes active on route change
  useEffect(() => {
    if (isChildActive) {
      setExpanded(true);
    }
  }, [isChildActive]);

  const isActive = isExactActive || isChildActive;

  if (collapsed) {
    return (
      <div className="group relative flex justify-center py-0.5">
        <Link
          href={item.href}
          onClick={onNavigate}
          title={item.label}
          className={cn(
            "relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 focus:outline-none",
            isActive
              ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-primary)] font-semibold shadow-2xs"
              : "text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/40"
          )}
        >
          {isActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[var(--sidebar-primary)]" />
          )}
          <Icon className={cn("w-4 h-4", isActive && "text-[var(--sidebar-primary)]")} />
        </Link>

        {/* Floating Tooltip */}
        <div className="pointer-events-none absolute left-full ml-2.5 px-2.5 py-1 rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl border border-white/10 top-1/2 -translate-y-1/2">
          {item.label}
          {item.badge !== undefined && (
            <span className="ml-1.5 px-1 py-0.2 rounded-full text-[9px] bg-blue-500/20 text-blue-400 font-bold">
              {item.badge}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center group">
        <Link
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "group relative flex-1 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150 select-none focus:outline-none",
            isActive
              ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-primary)] font-semibold"
              : "text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/40"
          )}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full bg-[var(--sidebar-primary)]" />
          )}
          <Icon
            className={cn(
              "w-4 h-4 shrink-0 transition-colors",
              isActive
                ? "text-[var(--sidebar-primary)]"
                : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]"
            )}
          />
          <span className="flex-1 truncate leading-none">{item.label}</span>

          {item.badge !== undefined && (
            <span
              className={cn(
                "ml-auto shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1.5",
                isActive
                  ? "bg-[var(--sidebar-primary)]/20 text-[var(--sidebar-primary)]"
                  : "bg-[var(--sidebar-accent)] text-[var(--sidebar-muted)]"
              )}
            >
              {item.badge}
            </span>
          )}
        </Link>

        {hasChildren && (
          <button
            onClick={(e) => {
              e.preventDefault();
              setExpanded((v) => !v);
            }}
            className="p-1.5 mr-0.5 text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/50 rounded-md transition-colors focus:outline-none"
            title={expanded ? "Collapse section" : "Expand section"}
          >
            <ChevronDown
              className={cn(
                "w-3 h-3 transition-transform duration-200",
                !expanded && "-rotate-90"
              )}
            />
          </button>
        )}
      </div>

      {/* Expandable Sub-items */}
      {hasChildren && expanded && (
        <div className="ml-5 pl-2.5 border-l border-[var(--sidebar-border)]/60 space-y-0.5 py-0.5">
          {item.children!.map((sub) => {
            const isSubActive =
              pathname === sub.href ||
              (sub.href !== "/compliance" && pathname.startsWith(sub.href + "/"));
            const SubIcon = sub.icon;
            return (
              <Link
                key={sub.href}
                href={sub.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-[12px] font-medium transition-colors select-none",
                  isSubActive
                    ? "text-[var(--sidebar-primary)] bg-[var(--sidebar-accent)]/60 font-semibold"
                    : "text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/30"
                )}
              >
                {SubIcon && <SubIcon className="w-3 h-3 shrink-0 opacity-70" />}
                <span className="truncate">{sub.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Collapsible Nav Section Header ──────────────────────────────────────────

function SectionHeader({
  label,
  collapsed,
  isOpen,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  isOpen: boolean;
  onToggle?: () => void;
}) {
  if (collapsed) {
    return <div className="border-t border-[var(--sidebar-border)]/50 my-2 mx-1" />;
  }

  return (
    <div className="flex items-center justify-between px-2.5 pt-3 pb-1 select-none group">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sidebar-muted)] opacity-80">
        {label}
      </span>
      {onToggle && (
        <button
          onClick={onToggle}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] transition-opacity"
          title={isOpen ? "Collapse section" : "Expand section"}
        >
          <ChevronDown
            className={cn(
              "w-2.5 h-2.5 transition-transform duration-200",
              !isOpen && "-rotate-90"
            )}
          />
        </button>
      )}
    </div>
  );
}

// ─── Recent Visited Items Section ─────────────────────────────────────────────

function RecentItemsSection({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const [recents, setRecents] = useState<RecentPageItem[]>([]);
  const [isOpen, setIsOpen] = useState(true);

  // Load from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("lexisgraph_recent_pages");
      if (raw) {
        setRecents(JSON.parse(raw));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Record current page visit
  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;
    // Only track authenticated application pages
    if (pathname === "/login" || pathname === "/register" || pathname === "/") return;

    const pageLabels: Record<string, string> = {
      "/dashboard": "Dashboard",
      "/compliance": "Compliance Overview",
      "/compliance/new": "New Compliance Run",
      "/compliance/history": "Analysis History",
      "/findings": "All Findings",
      "/documents": "Documents",
      "/upload": "Upload Document",
      "/knowledge-graph": "Knowledge Graph",
      "/ai-assistant": "AI Assistant",
      "/reports": "Reports",
      "/organizations": "Organizations",
      "/team": "Team Management",
      "/settings": "Settings",
      "/notifications": "Notifications",
    };

    let title = pageLabels[pathname];
    if (!title) {
      if (pathname.startsWith("/reports/")) title = "Report Details";
      else if (pathname.startsWith("/compliance/")) title = "Compliance Run";
      else if (pathname.startsWith("/findings/")) title = "Finding Detail";
      else return;
    }

    try {
      const raw = localStorage.getItem("lexisgraph_recent_pages");
      const list: RecentPageItem[] = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((item) => item.href !== pathname);
      const updated = [{ title, href: pathname, timestamp: Date.now() }, ...filtered].slice(0, 4);
      localStorage.setItem("lexisgraph_recent_pages", JSON.stringify(updated));
      setRecents(updated);
    } catch {
      /* ignore */
    }
  }, [pathname]);

  const clearRecents = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window !== "undefined") {
      localStorage.removeItem("lexisgraph_recent_pages");
    }
    setRecents([]);
  };

  if (recents.length === 0 || collapsed) return null;

  return (
    <div className="pt-1">
      <div className="flex items-center justify-between px-2.5 pt-2 pb-1 select-none group">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sidebar-muted)] opacity-80 flex items-center gap-1.5">
          <Clock className="w-2.5 h-2.5 text-[var(--sidebar-muted)]" />
          Recent
        </span>
        <button
          onClick={clearRecents}
          className="text-[9px] text-[var(--sidebar-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Clear recent pages"
        >
          Clear
        </button>
      </div>

      {isOpen && (
        <div className="px-2 space-y-0.5">
          {recents.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-[12px] font-medium transition-colors truncate",
                  isActive
                    ? "text-[var(--sidebar-primary)] bg-[var(--sidebar-accent)]/50 font-semibold"
                    : "text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/30"
                )}
                title={item.title}
              >
                <Clock className="w-3 h-3 shrink-0 opacity-60" />
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main AppSidebar Component ───────────────────────────────────────────────

export function AppSidebar({
  collapsed: controlledCollapsed,
  onCollapsedChange,
  isMobile,
  onMobileClose,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAdmin, permissions, activeRole } = useAuth();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  // Section collapse state (Mixpanel style)
  const [workspaceSectionOpen, setWorkspaceSectionOpen] = useState(true);
  const [managementSectionOpen, setManagementSectionOpen] = useState(true);

  const collapsed = isMobile ? false : (controlledCollapsed ?? internalCollapsed);
  const setCollapsed = (v: boolean) => {
    setInternalCollapsed(v);
    onCollapsedChange?.(v);
  };

  // Keyboard shortcut (⌘K or Ctrl+K) to open Quick Command Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const initials =
    user?.full_name
      ?.split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() ??
    user?.email?.slice(0, 2).toUpperCase() ??
    "U";

  // Navigation Items according to IA specifications
  const workspaceNav: NavItemDef[] = useMemo(
    () => [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
      {
        id: "organizations",
        label: "Organizations",
        href: "/organizations",
        icon: Building2,
      },
      {
        id: "documents",
        label: "Documents",
        href: "/documents",
        icon: FileText,
      },
      {
        id: "compliance",
        label: "Compliance Analysis",
        href: "/compliance",
        icon: ShieldCheck,
        children: [
          { label: "Overview", href: "/compliance", icon: ShieldCheck },
          { label: "New Analysis", href: "/compliance/new", icon: PlusCircle },
          { label: "Analysis History", href: "/compliance/history", icon: History },
        ],
      },
      {
        id: "knowledge-graph",
        label: "Knowledge Graph",
        href: "/knowledge-graph",
        icon: Network,
      },
      {
        id: "ai-assistant",
        label: "AI Assistant",
        href: "/ai-assistant",
        icon: MessageSquare,
      },
    ],
    []
  );

  const managementNav: NavItemDef[] = useMemo(() => {
    const items: NavItemDef[] = [
      {
        id: "findings",
        label: "Findings",
        href: "/findings",
        icon: ShieldAlert,
      },
      {
        id: "reports",
        label: "Reports",
        href: "/reports",
        icon: BarChart3,
      },
    ];

    if (isAdmin || permissions.canManageMembers) {
      items.push({
        id: "team",
        label: "Team",
        href: "/team",
        icon: Users,
      });
    }

    items.push({
      id: "settings",
      label: "Settings",
      href: "/settings",
      icon: Settings,
    });

    return items;
  }, [isAdmin, permissions.canManageMembers]);

  const width = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;

  return (
    <>
      <aside
        style={{ width }}
        aria-label="Sidebar navigation"
        className={cn(
          "relative z-30 flex flex-col h-full bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] transition-all duration-200 ease-out shrink-0 select-none",
          isMobile && "w-72 max-w-[85vw] border-r-0 shadow-2xl"
        )}
      >
        {/* ── 1. Workspace Header (Logo & Product Name) ──────────────── */}
        <div
          className={cn(
            "flex items-center h-13 px-3 shrink-0 border-b border-[var(--sidebar-border)]/60",
            collapsed ? "justify-center" : "justify-between"
          )}
        >
          {!collapsed ? (
            <Link
              href="/dashboard"
              onClick={onMobileClose}
              className="flex items-center gap-2.5 group min-w-0"
              aria-label="LexisGraph home"
            >
              <BrandLogo size={26} priority rounded="rounded-md" />
              <span className="text-[13.5px] font-bold tracking-tight text-[var(--sidebar-foreground)] group-hover:text-[var(--sidebar-primary)] transition-colors truncate">
                LexisGraph AI
              </span>
            </Link>
          ) : (
            <Link
              href="/dashboard"
              aria-label="LexisGraph home"
              className="flex items-center justify-center"
            >
              <BrandLogo size={26} priority rounded="rounded-md" />
            </Link>
          )}

          {!collapsed && (
            <div className="flex items-center gap-1">
              {isMobile ? (
                <button
                  onClick={onMobileClose}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/50 transition-colors focus:outline-none"
                  title="Close sidebar"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setCollapsed(true)}
                  className="flex items-center justify-center w-6 h-6 rounded-md text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/50 transition-colors focus:outline-none"
                  title="Collapse sidebar (⌘[)"
                  id="sidebar-collapse-btn"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── 2. Workspace Switcher (Linear Style) ────────────────────── */}
        <div className="px-2 pt-2.5 pb-2 border-b border-[var(--sidebar-border)]/50">
          <WorkspaceSwitcher collapsed={collapsed} onNavigate={onMobileClose} />
        </div>

        {/* ── 3. Quick Actions & Quick Search (Mixpanel & Linear) ─────── */}
        <div className="px-2 py-2 space-y-1.5 border-b border-[var(--sidebar-border)]/50">
          <QuickActions collapsed={collapsed} onNavigate={onMobileClose} />

          {/* Quick Search Button */}
          {collapsed ? (
            <button
              onClick={() => setIsCommandOpen(true)}
              title="Search (⌘K)"
              className="w-8 h-8 mx-auto flex items-center justify-center rounded-lg text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/50 transition-colors focus:outline-none"
              id="sidebar-search-collapsed-btn"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setIsCommandOpen(true)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/50 transition-colors border border-[var(--sidebar-border)]/40 focus:outline-none group"
              id="sidebar-search-expanded-btn"
            >
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)] transition-colors" />
                <span>Search...</span>
              </div>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--sidebar-accent)]/80 text-[var(--sidebar-muted)] border border-[var(--sidebar-border)]/60">
                ⌘K
              </kbd>
            </button>
          )}
        </div>

        {/* ── 4. Main Navigation Menu (Scrollable) ───────────────────── */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden py-1.5"
          style={{ scrollbarWidth: "thin" }}
        >
          {/* Section: WORKSPACE */}
          <SectionHeader
            label="Workspace"
            collapsed={collapsed}
            isOpen={workspaceSectionOpen}
            onToggle={() => setWorkspaceSectionOpen((v) => !v)}
          />
          {workspaceSectionOpen && (
            <div className="px-2 space-y-0.5">
              {workspaceNav.map((item) => (
                <NavItemRow
                  key={item.id}
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                  onNavigate={onMobileClose}
                />
              ))}
            </div>
          )}

          {/* Section: MANAGEMENT */}
          <SectionHeader
            label="Management"
            collapsed={collapsed}
            isOpen={managementSectionOpen}
            onToggle={() => setManagementSectionOpen((v) => !v)}
          />
          {managementSectionOpen && (
            <div className="px-2 space-y-0.5">
              {managementNav.map((item) => (
                <NavItemRow
                  key={item.id}
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                  onNavigate={onMobileClose}
                />
              ))}
            </div>
          )}

          {/* Section: RECENT ITEMS (Persisted in localStorage) */}
          <RecentItemsSection
            collapsed={collapsed}
            pathname={pathname}
            onNavigate={onMobileClose}
          />
        </nav>

        {/* ── 5. Fixed Bottom Section (Theme, Notifications & User) ──── */}
        <div className="shrink-0 border-t border-[var(--sidebar-border)]/60 p-2 space-y-1 bg-[var(--sidebar)]/80 backdrop-blur-xs relative z-30">
          {!collapsed && (
            <div className="flex items-center justify-between px-1.5 pb-1 pt-0.5">
              <span className="text-[10px] font-semibold text-[var(--sidebar-muted)] uppercase tracking-wider">
                Controls
              </span>
              <div className="flex items-center gap-1">
                <NotificationBell dropUp className="text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)]" />
                <ThemeToggle />
              </div>
            </div>
          )}

          {/* User Profile / Logout Button */}
          <div className="relative group">
            <button
              onClick={logout}
              title={collapsed ? `Sign out (${user?.email ?? ""})` : "Sign out"}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-all duration-150 select-none",
                "hover:bg-rose-500/10 text-[var(--sidebar-muted)] hover:text-rose-400 focus:outline-none",
                collapsed && "justify-center px-1"
              )}
              id="sidebar-user-logout-btn"
            >
              <div className="relative shrink-0">
                <NaturalAvatar
                  name={user?.full_name || user?.email || "User"}
                  src={user?.avatar_url || user?.photo_url || user?.image}
                  shape="circle"
                  maxInitials={1}
                  className="w-6 h-6 rounded-full text-[10px] shrink-0 shadow-2xs ring-1 ring-black/5 dark:ring-white/10"
                />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-[var(--sidebar)]" />
              </div>

              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[12px] font-semibold leading-none text-[var(--sidebar-foreground)] truncate group-hover:text-rose-400 transition-colors">
                      {user?.full_name ?? user?.email ?? "User"}
                    </p>
                    <p className="text-[10px] text-[var(--sidebar-muted)] leading-none mt-1 truncate">
                      {formatRoleLabel(activeRole)} • Sign out
                    </p>
                  </div>
                  <LogOut className="w-3.5 h-3.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                </>
              )}
            </button>

            {collapsed && (
              <div className="pointer-events-none absolute left-full ml-2.5 px-2.5 py-1 rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl border border-white/10 top-1/2 -translate-y-1/2">
                Sign out ({user?.full_name ?? user?.email ?? ""})
              </div>
            )}
          </div>
        </div>

        {/* ── 6. Expand handle tab when collapsed ────────────────────── */}
        {collapsed && !isMobile && (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute top-4 -right-2.5 z-20 flex items-center justify-center w-5 h-5 rounded-full border border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] shadow-md transition-colors focus:outline-none"
            title="Expand sidebar (⌘[)"
            id="sidebar-expand-btn"
          >
            <PanelLeftOpen className="w-2.5 h-2.5" />
          </button>
        )}
      </aside>

      {/* Global Command / Quick Search Modal */}
      <CommandSearchModal
        open={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onNavigate={onMobileClose}
      />
    </>
  );
}
