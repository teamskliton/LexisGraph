// OrganizationWorkspaceNav — Workspace sub-navigation component for Organization Workspace
// Renders tabs/sidebar for Overview, Policies, Regulations, Compliance, Reports, Knowledge Graph, AI Assistant, Team, Settings.

"use client";

import React, { memo } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  BookOpen,
  Zap,
  BarChart3,
  Network,
  Bot,
  Users,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceTab =
  | "overview"
  | "policies"
  | "regulations"
  | "compliance"
  | "reports"
  | "knowledge-graph"
  | "ai-assistant"
  | "team"
  | "settings";

interface OrganizationWorkspaceNavProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  organizationId: string;
}

interface NavItem {
  id: WorkspaceTab;
  label: string;
  icon: React.ReactNode;
  route?: string;
  badge?: string;
}

export const OrganizationWorkspaceNav = memo(function OrganizationWorkspaceNav({
  activeTab,
  onTabChange,
  organizationId,
}: OrganizationWorkspaceNavProps) {
  const router = useRouter();

  const navItems: NavItem[] = [
    {
      id: "overview",
      label: "Overview",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      id: "policies",
      label: "Policies",
      icon: <Shield className="h-4 w-4" />,
      route: "/documents",
    },
    {
      id: "regulations",
      label: "Regulations",
      icon: <BookOpen className="h-4 w-4" />,
      route: "/documents",
    },
    {
      id: "compliance",
      label: "Compliance",
      icon: <Zap className="h-4 w-4" />,
      route: "/compliance",
    },
    {
      id: "reports",
      label: "Reports",
      icon: <BarChart3 className="h-4 w-4" />,
      route: "/reports",
    },
    {
      id: "knowledge-graph",
      label: "Knowledge Graph",
      icon: <Network className="h-4 w-4" />,
      route: "/knowledge-graph",
    },
    {
      id: "ai-assistant",
      label: "AI Assistant",
      icon: <Bot className="h-4 w-4 text-indigo-400" />,
      badge: "AI",
    },
    {
      id: "team",
      label: "Team",
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  const handleItemClick = (item: NavItem) => {
    onTabChange(item.id);
    if (item.route) {
      router.push(item.route);
    }
  };

  return (
    <nav
      aria-label="Organization Workspace Navigation"
      className="flex lg:flex-col items-center lg:items-stretch gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-none"
    >
      {navItems.map((item) => {
        const isActive = activeTab === item.id;

        return (
          <button
            key={item.id}
            onClick={() => handleItemClick(item)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer shrink-0",
              isActive
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge && (
              <span className="ml-auto text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
});
