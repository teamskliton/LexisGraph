"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "./AppSidebar";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * AppShell — Root layout wrapper for all authenticated application pages.
 * Incorporates:
 * 1. Desktop collapsible sidebar (persisted in localStorage).
 * 2. Mobile top header bar + slide-over drawer with backdrop.
 * 3. Fluid scrollable main content viewport.
 */
export function AppShell({ children, className }: AppShellProps) {
  const pathname = usePathname();

  // Desktop sidebar collapsed state (persisted)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Mobile drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
    try {
      const stored = localStorage.getItem("lexisgraph_sidebar_collapsed");
      if (stored !== null) {
        setSidebarCollapsed(stored === "true");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleCollapsedChange = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    try {
      localStorage.setItem("lexisgraph_sidebar_collapsed", String(collapsed));
    } catch {
      /* ignore */
    }
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileDrawerOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop Sidebar (Visible on md/lg screens) ───────────────── */}
      <div className="hidden lg:flex h-full shrink-0 relative z-30">
        <AppSidebar
          collapsed={isClient ? sidebarCollapsed : false}
          onCollapsedChange={handleCollapsedChange}
        />
      </div>

      {/* ── Mobile Slide-Over Drawer with Backdrop ──────────────────── */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in-50 duration-200"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Sheet */}
          <div className="fixed inset-y-0 left-0 z-50 flex max-w-full animate-in slide-in-from-left duration-200 shadow-2xl">
            <AppSidebar
              isMobile={true}
              onMobileClose={() => setMobileDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Main Content Area ────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden relative z-0">
        {/* Mobile Top Header (Hidden on lg+ screens) */}
        <header className="lg:hidden flex items-center justify-between h-13 px-4 border-b border-border bg-background/95 backdrop-blur-md shrink-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none"
              aria-label="Open navigation menu"
              id="mobile-menu-trigger"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <BrandLogo size={24} priority rounded="rounded-md" />
              <span className="font-bold tracking-tight text-sm text-foreground">
                LexisGraph AI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main
          className={cn(
            "flex-1 overflow-y-auto min-w-0 transition-all duration-200 focus:outline-none relative z-0",
            className
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
