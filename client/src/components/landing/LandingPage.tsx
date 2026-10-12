"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  FolderInput,
  BarChart3,
  Search,
  ShieldCheck,
  Sparkles,
  FileText,
  Users,
  Menu,
  X,
  Boxes,
} from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { BrandLogo } from "@/components/ui/brand-logo";
import KnowledgeParticleNetwork from "@/components/animations/KnowledgeParticleNetwork";

// ============================================================================
// Types & Data Structures
// ============================================================================

interface CapabilityItem {
  id: string;
  stepNum: string;
  title: string;
  shortDesc: string;
}

const CAPABILITIES_LIST: CapabilityItem[] = [
  {
    id: "analysis",
    stepNum: "01",
    title: "Compliance Analysis",
    shortDesc: "Track coverage & score gaps at a glance",
  },
  {
    id: "finding",
    stepNum: "02",
    title: "Finding Traceability",
    shortDesc: "Link gaps to evidence & policies",
  },
  {
    id: "graph",
    stepNum: "03",
    title: "Graph Explorer",
    shortDesc: "Queryable relationship network",
  },
  {
    id: "ai-mapping",
    stepNum: "04",
    title: "AI-Assisted Mapping",
    shortDesc: "Accelerate requirement-policy matching",
  },
];

export default function LandingPage() {
  const [activeCapIndex, setActiveCapIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedGraphNode, setSelectedGraphNode] = useState<string>("req");

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased overflow-x-hidden transition-colors duration-200">
      {/* ==================================================================== */}
      {/* 1. STICKY NAVBAR                                                     */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/90 backdrop-blur-xl transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo with Node Icon */}
          <Link
            href="/"
            className="flex items-center gap-2.5 select-none group focus:outline-none"
            aria-label="LexisGraph Home"
          >
            <div className="relative flex items-center justify-center">
              <BrandLogo size={30} rounded="rounded-lg" />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary border border-card flex items-center justify-center text-[8px] text-primary-foreground">
                <Boxes className="w-2 h-2" />
              </div>
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              LexisGraph
            </span>
          </Link>

          {/* Nav links (Desktop) */}
          <nav className="hidden md:flex items-center gap-1.5" aria-label="Main Navigation">
            <a
              href="#hero"
              className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated rounded-md transition-colors"
            >
              Product
            </a>
            <a
              href="#how-it-works"
              className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated rounded-md transition-colors"
            >
              How It Works
            </a>
            <a
              href="#capabilities"
              className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated rounded-md transition-colors"
            >
              Capabilities
            </a>
            <a
              href="#security"
              className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated rounded-md transition-colors"
            >
              Security
            </a>
            <a
              href="#contrast"
              className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated rounded-md transition-colors"
            >
              About
            </a>
          </nav>

          {/* Right Controls: Theme Toggle, Sign In, Get Started */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-surface-elevated" />
            <Link
              href="/login"
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground border border-primary rounded-md transition-colors duration-150"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger button */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-surface-elevated" />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated focus:outline-none"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-card px-4 pt-2 pb-5 space-y-2">
            <a
              href="#hero"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated rounded-md"
            >
              Product
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated rounded-md"
            >
              How It Works
            </a>
            <a
              href="#capabilities"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated rounded-md"
            >
              Capabilities
            </a>
            <a
              href="#security"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated rounded-md"
            >
              Security
            </a>
            <a
              href="#contrast"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated rounded-md"
            >
              About
            </a>
            <div className="pt-3 border-t border-border flex items-center gap-3">
              <Link
                href="/login"
                className="flex-1 py-2 text-center text-xs font-semibold text-foreground border border-border hover:bg-surface-elevated rounded-md"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="flex-1 py-2 text-center text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground border border-primary rounded-md"
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ==================================================================== */}
      {/* SECTION 1: HERO SECTION                                              */}
      {/* ==================================================================== */}
      <section
        id="hero"
        aria-labelledby="hero-title"
        className="relative pt-20 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden bg-background transition-colors"
      >
        {/* Interactive Mouse-Tracking Knowledge Particle Network */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <KnowledgeParticleNetwork
            particleCount={115}
            connectionDistance={125}
            mouseRadius={165}
            interactionStrength={40}
            animationSpeed={1}
            className="w-full h-full"
          />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto flex flex-col items-center text-center">
          {/* Badge Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border bg-card text-primary text-xs font-semibold tracking-wider uppercase mb-6 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>COMPLIANCE INTELLIGENCE PLATFORM</span>
          </div>

          {/* H1 Headline — Clean, solid typography */}
          <h1
            id="hero-title"
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.08] max-w-4xl"
          >
            Turn Regulatory Complexity{" "}
            <span className="text-primary">
              Into Compliance Clarity.
            </span>
          </h1>

          {/* Subhead */}
          <p className="mt-6 text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl text-center">
            LexisGraph connects regulations, requirements, policies, evidence, findings, and remediation — so your compliance team works from a single source of truth instead of scattered documents.
          </p>

          {/* CTAs — Solid Enterprise Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3.5 mt-8 w-full sm:w-auto">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 text-base font-semibold bg-primary hover:bg-primary-hover text-primary-foreground border border-primary rounded-md transition-colors duration-150"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-medium text-foreground border border-border bg-card hover:bg-surface-elevated rounded-md transition-colors duration-150"
            >
              See How It Works
            </a>
          </div>

          {/* Trust microcopy */}
          <p className="mt-4 text-xs text-muted-foreground font-medium">
            No credit card required · Role-based access control · Organization-scoped data
          </p>

          {/* Interactive Knowledge Graph Terminal Mockup */}
          <div className="relative mt-12 w-full max-w-4xl">
            <div className="relative rounded-xl border border-border bg-card shadow-xl overflow-hidden transition-colors">
              {/* Window Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-elevated">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-destructive" />
                  <span className="w-3 h-3 rounded-full bg-warning" />
                  <span className="w-3 h-3 rounded-full bg-success" />
                  <span className="ml-2 text-xs text-muted-foreground font-mono">
                    LexisGraph — Connected Knowledge Graph
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Active Topology · 6 Connected Entities
                  </span>
                </div>
              </div>

              {/* Visual Connected Diagram */}
              <div className="p-4 sm:p-8 bg-card">
                <svg
                  viewBox="0 0 740 300"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-auto select-none"
                  aria-label="Connected Compliance Graph showing Regulation, Requirements, Policies, Evidence, Finding, Resolution"
                >
                  {/* Edges */}
                  <g className="opacity-70 dark:opacity-75">
                    <line x1="370" y1="46" x2="190" y2="126" stroke="currentColor" className="text-border" strokeWidth="1.75" strokeDasharray="4 3" />
                    <line x1="370" y1="46" x2="550" y2="126" stroke="currentColor" className="text-border" strokeWidth="1.75" strokeDasharray="4 3" />
                    <line x1="190" y1="126" x2="190" y2="210" stroke="currentColor" className="text-primary" strokeWidth="1.75" strokeDasharray="4 3" opacity="0.7" />
                    <line x1="550" y1="126" x2="550" y2="210" stroke="currentColor" className="text-warning" strokeWidth="1.75" strokeDasharray="4 3" opacity="0.75" />
                    <line x1="190" y1="126" x2="550" y2="210" stroke="currentColor" className="text-destructive" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.45" />
                    <line x1="190" y1="210" x2="370" y2="270" stroke="currentColor" className="text-success" strokeWidth="1.75" strokeDasharray="4 3" opacity="0.6" />
                    <line x1="550" y1="210" x2="370" y2="270" stroke="currentColor" className="text-success" strokeWidth="1.75" strokeDasharray="4 3" opacity="0.6" />
                  </g>

                  {/* Regulation (Top Center) - Primary */}
                  <g className="cursor-pointer group">
                    <rect
                      x="295"
                      y="24"
                      width="150"
                      height="42"
                      rx="8"
                      className="fill-primary/10 stroke-primary transition-colors"
                      strokeWidth="2"
                    />
                    <circle cx="318" cy="45" r="5" className="fill-primary" />
                    <text
                      x="375"
                      y="49"
                      textAnchor="middle"
                      className="fill-foreground font-bold"
                      fontSize="13"
                    >
                      Regulation
                    </text>
                  </g>

                  {/* Requirements (Mid Left) - Primary */}
                  <g className="cursor-pointer">
                    <rect
                      x="105"
                      y="105"
                      width="170"
                      height="42"
                      rx="8"
                      className="fill-primary/10 stroke-primary transition-colors"
                      strokeWidth="1.75"
                    />
                    <circle cx="128" cy="126" r="5" className="fill-primary" />
                    <text
                      x="195"
                      y="130"
                      textAnchor="middle"
                      className="fill-foreground font-semibold"
                      fontSize="13"
                    >
                      Requirements
                    </text>
                  </g>

                  {/* Policies (Mid Right) - Secondary Accent */}
                  <g className="cursor-pointer">
                    <rect
                      x="465"
                      y="105"
                      width="170"
                      height="42"
                      rx="8"
                      className="fill-secondary/10 stroke-secondary transition-colors"
                      strokeWidth="1.75"
                    />
                    <circle cx="488" cy="126" r="5" className="fill-secondary" />
                    <text
                      x="555"
                      y="130"
                      textAnchor="middle"
                      className="fill-foreground font-semibold"
                      fontSize="13"
                    >
                      Policies
                    </text>
                  </g>

                  {/* Evidence (Lower Left) - Primary */}
                  <g className="cursor-pointer">
                    <rect
                      x="115"
                      y="190"
                      width="150"
                      height="40"
                      rx="8"
                      className="fill-primary/10 stroke-primary transition-colors"
                      strokeWidth="1.75"
                    />
                    <circle cx="138" cy="210" r="4.5" className="fill-primary" />
                    <text
                      x="195"
                      y="214"
                      textAnchor="middle"
                      className="fill-foreground font-semibold"
                      fontSize="12.5"
                    >
                      Evidence
                    </text>
                  </g>

                  {/* Finding (Lower Right) - Warning */}
                  <g className="cursor-pointer">
                    <rect
                      x="475"
                      y="190"
                      width="150"
                      height="40"
                      rx="8"
                      className="fill-warning/10 stroke-warning transition-colors"
                      strokeWidth="1.75"
                    />
                    <circle cx="498" cy="210" r="4.5" className="fill-warning" />
                    <text
                      x="555"
                      y="214"
                      textAnchor="middle"
                      className="fill-foreground font-semibold"
                      fontSize="12.5"
                    >
                      Finding
                    </text>
                  </g>

                  {/* Resolution (Bottom Center) - Success */}
                  <g className="cursor-pointer">
                    <rect
                      x="295"
                      y="248"
                      width="150"
                      height="42"
                      rx="8"
                      className="fill-success/10 stroke-success transition-colors"
                      strokeWidth="2"
                    />
                    <circle cx="318" cy="269" r="5" className="fill-success" />
                    <text
                      x="375"
                      y="273"
                      textAnchor="middle"
                      className="fill-foreground font-bold"
                      fontSize="13"
                    >
                      Resolution
                    </text>
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* SECTION 2: THE CONTRAST: TRADITIONAL VS LEXISGRAPH                    */}
      {/* ==================================================================== */}
      <section
        id="contrast"
        aria-labelledby="contrast-title"
        className="relative py-24 px-4 sm:px-6 lg:px-8 bg-background border-t border-border transition-colors"
      >
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow & Titles */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
              THE DIFFERENCE
            </p>
            <h2
              id="contrast-title"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground"
            >
              More than a document repository.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
              Traditional approaches to compliance create information debt. LexisGraph creates information assets.
            </p>
          </div>

          {/* 2-Column Side-by-Side Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            {/* Left Card: TRADITIONAL APPROACH */}
            <div className="relative rounded-xl border border-destructive/30 bg-destructive/5 p-6 sm:p-8 shadow-xs flex flex-col justify-between transition-all">
              <div>
                <div className="pb-6 border-b border-destructive/20 mb-6">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 inline-block">
                    TRADITIONAL APPROACH
                  </span>
                  <p className="text-xs text-muted-foreground mt-2 font-medium">
                    Scattered spreadsheets, manual friction, and information debt.
                  </p>
                </div>

                <ul className="space-y-4" role="list">
                  {[
                    "Requirements tracked in spreadsheets across multiple files",
                    "Manual matching of policies to regulations",
                    "Evidence scattered in email threads and shared drives",
                    "Findings recorded in documents without structured workflow",
                    "Gap identification relies on individual expert memory",
                    "Audit prep takes days of manual reconciliation",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3.5">
                      <div className="text-destructive shrink-0 mt-0.5">
                        <XCircle className="w-5 h-5 stroke-[2]" />
                      </div>
                      <span className="text-sm text-foreground leading-snug">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-5 border-t border-destructive/20 flex items-center justify-between text-xs text-muted-foreground">
                <span>Result: Fragile & audit-vulnerable</span>
                <span className="text-destructive font-mono font-medium">Information Debt</span>
              </div>
            </div>

            {/* Right Card: LEXISGRAPH */}
            <div className="relative rounded-xl border border-primary/40 bg-primary/5 p-6 sm:p-8 shadow-xs flex flex-col justify-between transition-all">
              <div>
                <div className="pb-6 border-b border-primary/20 mb-6">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/30 inline-flex items-center gap-1.5 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    LEXISGRAPH
                  </span>
                  <p className="text-xs text-muted-foreground mt-2 font-medium">
                    Connected intelligence, continuous metrics, and verifiable clarity.
                  </p>
                </div>

                <ul className="space-y-4" role="list">
                  {[
                    "Single graph connects regulations, policies, and evidence",
                    "Structured analysis with coverage metrics and gap scoring",
                    "Evidence attached directly to the requirements it supports",
                    "Findings linked to requirements with assigned workflow",
                    "Systematic gap identification based on structured coverage data",
                    "Audit-ready exports with full traceability in minutes",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3.5">
                      <div className="text-success shrink-0 mt-0.5">
                        <CheckCircle2 className="w-5 h-5 stroke-[2]" />
                      </div>
                      <span className="text-sm text-foreground font-medium leading-snug">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-5 border-t border-primary/20 flex items-center justify-between text-xs text-muted-foreground">
                <span className="text-success font-medium">Result: Continuous audit readiness</span>
                <span className="text-primary font-mono font-semibold">Single Source of Truth</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* SECTION 3: HOW IT WORKS (UNIFIED 4-STEP PIPELINE)                     */}
      {/* ==================================================================== */}
      <section
        id="how-it-works"
        aria-labelledby="how-it-works-title"
        className="relative py-24 px-4 sm:px-6 lg:px-8 bg-background border-t border-border transition-colors"
      >
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow & Title */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
              HOW IT WORKS
            </p>
            <h2
              id="how-it-works-title"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground"
            >
              Four steps from chaos to clarity.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
              LexisGraph provides a structured path through every phase of the compliance lifecycle.
            </p>
          </div>

          {/* Responsive 4-Step Horizontal Stepper (1 -> 4) */}
          <div className="relative">
            {/* Horizontal Line on Desktop */}
            <div
              aria-hidden="true"
              className="hidden lg:block absolute top-[2.25rem] left-16 right-16 h-px bg-border z-0"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
              {[
                {
                  step: "01",
                  title: "Connect",
                  description:
                    "Import regulatory frameworks, internal policies, and supporting documents. LexisGraph maps relationships automatically.",
                  icon: FolderInput,
                },
                {
                  step: "02",
                  title: "Analyze",
                  description:
                    "Run compliance analyses to measure coverage. Understand exactly where requirements are met, partially addressed, or missing.",
                  icon: BarChart3,
                },
                {
                  step: "03",
                  title: "Identify",
                  description:
                    "Surface findings with full traceability. Each finding links back to the specific requirement and policy gap that triggered it.",
                  icon: Search,
                },
                {
                  step: "04",
                  title: "Resolve",
                  description:
                    "Assign remediations, track progress, and collect resolution evidence — all within a single auditable workflow.",
                  icon: ShieldCheck,
                },
              ].map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.step}
                    className="group relative rounded-xl border border-border bg-card p-6 flex flex-col justify-between shadow-xs transition-colors duration-150 hover:border-primary/50 hover:bg-surface-elevated"
                  >
                    <div>
                      {/* Top Step Number Badge & Icon */}
                      <div className="flex items-center justify-between mb-6">
                        <div className="w-12 h-12 rounded-lg bg-surface-elevated border border-border text-primary flex items-center justify-center font-mono font-bold text-base transition-colors">
                          {item.step}
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-surface-elevated text-muted-foreground flex items-center justify-center group-hover:text-primary transition-colors">
                          <IconComponent className="w-4 h-4" />
                        </div>
                      </div>

                      {/* Step Title */}
                      <h3 className="text-xl font-bold text-foreground mb-2.5">
                        {item.title}
                      </h3>

                      {/* Step Description */}
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                      <span>Step 0{idx + 1}</span>
                      <span className="text-primary font-medium">Traceable</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* SECTION 4: PLATFORM CAPABILITIES & LIVE INTERACTIVE PREVIEW           */}
      {/* ==================================================================== */}
      <section
        id="capabilities"
        aria-labelledby="capabilities-title"
        className="relative py-24 px-4 sm:px-6 lg:px-8 bg-background border-t border-border transition-colors"
      >
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow & Title */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
              CAPABILITIES
            </p>
            <h2
              id="capabilities-title"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground"
            >
              Everything compliance needs in one place.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
              Explore how LexisGraph unifies compliance analysis, evidence verification, knowledge graph exploration, and remediation.
            </p>
          </div>

          {/* Split Layout: Left Selector, Right Dynamic UI Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Interactive Selector List */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              {CAPABILITIES_LIST.map((item, idx) => {
                const isActive = activeCapIndex === idx;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveCapIndex(idx)}
                    className={`w-full text-left p-5 rounded-xl border transition-colors duration-150 relative overflow-hidden cursor-pointer ${
                      isActive
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-border bg-card hover:border-border-strong hover:bg-surface-elevated"
                    }`}
                  >
                    {/* Active Accent Bar */}
                    {isActive && (
                      <div
                        aria-hidden="true"
                        className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r"
                      />
                    )}

                    <div className="flex items-start gap-4">
                      <span
                        className={`text-xs font-mono font-bold px-2 py-1 rounded-md border ${
                          isActive
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-surface-elevated border-border text-muted-foreground"
                        }`}
                      >
                        {item.stepNum}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`text-base font-bold transition-colors ${
                            isActive ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {item.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {item.shortDesc}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Dynamic UI Screen Preview */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border bg-card shadow-xl p-6 sm:p-8 relative overflow-hidden min-h-[460px] flex flex-col justify-between transition-colors">
                {/* Window header */}
                <div className="flex items-center justify-between pb-4 border-b border-border mb-6">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-destructive" />
                    <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                    <span className="w-2.5 h-2.5 rounded-full bg-success" />
                    <span className="ml-2 text-xs font-mono text-muted-foreground">
                      LexisGraph Interactive Workspace
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-primary bg-surface-elevated border border-border px-2 py-0.5 rounded-md">
                    Active State {activeCapIndex + 1}
                  </span>
                </div>

                {/* State 1: GDPR Coverage Card */}
                {activeCapIndex === 0 && (
                  <div className="space-y-6 animate-in fade-in duration-150">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-lg font-bold text-foreground flex items-center gap-2">
                          <span>GDPR Coverage — Q3 2026</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-success/10 text-success border border-success/30">
                            Evaluated
                          </span>
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Coverage analysis across 97 regulatory requirements
                        </p>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        Confidence 98%
                      </span>
                    </div>

                    {/* Breakdown Metric Tiles: Covered: 72, Partial: 18, Gaps: 7 */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-xl border border-success/30 bg-success/10 text-center">
                        <span className="text-2xl font-black text-success block font-mono">
                          72
                        </span>
                        <span className="text-[11px] font-semibold text-success uppercase tracking-wider">
                          Covered
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl border border-warning/30 bg-warning/10 text-center">
                        <span className="text-2xl font-black text-warning block font-mono">
                          18
                        </span>
                        <span className="text-[11px] font-semibold text-warning uppercase tracking-wider">
                          Partial
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-center">
                        <span className="text-2xl font-black text-destructive block font-mono">
                          7
                        </span>
                        <span className="text-[11px] font-semibold text-destructive uppercase tracking-wider">
                          Gaps
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar (74.2%) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-foreground">Framework Coverage Score</span>
                        <span className="text-primary font-mono">74.2% Progress</span>
                      </div>
                      <div className="h-2.5 w-full bg-surface-elevated rounded-full overflow-hidden flex border border-border">
                        <div style={{ width: "74.2%" }} className="bg-success h-full" />
                        <div style={{ width: "18.5%" }} className="bg-warning h-full" />
                        <div style={{ width: "7.3%" }} className="bg-destructive h-full" />
                      </div>
                    </div>

                    {/* Evaluated Sample Requirements */}
                    <div className="border border-border rounded-xl divide-y divide-border bg-surface-elevated text-xs">
                      <div className="p-2.5 flex items-center justify-between">
                        <span className="text-foreground font-medium">Art. 25: Data Protection by Design & Default</span>
                        <span className="text-success font-mono font-semibold">Covered (100%)</span>
                      </div>
                      <div className="p-2.5 flex items-center justify-between">
                        <span className="text-foreground font-medium">Art. 30: Records of Processing Activities</span>
                        <span className="text-warning font-mono font-semibold">Partial (65%)</span>
                      </div>
                      <div className="p-2.5 flex items-center justify-between">
                        <span className="text-foreground font-medium">Art. 32: Security of Processing Measures</span>
                        <span className="text-destructive font-mono font-semibold">Gap Identified</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* State 2: Finding Ticket F-104 */}
                {activeCapIndex === 1 && (
                  <div className="space-y-5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-destructive/10 text-destructive border border-destructive/30">
                          Severity: High
                        </span>
                        <h4 className="text-base font-bold text-foreground">
                          Finding Ticket F-104
                        </h4>
                      </div>
                      <span className="text-xs font-mono text-warning bg-warning/10 px-2 py-0.5 rounded-md border border-warning/30">
                        Status: Open Review
                      </span>
                    </div>

                    {/* Gap Description Box */}
                    <div className="p-4 rounded-xl border border-border bg-surface-elevated space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-primary uppercase tracking-wider text-[11px]">
                          Regulation Article
                        </span>
                        <span className="text-muted-foreground font-mono">Article 17 (Right to Erasure) Gap</span>
                      </div>
                      <p className="text-foreground leading-relaxed font-medium">
                        Policy Retention Standard v1.8 does not define automated deletion triggers for orphaned user backups in third-party storage buckets.
                      </p>
                    </div>

                    {/* Assigned Owner & Metadata */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl border border-border bg-surface-elevated">
                        <span className="text-[11px] text-muted-foreground block mb-1">Assigned Owner</span>
                        <p className="font-semibold text-foreground">Elena Rostova (Lead Compliance)</p>
                      </div>
                      <div className="p-3 rounded-xl border border-border bg-surface-elevated">
                        <span className="text-[11px] text-muted-foreground block mb-1">Due Date</span>
                        <p className="font-semibold text-foreground">Nov 15, 2026 (7 days remaining)</p>
                      </div>
                    </div>

                    {/* Evidence Attachment Links */}
                    <div className="p-3 rounded-xl border border-border bg-surface-elevated text-xs flex items-center justify-between">
                      <span className="text-muted-foreground">Attached Evidence:</span>
                      <span className="text-primary font-mono text-[11px] font-medium">
                        backup-retention-audit.log (Verified)
                      </span>
                    </div>
                  </div>
                )}

                {/* State 3: Interactive Node-Link Compliance Graph Canvas */}
                {activeCapIndex === 2 && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-bold text-foreground">
                        Interactive Node-Link Compliance Graph
                      </h4>
                      <span className="text-xs font-mono text-success">
                        Click nodes to inspect
                      </span>
                    </div>

                    <div className="p-4 rounded-xl border border-border bg-surface-elevated">
                      {/* Node Link Visual */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                        <button
                          onClick={() => setSelectedGraphNode("reg")}
                          className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                            selectedGraphNode === "reg"
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card text-muted-foreground hover:bg-surface-elevated"
                          }`}
                        >
                          <span className="text-[10px] text-primary uppercase block font-mono">Node 1</span>
                          <span className="font-bold">Regulation</span>
                        </button>
                        <button
                          onClick={() => setSelectedGraphNode("req")}
                          className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                            selectedGraphNode === "req"
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card text-muted-foreground hover:bg-surface-elevated"
                          }`}
                        >
                          <span className="text-[10px] text-primary uppercase block font-mono">Node 2</span>
                          <span className="font-bold">Requirement</span>
                        </button>
                        <button
                          onClick={() => setSelectedGraphNode("pol")}
                          className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                            selectedGraphNode === "pol"
                              ? "border-secondary bg-secondary/10 text-secondary"
                              : "border-border bg-card text-muted-foreground hover:bg-surface-elevated"
                          }`}
                        >
                          <span className="text-[10px] text-secondary uppercase block font-mono">Node 3</span>
                          <span className="font-bold">Policy</span>
                        </button>
                        <button
                          onClick={() => setSelectedGraphNode("fnd")}
                          className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                            selectedGraphNode === "fnd"
                              ? "border-warning bg-warning/10 text-warning"
                              : "border-border bg-card text-muted-foreground hover:bg-surface-elevated"
                          }`}
                        >
                          <span className="text-[10px] text-warning uppercase block font-mono">Node 4</span>
                          <span className="font-bold">Finding</span>
                        </button>
                      </div>

                      {/* Selected Node Inspection Details */}
                      <div className="mt-4 p-3.5 rounded-lg border border-border bg-card font-mono text-xs text-foreground">
                        {selectedGraphNode === "reg" && (
                          <p>
                            <span className="text-primary font-bold">INSPECTION:</span> EU GDPR (Framework ID: #REG-001) · 97 Total Articles · 12 Mapped Policies
                          </p>
                        )}
                        {selectedGraphNode === "req" && (
                          <p>
                            <span className="text-primary font-bold">INSPECTION:</span> Art. 17 Clause 2 · Right to Erasure in Distributed Storage
                          </p>
                        )}
                        {selectedGraphNode === "pol" && (
                          <p>
                            <span className="text-secondary font-bold">INSPECTION:</span> Policy DOC-RET-2026 §4.2 · Data Retention & Purge Protocol
                          </p>
                        )}
                        {selectedGraphNode === "fnd" && (
                          <p>
                            <span className="text-warning font-bold">INSPECTION:</span> Gap F-104 · Retention Window Exceeded in Cold Storage
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* State 4: AI-Assisted Mapping */}
                {activeCapIndex === 3 && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <h4 className="text-base font-bold text-foreground">
                          AI-Assisted Mapping Recommendation
                        </h4>
                      </div>
                      <span className="text-xs font-mono text-primary bg-surface-elevated border border-border px-2 py-0.5 rounded-md">
                        96% Match
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-border bg-surface-elevated space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-primary block font-mono">
                        Matched Policy Clause
                      </span>
                      <p className="text-xs text-foreground italic leading-relaxed bg-card p-3 rounded-lg border border-border">
                        "All symmetric encryption keys in the primary cryptographic envelope must undergo automated rotation at 90-day intervals, recorded via centralized audit telemetry."
                      </p>
                    </div>

                    <div className="p-3 rounded-xl border border-border bg-surface-elevated space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground font-medium">Standard Benchmark</span>
                        <span className="text-foreground font-mono">NIST SP 800-57 Part 1 Rev. 5</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground font-medium">Audit Impact</span>
                        <span className="text-success font-medium">Closes Gap F-104 completely</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button className="flex-1 py-2.5 px-4 rounded-md bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs border border-primary transition-colors flex items-center justify-center gap-2 cursor-pointer">
                        <span>Accept & Apply Mapping</span>
                      </button>
                      <button className="py-2.5 px-4 rounded-md border border-border bg-card text-foreground hover:bg-surface-elevated font-semibold text-xs transition-colors cursor-pointer">
                        Inspect Evidence
                      </button>
                    </div>
                  </div>
                )}

                {/* Footer status bar */}
                <div className="pt-4 border-t border-border mt-6 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Production-grade compliance telemetry</span>
                  <span className="text-muted-foreground font-mono">Real-time sync</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* SECTION 5: ENTERPRISE SECURITY & GOVERNANCE STRIP                    */}
      {/* ==================================================================== */}
      <section
        id="security"
        aria-labelledby="security-title"
        className="relative py-24 px-4 sm:px-6 lg:px-8 bg-background border-t border-border transition-colors"
      >
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow & Title */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
              SECURITY & CONTROL
            </p>
            <h2
              id="security-title"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground"
            >
              Your data stays yours.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
              Built with data isolation, role-based access, and full auditability as first-class primitives.
            </p>
          </div>

          {/* 3 Clean Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Organization Isolation */}
            <div className="group rounded-xl border border-border bg-card p-6 sm:p-7 flex flex-col justify-between shadow-xs transition-colors duration-150 hover:border-primary/40 hover:bg-surface-elevated">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-lg bg-surface-elevated border border-border text-primary flex items-center justify-center transition-colors">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-surface-elevated border border-border text-muted-foreground">
                    Tenant Scoped
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2.5">
                  Organization Isolation
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Strict multi-tenant boundaries and scoped storage. Customer data and embeddings never cross organization borders or train foundation models.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border flex items-center text-xs font-mono text-muted-foreground">
                <span>Cryptographically Isolated</span>
              </div>
            </div>

            {/* Card 2: Granular RBAC */}
            <div className="group rounded-xl border border-border bg-card p-6 sm:p-7 flex flex-col justify-between shadow-xs transition-colors duration-150 hover:border-primary/40 hover:bg-surface-elevated">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-lg bg-surface-elevated border border-border text-secondary flex items-center justify-center transition-colors">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-surface-elevated border border-border text-muted-foreground">
                    4 Roles
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2.5">
                  Granular RBAC
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Pre-configured roles for Admins, Analysts, Reviewers, and Viewers ensure compliant separation of duties and governed access across teams.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border flex items-center text-xs font-mono text-muted-foreground">
                <span>Role Enforcement</span>
              </div>
            </div>

            {/* Card 3: Immutable Audit Trails */}
            <div className="group rounded-xl border border-border bg-card p-6 sm:p-7 flex flex-col justify-between shadow-xs transition-colors duration-150 hover:border-primary/40 hover:bg-surface-elevated">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-lg bg-surface-elevated border border-border text-success flex items-center justify-center transition-colors">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-surface-elevated border border-border text-muted-foreground">
                    Immutable
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2.5">
                  Immutable Audit Trails
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Full event logging with timestamps and user attribution. One-click PDF/CSV reports ready for external regulatory examination.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border flex items-center text-xs font-mono text-muted-foreground">
                <span>UTC Timestamps</span>
              </div>
            </div>
          </div>

          {/* CTA Link to /security */}
          <div className="mt-12 text-center">
            <Link
              href="/security"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-hover transition-colors group cursor-pointer"
            >
              <span>Read our Security Whitepaper & RBAC Documentation</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* SECTION 6: FINAL CALL-TO-ACTION & FOOTER                              */}
      {/* ==================================================================== */}
      <section
        id="cta"
        aria-labelledby="final-cta-title"
        className="relative py-20 px-4 sm:px-6 lg:px-8 bg-background border-t border-border transition-colors"
      >
        <div className="max-w-5xl mx-auto">
          {/* CTA Banner: Solid enterprise card */}
          <div className="relative rounded-xl border border-border bg-card p-8 sm:p-14 text-center overflow-hidden shadow-xl">
            <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
              <h2
                id="final-cta-title"
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-tight"
              >
                Build a clearer path from regulation to resolution.
              </h2>
              <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">
                Join modern compliance teams replacing spreadsheet chaos with connected intelligence.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                <Link
                  href="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 text-base font-semibold bg-primary hover:bg-primary-hover text-primary-foreground border border-primary rounded-md transition-colors duration-150"
                >
                  <span>Get Started →</span>
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 text-base font-medium text-foreground border border-border bg-surface-elevated hover:bg-card rounded-md transition-colors duration-150"
                >
                  Sign In
                </Link>
              </div>

              <p className="mt-4 text-xs text-muted-foreground font-medium">
                No credit card required · Instant organization provisioning
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Standard 4-Column SaaS Footer */}
      <footer className="border-t border-border bg-card text-muted-foreground py-16 px-4 sm:px-6 lg:px-8 transition-colors">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
            {/* Brand Column */}
            <div className="col-span-2 md:col-span-1 flex flex-col gap-4">
              <Link href="/" className="flex items-center gap-2.5 group select-none">
                <BrandLogo size={32} />
                <span className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  LexisGraph
                </span>
              </Link>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Compliance intelligence connecting regulations, policies, evidence, and remediation in one single source of truth.
              </p>
            </div>

            {/* Column 1: Product */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Product
              </h3>
              <ul className="flex flex-col gap-2.5" role="list">
                <li>
                  <a href="#capabilities" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Compliance Analysis
                  </a>
                </li>
                <li>
                  <a href="#capabilities" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Knowledge Graph
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Evidence Tracker
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Remediation Workflow
                  </a>
                </li>
                <li>
                  <Link href="/ai-assistant" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    AI Assistant
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 2: Company */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Company
              </h3>
              <ul className="flex flex-col gap-2.5" role="list">
                <li>
                  <a href="#hero" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    About LexisGraph
                  </a>
                </li>
                <li>
                  <Link href="/security" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Security & Trust
                  </Link>
                </li>
                <li>
                  <a href="#security" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Governance Model
                  </a>
                </li>
                <li>
                  <a href="#hero" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Careers
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3: Resources */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Resources
              </h3>
              <ul className="flex flex-col gap-2.5" role="list">
                <li>
                  <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Documentation
                  </Link>
                </li>
                <li>
                  <a href="#how-it-works" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Regulatory Guides
                  </a>
                </li>
                <li>
                  <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    API Reference
                  </Link>
                </li>
                <li>
                  <Link href="/security" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Security Whitepaper
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 4: Legal */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Legal
              </h3>
              <ul className="flex flex-col gap-2.5" role="list">
                <li>
                  <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Cookie Settings
                  </a>
                </li>
                <li>
                  <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Compliance Disclosures
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="mt-14 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} LexisGraph Inc. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-muted-foreground">Systems Operational</span>
              </div>
              <span>·</span>
              <span>Enterprise Compliance Platform</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
