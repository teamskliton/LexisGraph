"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NAV_LINKS, HERO } from "./landing-content";
import { ThemeToggle } from "@/components/layout/theme-toggle";

import { BrandLogo } from "@/components/ui/brand-logo";

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <nav
        aria-label="Main navigation"
        className={`landing-nav border-b border-[#E2E8F0] dark:border-border bg-white/95 dark:bg-card/90 backdrop-blur-md shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] transition-colors${scrolled ? " scrolled" : ""}`}
      >
        <div className="landing-container">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              href="/"
              aria-label="LexisGraph home"
              className="flex items-center gap-2.5 select-none group"
            >
              {/* Brand Logo mark */}
              <BrandLogo size={34} priority />
              {/* Wordmark */}
              <span
                className="text-lg font-bold tracking-tight text-[#0F172A] dark:text-foreground group-hover:text-[#0A61C9] dark:group-hover:text-primary transition-colors duration-150"
                style={{ fontFeatureSettings: '"kern" 1' }}
              >
                LexisGraph
              </span>
            </Link>

            {/* Desktop nav */}
            <ul className="hidden md:flex items-center gap-1 sm:gap-1.5" role="list">
              {NAV_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="px-3.5 py-2 text-xs sm:text-[13px] font-medium text-[#334155] dark:text-muted-foreground hover:text-[#0A61C9] dark:hover:text-foreground active:text-[#0A61C9] rounded-lg transition-all duration-150 hover:bg-[#EAF3FF]/80 dark:hover:bg-surface-muted"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            {/* Desktop CTAs & Theme Toggle */}
            <div className="hidden md:flex items-center gap-2.5">
              <ThemeToggle className="text-[#334155] dark:text-muted-foreground hover:text-[#0A61C9] dark:hover:text-foreground hover:bg-[#EAF3FF]/80 dark:hover:bg-surface-muted rounded-lg transition-colors" />
              <Link
                href="/login"
                className="px-3.5 py-2 text-xs sm:text-[13px] font-medium text-[#334155] dark:text-foreground hover:text-[#0A61C9] dark:hover:text-primary hover:bg-[#EAF3FF]/80 dark:hover:bg-primary-subtle border border-transparent rounded-lg transition-all duration-150"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 text-xs sm:text-[13px] font-semibold bg-[#0A61C9] hover:bg-[#084FA5] active:bg-[#063D80] text-white dark:bg-primary dark:hover:bg-primary-hover dark:text-primary-foreground rounded-lg transition-all duration-150 shadow-xs hover:shadow-sm"
              >
                Get Started
              </Link>
            </div>

            {/* Mobile actions */}
            <div className="flex items-center gap-1.5 md:hidden">
              <ThemeToggle className="text-[#334155] dark:text-muted-foreground hover:text-[#0A61C9] dark:hover:text-foreground hover:bg-[#EAF3FF]/80 dark:hover:bg-surface-muted transition-colors" />
              <button
                id="mobile-menu-toggle"
                aria-label={open ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={open}
                aria-controls="mobile-menu"
                className="p-2 rounded-lg text-[#334155] dark:text-muted-foreground hover:text-[#0A61C9] dark:hover:text-foreground hover:bg-[#EAF3FF]/80 dark:hover:bg-surface-muted transition-colors duration-150"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="fixed inset-0 z-50 md:hidden"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <div className="absolute top-0 right-0 bottom-0 w-72 bg-white dark:bg-surface border-l border-[#E2E8F0] dark:border-border shadow-xl flex flex-col animate-drawer-panel">
            <div className="flex items-center justify-between p-5 border-b border-[#E2E8F0] dark:border-border">
              <span className="text-base font-bold text-[#0F172A] dark:text-foreground">Navigation</span>
              <button
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-[#334155] dark:text-muted-foreground hover:text-[#0A61C9] dark:hover:text-foreground hover:bg-[#EAF3FF]/80 dark:hover:bg-surface-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4">
              <ul className="flex flex-col gap-1.5" role="list">
                {NAV_LINKS.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block px-3.5 py-2.5 text-sm font-medium text-[#334155] dark:text-muted-foreground hover:text-[#0A61C9] dark:hover:text-foreground rounded-lg transition-colors hover:bg-[#EAF3FF]/80 dark:hover:bg-surface-muted"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="p-4 border-t border-[#E2E8F0] dark:border-border flex flex-col gap-2">
              <div className="flex items-center justify-between px-2 py-1 mb-1">
                <span className="text-sm font-medium text-[#334155] dark:text-muted-foreground">Appearance</span>
                <ThemeToggle />
              </div>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="w-full text-center px-4 py-2.5 text-sm font-semibold text-[#0F172A] dark:text-foreground border border-[#E2E8F0] dark:border-border rounded-lg hover:border-[#0A61C9] hover:text-[#0A61C9] hover:bg-[#EAF3FF]/60 dark:hover:bg-surface-muted transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="w-full text-center px-4 py-2.5 text-sm font-semibold bg-[#0A61C9] hover:bg-[#084FA5] active:bg-[#063D80] text-white dark:bg-primary dark:hover:bg-primary-hover dark:text-primary-foreground rounded-lg transition-colors shadow-xs"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
