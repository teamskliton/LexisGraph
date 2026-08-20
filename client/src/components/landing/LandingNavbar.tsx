"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NAV_LINKS, HERO } from "./landing-content";

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
        className={`landing-nav${scrolled ? " scrolled" : ""}`}
      >
        <div className="landing-container">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              href="/"
              aria-label="LexisGraph home"
              className="flex items-center gap-2.5 select-none group"
            >
              {/* Icon mark */}
              <div className="relative w-8 h-8 flex-shrink-0">
                <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
                  <rect width="32" height="32" rx="8" fill="var(--primary)" />
                  <circle cx="16" cy="16" r="3" fill="white" />
                  <circle cx="8" cy="10" r="2" fill="white" opacity="0.7" />
                  <circle cx="24" cy="10" r="2" fill="white" opacity="0.7" />
                  <circle cx="8" cy="22" r="2" fill="white" opacity="0.7" />
                  <circle cx="24" cy="22" r="2" fill="white" opacity="0.7" />
                  <line x1="16" y1="16" x2="8" y2="10" stroke="white" strokeWidth="1.5" opacity="0.5" />
                  <line x1="16" y1="16" x2="24" y2="10" stroke="white" strokeWidth="1.5" opacity="0.5" />
                  <line x1="16" y1="16" x2="8" y2="22" stroke="white" strokeWidth="1.5" opacity="0.5" />
                  <line x1="16" y1="16" x2="24" y2="22" stroke="white" strokeWidth="1.5" opacity="0.5" />
                </svg>
              </div>
              {/* Wordmark */}
              <span
                className="text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors duration-150"
                style={{ fontFeatureSettings: '"kern" 1' }}
              >
                LexisGraph
              </span>
            </Link>

            {/* Desktop nav */}
            <ul className="hidden md:flex items-center gap-1" role="list">
              {NAV_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors duration-150 hover:bg-surface-muted"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            {/* Desktop CTAs */}
            <div className="hidden md:flex items-center gap-2">
              <Link
                href="/login"
                className="px-4 py-1.5 text-sm font-medium text-foreground hover:text-primary hover:bg-primary-subtle border border-transparent hover:border-primary-muted rounded-lg transition-all duration-150"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-1.5 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors duration-150 shadow-sm"
              >
                Get Started
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              id="mobile-menu-toggle"
              aria-label={open ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors duration-150"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
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
          <div className="absolute top-0 right-0 bottom-0 w-72 bg-surface border-l border-border shadow-xl flex flex-col animate-drawer-panel">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <span className="text-base font-bold text-foreground">Navigation</span>
              <button
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4">
              <ul className="flex flex-col gap-1" role="list">
                {NAV_LINKS.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block px-3.5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors hover:bg-surface-muted"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="p-4 border-t border-border flex flex-col gap-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="w-full text-center px-4 py-2.5 text-sm font-medium text-foreground border border-border rounded-lg hover:border-primary hover:text-primary transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="w-full text-center px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors"
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
