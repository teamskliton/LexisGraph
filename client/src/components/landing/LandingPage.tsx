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
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 selection:bg-blue-600 selection:text-white font-sans antialiased overflow-x-hidden transition-colors duration-200">
      {/* ==================================================================== */}
      {/* 1. STICKY NAVBAR                                                     */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800/80 bg-white/85 dark:bg-[#0B0F19]/85 backdrop-blur-xl transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo with Node Icon */}
          <Link
            href="/"
            className="flex items-center gap-2.5 select-none group focus:outline-none"
            aria-label="LexisGraph Home"
          >
            <div className="relative flex items-center justify-center">
              <BrandLogo size={30} rounded="rounded-lg" />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-blue-600 border border-white dark:border-slate-900 flex items-center justify-center text-[8px] text-white">
                <Boxes className="w-2 h-2" />
              </div>
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              LexisGraph
            </span>
          </Link>

          {/* Nav links (Desktop) */}
          <nav className="hidden md:flex items-center gap-1.5" aria-label="Main Navigation">
            <a
              href="#hero"
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 rounded-lg transition-colors"
            >
              Product
            </a>
            <a
              href="#how-it-works"
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 rounded-lg transition-colors"
            >
              How It Works
            </a>
            <a
              href="#capabilities"
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 rounded-lg transition-colors"
            >
              Capabilities
            </a>
            <a
              href="#security"
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 rounded-lg transition-colors"
            >
              Security
            </a>
            <a
              href="#contrast"
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 rounded-lg transition-colors"
            >
              About
            </a>
          </nav>

          {/* Right Controls: Theme Toggle, Sign In, Get Started */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60" />
            <Link
              href="/login"
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full shadow-md shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger button */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60" />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60 focus:outline-none"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] px-4 pt-2 pb-5 space-y-2">
            <a
              href="#hero"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg"
            >
              Product
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg"
            >
              How It Works
            </a>
            <a
              href="#capabilities"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg"
            >
              Capabilities
            </a>
            <a
              href="#security"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg"
            >
              Security
            </a>
            <a
              href="#contrast"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg"
            >
              About
            </a>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <Link
                href="/login"
                className="flex-1 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="flex-1 py-2 text-center text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md"
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
        className="relative pt-20 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden bg-slate-50 dark:bg-[#09090B] transition-colors"
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

        {/* Ambient radial glow */}
        <div
          aria-hidden="true"
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] sm:w-[950px] h-[450px] bg-gradient-to-tr from-blue-400/15 via-indigo-400/10 to-teal-400/10 dark:from-blue-600/20 dark:via-indigo-600/15 dark:to-teal-400/10 blur-[140px] pointer-events-none rounded-full z-0"
        />

        <div className="relative z-10 max-w-5xl mx-auto flex flex-col items-center text-center">
          {/* Badge Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold tracking-wider uppercase mb-6 backdrop-blur-md shadow-xs">
            <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse" />
            <span>COMPLIANCE INTELLIGENCE PLATFORM</span>
          </div>

          {/* H1 Headline */}
          <h1
            id="hero-title"
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.08] max-w-4xl"
          >
            Turn Regulatory Complexity{" "}
            <span className="bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 dark:from-blue-400 dark:via-sky-300 dark:to-indigo-400 bg-clip-text text-transparent">
              Into Compliance Clarity.
            </span>
          </h1>

          {/* Subhead */}
          <p className="mt-6 text-base sm:text-lg md:text-xl text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl text-center">
            LexisGraph connects regulations, requirements, policies, evidence, findings, and remediation — so your compliance team works from a single source of truth instead of scattered documents.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3.5 mt-8 w-full sm:w-auto">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 text-base font-semibold bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white rounded-xl shadow-xs hover:shadow-md backdrop-blur-md transition-all duration-200"
            >
              See How It Works
            </a>
          </div>

          {/* Trust microcopy */}
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-500 font-medium">
            No credit card required · Role-based access control · Organization-scoped data
          </p>

          {/* Interactive Knowledge Graph Terminal Mockup */}
          <div className="relative mt-12 w-full max-w-4xl">
            {/* Outer blur glow */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 via-indigo-500/15 to-sky-400/20 dark:from-blue-600/30 dark:via-indigo-600/20 dark:to-sky-500/30 rounded-2xl blur-lg opacity-60" />

            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/90 shadow-xl dark:shadow-2xl overflow-hidden backdrop-blur-xl transition-colors">
              {/* Window Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-900/60">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 text-xs text-slate-600 dark:text-slate-400 font-mono">
                    LexisGraph — Connected Knowledge Graph
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Active Topology · 6 Connected Entities
                  </span>
                </div>
              </div>

              {/* Visual Connected Diagram */}
              <div className="p-4 sm:p-8 bg-slate-50/30 dark:bg-transparent">
                <svg
                  viewBox="0 0 740 300"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-auto select-none"
                  aria-label="Connected Compliance Graph showing Regulation, Requirements, Policies, Evidence, Finding, Resolution"
                >
                  <defs>
                    <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.75" />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity="0.45" />
                    </linearGradient>
                    <linearGradient id="warnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.75" />
                      <stop offset="100%" stopColor="#10B981" stopOpacity="0.65" />
                    </linearGradient>
                  </defs>

                  {/* Edges */}
                  <g className="opacity-50 dark:opacity-65">
                    <line x1="370" y1="46" x2="190" y2="126" stroke="url(#edgeGrad)" strokeWidth="1.75" strokeDasharray="4 3" />
                    <line x1="370" y1="46" x2="550" y2="126" stroke="url(#edgeGrad)" strokeWidth="1.75" strokeDasharray="4 3" />
                    <line x1="190" y1="126" x2="190" y2="210" stroke="#3B82F6" strokeWidth="1.75" strokeDasharray="4 3" opacity="0.7" />
                    <line x1="550" y1="126" x2="550" y2="210" stroke="#F59E0B" strokeWidth="1.75" strokeDasharray="4 3" opacity="0.75" />
                    <line x1="190" y1="126" x2="550" y2="210" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.45" />
                    <line x1="190" y1="210" x2="370" y2="270" stroke="url(#warnGrad)" strokeWidth="1.75" strokeDasharray="4 3" />
                    <line x1="550" y1="210" x2="370" y2="270" stroke="url(#warnGrad)" strokeWidth="1.75" strokeDasharray="4 3" />
                  </g>

                  {/* Regulation (Top Center) - Blue */}
                  <g className="cursor-pointer group">
                    <rect
                      x="295"
                      y="24"
                      width="150"
                      height="42"
                      rx="21"
                      className="fill-blue-50 dark:fill-slate-800 stroke-blue-600 dark:stroke-blue-500 transition-colors"
                      strokeWidth="2"
                    />
                    <circle cx="318" cy="45" r="5" className="fill-blue-600 dark:fill-blue-400" />
                    <text
                      x="375"
                      y="49"
                      textAnchor="middle"
                      className="fill-blue-950 dark:fill-white font-bold"
                      fontSize="13"
                    >
                      Regulation
                    </text>
                  </g>

                  {/* Requirements (Mid Left) - Sky/Blue */}
                  <g className="cursor-pointer">
                    <rect
                      x="105"
                      y="105"
                      width="170"
                      height="42"
                      rx="21"
                      className="fill-sky-50 dark:fill-slate-800 stroke-sky-500 dark:stroke-sky-400 transition-colors"
                      strokeWidth="1.75"
                    />
                    <circle cx="128" cy="126" r="5" className="fill-sky-500 dark:fill-sky-400" />
                    <text
                      x="195"
                      y="130"
                      textAnchor="middle"
                      className="fill-sky-950 dark:fill-slate-200 font-semibold"
                      fontSize="13"
                    >
                      Requirements
                    </text>
                  </g>

                  {/* Policies (Mid Right) - Purple/Indigo */}
                  <g className="cursor-pointer">
                    <rect
                      x="465"
                      y="105"
                      width="170"
                      height="42"
                      rx="21"
                      className="fill-indigo-50 dark:fill-slate-800 stroke-indigo-500 dark:stroke-indigo-400 transition-colors"
                      strokeWidth="1.75"
                    />
                    <circle cx="488" cy="126" r="5" className="fill-indigo-500 dark:fill-indigo-400" />
                    <text
                      x="555"
                      y="130"
                      textAnchor="middle"
                      className="fill-indigo-950 dark:fill-slate-200 font-semibold"
                      fontSize="13"
                    >
                      Policies
                    </text>
                  </g>

                  {/* Evidence (Lower Left) - Cyan */}
                  <g className="cursor-pointer">
                    <rect
                      x="115"
                      y="190"
                      width="150"
                      height="40"
                      rx="20"
                      className="fill-cyan-50 dark:fill-slate-900 stroke-cyan-500 dark:stroke-sky-400 transition-colors"
                      strokeWidth="1.75"
                    />
                    <circle cx="138" cy="210" r="4.5" className="fill-cyan-500 dark:fill-sky-400" />
                    <text
                      x="195"
                      y="214"
                      textAnchor="middle"
                      className="fill-cyan-950 dark:fill-sky-200 font-semibold"
                      fontSize="12.5"
                    >
                      Evidence
                    </text>
                  </g>

                  {/* Finding (Lower Right) - Amber */}
                  <g className="cursor-pointer">
                    <rect
                      x="475"
                      y="190"
                      width="150"
                      height="40"
                      rx="20"
                      className="fill-amber-50 dark:fill-slate-900 stroke-amber-500 dark:stroke-amber-400 transition-colors"
                      strokeWidth="1.75"
                    />
                    <circle cx="498" cy="210" r="4.5" className="fill-amber-500 dark:fill-amber-400" />
                    <text
                      x="555"
                      y="214"
                      textAnchor="middle"
                      className="fill-amber-950 dark:fill-amber-200 font-semibold"
                      fontSize="12.5"
                    >
                      Finding
                    </text>
                  </g>

                  {/* Resolution (Bottom Center) - Emerald */}
                  <g className="cursor-pointer">
                    <rect
                      x="295"
                      y="248"
                      width="150"
                      height="42"
                      rx="21"
                      className="fill-emerald-50 dark:fill-emerald-950/80 stroke-emerald-600 dark:stroke-emerald-500 transition-colors"
                      strokeWidth="2"
                    />
                    <circle cx="318" cy="269" r="5" className="fill-emerald-600 dark:fill-emerald-400" />
                    <text
                      x="375"
                      y="273"
                      textAnchor="middle"
                      className="fill-emerald-950 dark:fill-emerald-100 font-bold"
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
        className="relative py-24 px-4 sm:px-6 lg:px-8 bg-white dark:bg-[#0B0F19] border-t border-slate-200 dark:border-slate-900 transition-colors"
      >
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow & Titles */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">
              THE DIFFERENCE
            </p>
            <h2
              id="contrast-title"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white"
            >
              More than a document repository.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
              Traditional approaches to compliance create information debt. LexisGraph creates information assets.
            </p>
          </div>

          {/* 2-Column Side-by-Side Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            {/* Left Card: TRADITIONAL APPROACH */}
            <div className="relative rounded-2xl border border-red-200 dark:border-slate-800 bg-red-50/40 dark:bg-slate-900/50 p-6 sm:p-8 backdrop-blur-md shadow-sm hover:shadow-md flex flex-col justify-between transition-all">
              <div>
                <div className="pb-6 border-b border-red-200/80 dark:border-slate-800/80 mb-6">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 inline-block">
                    TRADITIONAL APPROACH
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 font-medium">
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
                      <div className="text-rose-500 dark:text-rose-400 shrink-0 mt-0.5">
                        <XCircle className="w-5 h-5 stroke-[2]" />
                      </div>
                      <span className="text-sm text-slate-700 dark:text-slate-300 leading-snug">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-5 border-t border-red-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-500">
                <span>Result: Fragile & audit-vulnerable</span>
                <span className="text-rose-600 dark:text-rose-400/80 font-mono font-medium">Information Debt</span>
              </div>
            </div>

            {/* Right Card: LEXISGRAPH */}
            <div className="relative rounded-2xl border-2 border-blue-500/40 dark:border-blue-500/30 bg-blue-50/20 dark:bg-slate-900/80 p-6 sm:p-8 shadow-md hover:shadow-xl dark:shadow-2xl dark:shadow-blue-500/10 ring-1 ring-blue-500/20 backdrop-blur-xl flex flex-col justify-between transition-all">
              {/* Top glow accent */}
              <div
                aria-hidden="true"
                className="absolute -top-px left-8 right-8 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent"
              />

              <div>
                <div className="pb-6 border-b border-blue-200/60 dark:border-slate-800 mb-6">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/40 inline-flex items-center gap-1.5 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                    LEXISGRAPH
                  </span>
                  <p className="text-xs text-blue-900/80 dark:text-blue-200/80 mt-2 font-medium">
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
                      <div className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                        <CheckCircle2 className="w-5 h-5 stroke-[2]" />
                      </div>
                      <span className="text-sm text-slate-800 dark:text-slate-100 font-medium leading-snug">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-5 border-t border-blue-200/60 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Result: Continuous audit readiness</span>
                <span className="text-blue-600 dark:text-blue-300 font-mono font-semibold">Single Source of Truth</span>
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
        className="relative py-24 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-[#0B0F19] border-t border-slate-200 dark:border-slate-900 transition-colors"
      >
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow & Title */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">
              HOW IT WORKS
            </p>
            <h2
              id="how-it-works-title"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white"
            >
              Four steps from chaos to clarity.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
              LexisGraph provides a structured path through every phase of the compliance lifecycle.
            </p>
          </div>

          {/* Responsive 4-Step Horizontal Stepper (1 -> 4) */}
          <div className="relative">
            {/* Horizontal Line on Desktop */}
            <div
              aria-hidden="true"
              className="hidden lg:block absolute top-[2.25rem] left-16 right-16 h-0.5 bg-gradient-to-r from-blue-500/30 via-indigo-500/30 to-emerald-500/30 dark:from-blue-600/40 dark:via-indigo-500/40 dark:to-emerald-500/40 z-0"
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
                    className="group relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 backdrop-blur-md flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-400 dark:hover:border-blue-500/50 hover:bg-white dark:hover:bg-slate-900/90"
                  >
                    <div>
                      {/* Top Step Number Badge & Icon */}
                      <div className="flex items-center justify-between mb-6">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-gradient-to-br dark:from-blue-600/20 dark:to-indigo-600/20 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-mono font-bold text-base shadow-xs group-hover:scale-105 group-hover:border-blue-500 transition-all duration-200">
                          {item.step}
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 flex items-center justify-center group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                          <IconComponent className="w-4 h-4" />
                        </div>
                      </div>

                      {/* Step Title */}
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2.5">
                        {item.title}
                      </h3>

                      {/* Step Description */}
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-500">
                      <span>Step 0{idx + 1}</span>
                      <span className="text-blue-600 dark:text-blue-400/80 font-medium">Traceable</span>
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
        className="relative py-24 px-4 sm:px-6 lg:px-8 bg-white dark:bg-[#0B0F19] border-t border-slate-200 dark:border-slate-900 transition-colors"
      >
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow & Title */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">
              CAPABILITIES
            </p>
            <h2
              id="capabilities-title"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white"
            >
              Everything compliance needs in one place.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
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
                    className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 relative overflow-hidden cursor-pointer ${
                      isActive
                        ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/20 shadow-md dark:shadow-xl dark:shadow-blue-500/10"
                        : "border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/60 shadow-xs"
                    }`}
                  >
                    {/* Active Accent Bar */}
                    {isActive && (
                      <div
                        aria-hidden="true"
                        className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-blue-500 via-indigo-500 to-blue-600 rounded-r"
                      />
                    )}

                    <div className="flex items-start gap-4">
                      <span
                        className={`text-xs font-mono font-bold px-2 py-1 rounded-md border ${
                          isActive
                            ? "bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-500/20 dark:border-blue-500/40 dark:text-blue-300"
                            : "bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      >
                        {item.stepNum}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`text-base font-bold transition-colors ${
                            isActive ? "text-blue-950 dark:text-white" : "text-slate-800 dark:text-slate-200"
                          }`}
                        >
                          {item.title}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
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
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/90 shadow-xl dark:shadow-2xl p-6 sm:p-8 backdrop-blur-xl relative overflow-hidden min-h-[460px] flex flex-col justify-between transition-colors">
                {/* Window header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800/80 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    <span className="ml-2 text-xs font-mono text-slate-600 dark:text-slate-400">
                      LexisGraph Interactive Workspace
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 px-2 py-0.5 rounded">
                    Active State {activeCapIndex + 1}
                  </span>
                </div>

                {/* State 1: GDPR Coverage Card */}
                {activeCapIndex === 0 && (
                  <div className="space-y-6 animate-in fade-in duration-150">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>GDPR Coverage — Q3 2026</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                            Evaluated
                          </span>
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          Coverage analysis across 97 regulatory requirements
                        </p>
                      </div>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        Confidence 98%
                      </span>
                    </div>

                    {/* Breakdown Metric Tiles: Covered: 72, Partial: 18, Gaps: 7 */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 text-center">
                        <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400 block font-mono">
                          72
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                          Covered
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 text-center">
                        <span className="text-2xl font-black text-amber-700 dark:text-amber-400 block font-mono">
                          18
                        </span>
                        <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                          Partial
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-950/20 text-center">
                        <span className="text-2xl font-black text-rose-700 dark:text-rose-400 block font-mono">
                          7
                        </span>
                        <span className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider">
                          Gaps
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar (74.2%) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-700 dark:text-slate-300">Framework Coverage Score</span>
                        <span className="text-blue-600 dark:text-blue-400 font-mono">74.2% Progress</span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div style={{ width: "74.2%" }} className="bg-emerald-500 h-full" />
                        <div style={{ width: "18.5%" }} className="bg-amber-500 h-full" />
                        <div style={{ width: "7.3%" }} className="bg-rose-500 h-full" />
                      </div>
                    </div>

                    {/* Evaluated Sample Requirements */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 text-xs">
                      <div className="p-2.5 flex items-center justify-between">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Art. 25: Data Protection by Design & Default</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">Covered (100%)</span>
                      </div>
                      <div className="p-2.5 flex items-center justify-between">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Art. 30: Records of Processing Activities</span>
                        <span className="text-amber-600 dark:text-amber-400 font-mono font-semibold">Partial (65%)</span>
                      </div>
                      <div className="p-2.5 flex items-center justify-between">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Art. 32: Security of Processing Measures</span>
                        <span className="text-rose-600 dark:text-rose-400 font-mono font-semibold">Gap Identified</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* State 2: Finding Ticket F-104 */}
                {activeCapIndex === 1 && (
                  <div className="space-y-5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
                          Severity: High
                        </span>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white">
                          Finding Ticket F-104
                        </h4>
                      </div>
                      <span className="text-xs font-mono text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                        Status: Open Review
                      </span>
                    </div>

                    {/* Gap Description Box */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider text-[11px]">
                          Regulation Article
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 font-mono">Article 17 (Right to Erasure) Gap</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                        Policy Retention Standard v1.8 does not define automated deletion triggers for orphaned user backups in third-party storage buckets.
                      </p>
                    </div>

                    {/* Assigned Owner & Metadata */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Assigned Owner</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">Elena Rostova (Lead Compliance)</p>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Due Date</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">Nov 15, 2026 (7 days remaining)</p>
                      </div>
                    </div>

                    {/* Evidence Attachment Links */}
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/30 text-xs flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Attached Evidence:</span>
                      <span className="text-blue-600 dark:text-blue-400 font-mono text-[11px] font-medium">
                        backup-retention-audit.log (Verified)
                      </span>
                    </div>
                  </div>
                )}

                {/* State 3: Interactive Node-Link Compliance Graph Canvas */}
                {activeCapIndex === 2 && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        Interactive Node-Link Compliance Graph
                      </h4>
                      <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                        Click nodes to inspect
                      </span>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
                      {/* Node Link Visual */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                        <button
                          onClick={() => setSelectedGraphNode("reg")}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            selectedGraphNode === "reg"
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-md shadow-blue-500/20"
                              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                          }`}
                        >
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase block font-mono">Node 1</span>
                          <span className="font-bold">Regulation</span>
                        </button>
                        <button
                          onClick={() => setSelectedGraphNode("req")}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            selectedGraphNode === "req"
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-md shadow-indigo-500/20"
                              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                          }`}
                        >
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 uppercase block font-mono">Node 2</span>
                          <span className="font-bold">Requirement</span>
                        </button>
                        <button
                          onClick={() => setSelectedGraphNode("pol")}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            selectedGraphNode === "pol"
                              ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 shadow-md shadow-amber-500/20"
                              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                          }`}
                        >
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase block font-mono">Node 3</span>
                          <span className="font-bold">Policy</span>
                        </button>
                        <button
                          onClick={() => setSelectedGraphNode("fnd")}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            selectedGraphNode === "fnd"
                              ? "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 shadow-md shadow-rose-500/20"
                              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                          }`}
                        >
                          <span className="text-[10px] text-rose-600 dark:text-rose-400 uppercase block font-mono">Node 4</span>
                          <span className="font-bold">Finding</span>
                        </button>
                      </div>

                      {/* Selected Node Inspection Details */}
                      <div className="mt-4 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {selectedGraphNode === "reg" && (
                          <p>
                            <span className="text-blue-600 dark:text-blue-400 font-bold">INSPECTION:</span> EU GDPR (Framework ID: #REG-001) · 97 Total Articles · 12 Mapped Policies
                          </p>
                        )}
                        {selectedGraphNode === "req" && (
                          <p>
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold">INSPECTION:</span> Art. 17 Clause 2 · Right to Erasure in Distributed Storage
                          </p>
                        )}
                        {selectedGraphNode === "pol" && (
                          <p>
                            <span className="text-amber-600 dark:text-amber-400 font-bold">INSPECTION:</span> Policy DOC-RET-2026 §4.2 · Data Retention & Purge Protocol
                          </p>
                        )}
                        {selectedGraphNode === "fnd" && (
                          <p>
                            <span className="text-rose-600 dark:text-rose-400 font-bold">INSPECTION:</span> Gap F-104 · Retention Window Exceeded in Cold Storage
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
                        <Sparkles className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                        <h4 className="text-base font-bold text-slate-900 dark:text-white">
                          AI-Assisted Mapping Recommendation
                        </h4>
                      </div>
                      <span className="text-xs font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 px-2 py-0.5 rounded">
                        96% Match
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-950/15 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block font-mono">
                        Matched Policy Clause
                      </span>
                      <p className="text-xs text-slate-700 dark:text-slate-200 italic leading-relaxed bg-white dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        "All symmetric encryption keys in the primary cryptographic envelope must undergo automated rotation at 90-day intervals, recorded via centralized audit telemetry."
                      </p>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Standard Benchmark</span>
                        <span className="text-slate-800 dark:text-slate-200 font-mono">NIST SP 800-57 Part 1 Rev. 5</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Audit Impact</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Closes Gap F-104 completely</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm">
                        <span>Accept & Apply Mapping</span>
                      </button>
                      <button className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:text-white font-semibold text-xs transition-colors cursor-pointer">
                        Inspect Evidence
                      </button>
                    </div>
                  </div>
                )}

                {/* Footer status bar */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 mt-6 flex items-center justify-between text-xs text-slate-500 dark:text-slate-500">
                  <span>Production-grade compliance telemetry</span>
                  <span className="text-slate-600 dark:text-slate-400 font-mono">Real-time sync</span>
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
        className="relative py-24 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-[#0B0F19] border-t border-slate-200 dark:border-slate-900 transition-colors"
      >
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow & Title */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">
              SECURITY & CONTROL
            </p>
            <h2
              id="security-title"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white"
            >
              Your data stays yours.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
              Built with data isolation, role-based access, and full auditability as first-class primitives.
            </p>
          </div>

          {/* 3 Clean Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Organization Isolation */}
            <div className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 sm:p-7 backdrop-blur-md flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900/80">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-600/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 group-hover:border-blue-500/40 transition-all">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                    Tenant Scoped
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2.5">
                  Organization Isolation
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Strict multi-tenant boundaries and scoped storage. Customer data and embeddings never cross organization borders or train foundation models.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center text-xs font-mono text-slate-500 dark:text-slate-500">
                <span>Cryptographically Isolated</span>
              </div>
            </div>

            {/* Card 2: Granular RBAC */}
            <div className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 sm:p-7 backdrop-blur-md flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900/80">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-600/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 group-hover:border-indigo-500/40 transition-all">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                    4 Roles
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2.5">
                  Granular RBAC
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Pre-configured roles for Admins, Analysts, Reviewers, and Viewers ensure compliant separation of duties and governed access across teams.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center text-xs font-mono text-slate-500 dark:text-slate-500">
                <span>Role Enforcement</span>
              </div>
            </div>

            {/* Card 3: Immutable Audit Trails */}
            <div className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 sm:p-7 backdrop-blur-md flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900/80">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-600/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 group-hover:border-emerald-500/40 transition-all">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                    Immutable
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2.5">
                  Immutable Audit Trails
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Full event logging with timestamps and user attribution. One-click PDF/CSV reports ready for external regulatory examination.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center text-xs font-mono text-slate-500 dark:text-slate-500">
                <span>UTC Timestamps</span>
              </div>
            </div>
          </div>

          {/* CTA Link to /security */}
          <div className="mt-12 text-center">
            <Link
              href="/security"
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors group cursor-pointer"
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
        className="relative py-20 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-[#0B0F19] border-t border-slate-200 dark:border-slate-900 transition-colors"
      >
        <div className="max-w-5xl mx-auto">
          {/* CTA Banner: Crisp gradient in light mode, rich glowing neon in dark mode */}
          <div className="relative rounded-2xl border border-blue-500/30 dark:border-blue-500/20 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-900/40 dark:to-indigo-900/40 p-8 sm:p-14 text-center overflow-hidden shadow-xl dark:shadow-2xl">
            {/* Ambient inner glow */}
            <div
              aria-hidden="true"
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-r from-white/20 via-sky-300/20 to-blue-200/20 dark:from-blue-600/25 dark:via-indigo-600/20 dark:to-sky-400/20 blur-[90px] pointer-events-none rounded-full"
            />

            <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
              <h2
                id="final-cta-title"
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight"
              >
                Build a clearer path from regulation to resolution.
              </h2>
              <p className="mt-4 text-base sm:text-lg text-blue-100 dark:text-slate-300 leading-relaxed max-w-xl">
                Join modern compliance teams replacing spreadsheet chaos with connected intelligence.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                <Link
                  href="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 text-base font-semibold bg-white text-blue-600 hover:bg-blue-50 dark:bg-gradient-to-r dark:from-blue-600 dark:via-blue-500 dark:to-indigo-600 dark:hover:from-blue-500 dark:hover:to-indigo-500 dark:text-white rounded-xl shadow-lg shadow-black/10 dark:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  <span>Get Started →</span>
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 text-base font-medium text-white border border-white/30 bg-white/10 hover:bg-white/20 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:hover:border-slate-700 dark:text-slate-200 rounded-xl backdrop-blur-md transition-all duration-200"
                >
                  Sign In
                </Link>
              </div>

              <p className="mt-4 text-xs text-blue-100/90 dark:text-slate-400 font-medium">
                No credit card required · Instant organization provisioning
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Standard 4-Column SaaS Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 bg-slate-100 dark:bg-[#070A11] text-slate-600 dark:text-slate-400 py-16 px-4 sm:px-6 lg:px-8 transition-colors">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
            {/* Brand Column */}
            <div className="col-span-2 md:col-span-1 flex flex-col gap-4">
              <Link href="/" className="flex items-center gap-2.5 group select-none">
                <BrandLogo size={32} />
                <span className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  LexisGraph
                </span>
              </Link>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Compliance intelligence connecting regulations, policies, evidence, and remediation in one single source of truth.
              </p>
            </div>

            {/* Column 1: Product */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider">
                Product
              </h3>
              <ul className="flex flex-col gap-2.5" role="list">
                <li>
                  <a href="#capabilities" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Compliance Analysis
                  </a>
                </li>
                <li>
                  <a href="#capabilities" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Knowledge Graph
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Evidence Tracker
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Remediation Workflow
                  </a>
                </li>
                <li>
                  <Link href="/ai-assistant" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    AI Assistant
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 2: Company */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider">
                Company
              </h3>
              <ul className="flex flex-col gap-2.5" role="list">
                <li>
                  <a href="#hero" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    About LexisGraph
                  </a>
                </li>
                <li>
                  <Link href="/security" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Security & Trust
                  </Link>
                </li>
                <li>
                  <a href="#security" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Governance Model
                  </a>
                </li>
                <li>
                  <a href="#hero" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Careers
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3: Resources */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider">
                Resources
              </h3>
              <ul className="flex flex-col gap-2.5" role="list">
                <li>
                  <Link href="/dashboard" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Documentation
                  </Link>
                </li>
                <li>
                  <a href="#how-it-works" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Regulatory Guides
                  </a>
                </li>
                <li>
                  <Link href="/dashboard" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    API Reference
                  </Link>
                </li>
                <li>
                  <Link href="/security" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Security Whitepaper
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 4: Legal */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider">
                Legal
              </h3>
              <ul className="flex flex-col gap-2.5" role="list">
                <li>
                  <a href="#" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="#" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Cookie Settings
                  </a>
                </li>
                <li>
                  <a href="#" className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    Compliance Disclosures
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="mt-14 pt-8 border-t border-slate-200 dark:border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-500">
            <p>© {new Date().getFullYear()} LexisGraph Inc. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-600 dark:text-slate-400">Systems Operational</span>
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
