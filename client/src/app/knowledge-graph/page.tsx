"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Layers,
  LogOut,
  Building2,
  FileText,
  FileCheck,
  Search,
  Filter,
  RefreshCw,
  Network,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Database,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

function KnowledgeGraphExplorerContent() {
  const { logout } = useAuth();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "document" | "policy" | "regulation">("all");
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    type: "Document" | "Policy" | "Regulation";
    title: string;
    status: string;
    details: string;
  } | null>(null);

  // Mock graph nodes for visual exploration
  const graphNodes = [
    { id: "DOC-101", type: "Document", title: "Global Information Security Policy 2026", status: "Indexed", details: "Internal policy document covering data protection, access controls, and retention rules." },
    { id: "POL-042", type: "Policy", title: "Access Control & Authentication Standard", status: "Mapped", details: "Derived policy clause requiring multi-factor authentication for administrative access." },
    { id: "REG-EU01", type: "Regulation", title: "EU GDPR Article 32 - Security of Processing", status: "Compliant", details: "European regulation mandating technical and organizational measures to ensure security." },
    { id: "DOC-102", type: "Document", title: "Corporate Governance & Ethics Framework", status: "Indexed", details: "Enterprise governance guidelines for compliance reporting and board oversight." },
    { id: "POL-088", type: "Policy", title: "Third-Party Risk Management Policy", status: "Needs Review", details: "Internal policy requiring annual vendor security audits and SOC 2 verification." },
    { id: "REG-SOC2", type: "Regulation", title: "SOC 2 Type II Security Criteria CC6.1", status: "Gap Identified", details: "Trust Services Criteria governing logical and physical access security controls." },
  ];

  const filteredNodes = graphNodes.filter((node) => {
    const matchesSearch = node.title.toLowerCase().includes(searchQuery.toLowerCase()) || node.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || node.type.toLowerCase() === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <div
              className="flex items-center gap-2 cursor-pointer shrink-0"
              onClick={() => router.push("/dashboard")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-sm shadow-indigo-600/25">
                <Layers className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold tracking-tight text-foreground">
                LexisGraph
              </span>
            </div>

            <div className="hidden md:block h-5 w-px bg-border" />

            <nav className="hidden md:flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/dashboard")}
              >
                Dashboard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/organizations")}
              >
                <Building2 className="h-3.5 w-3.5" />
                Organizations
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => router.push("/documents")}
              >
                <FileText className="h-3.5 w-3.5" />
                Documents
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs font-semibold text-foreground"
                onClick={() => router.push("/knowledge-graph")}
              >
                <Network className="h-3.5 w-3.5" />
                Knowledge Graph
              </Button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard")}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Dashboard
              </Button>
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Knowledge Graph</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl flex items-center gap-2">
              <Network className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              Knowledge Graph Explorer
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Interactive visualization of internal policy documents, extracted clauses, and global regulatory mappings.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              Rebuild Graph
            </Button>
          </div>
        </div>

        {/* 1. Graph Statistics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Graph Nodes</p>
            <p className="text-2xl font-mono font-bold text-foreground mt-1">24</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Documents & Regulations</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Connected Edges</p>
            <p className="text-2xl font-mono font-bold text-indigo-600 dark:text-indigo-400 mt-1">42</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Semantic Relationships</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mapping Health</p>
            <p className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">98.4%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Relationship Accuracy</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">GraphRAG Sync</p>
            <p className="text-2xl font-mono font-bold text-foreground mt-1">Active</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Ready for Retrieval</p>
          </Card>
        </div>

        {/* 2. Controls & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 border border-border/40 p-3 rounded-xl">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search graph nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
            <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
              <Filter className="h-3.5 w-3.5" /> Filter:
            </span>
            {(["all", "document", "policy", "regulation"] as const).map((t) => (
              <Button
                key={t}
                variant={filterType === t ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs capitalize px-2.5"
                onClick={() => setFilterType(t)}
              >
                {t}
              </Button>
            ))}
          </div>
        </div>

        {/* 3. Interactive Relationship Visualization & Node Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Interactive Node Flow Diagram (2/3 width) */}
          <Card className="lg:col-span-2 flex flex-col">
            <CardHeader className="py-3 px-5 border-b border-border/40 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Network className="h-4 w-4 text-indigo-500" />
                Document ➔ Policy ➔ Regulation Flow
              </CardTitle>
              <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold">
                GraphRAG Active
              </span>
            </CardHeader>

            <CardContent className="p-5 flex-1 space-y-4">
              {/* Visual Flow diagram */}
              <div className="rounded-xl border border-border/60 bg-muted/10 p-6 flex flex-col items-center justify-center space-y-6 min-h-[300px]">
                <p className="text-xs text-muted-foreground font-mono text-center">
                  Click any node below to inspect graph lineage & compliance details.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-2xl">
                  {/* Column 1: Document */}
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      1. Documents
                    </span>
                    {filteredNodes.filter((n) => n.type === "Document").map((node) => (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border text-xs transition-all cursor-pointer space-y-1",
                          selectedNode?.id === node.id
                            ? "border-indigo-600 bg-indigo-500/10 shadow-sm"
                            : "border-border/60 bg-card hover:border-indigo-300 dark:hover:border-indigo-700"
                        )}
                      >
                        <span className="font-mono text-[9px] font-semibold text-indigo-600 dark:text-indigo-400 block">
                          {node.id}
                        </span>
                        <span className="font-medium text-foreground line-clamp-2 block">
                          {node.title}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Column 2: Policy */}
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      2. Policies
                    </span>
                    {filteredNodes.filter((n) => n.type === "Policy").map((node) => (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border text-xs transition-all cursor-pointer space-y-1",
                          selectedNode?.id === node.id
                            ? "border-violet-600 bg-violet-500/10 shadow-sm"
                            : "border-border/60 bg-card hover:border-violet-300 dark:hover:border-violet-700"
                        )}
                      >
                        <span className="font-mono text-[9px] font-semibold text-violet-600 dark:text-violet-400 block">
                          {node.id}
                        </span>
                        <span className="font-medium text-foreground line-clamp-2 block">
                          {node.title}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Column 3: Regulation */}
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      3. Regulations
                    </span>
                    {filteredNodes.filter((n) => n.type === "Regulation").map((node) => (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border text-xs transition-all cursor-pointer space-y-1",
                          selectedNode?.id === node.id
                            ? "border-emerald-600 bg-emerald-500/10 shadow-sm"
                            : "border-border/60 bg-card hover:border-emerald-300 dark:hover:border-emerald-700"
                        )}
                      >
                        <span className="font-mono text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                          {node.id}
                        </span>
                        <span className="font-medium text-foreground line-clamp-2 block">
                          {node.title}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Node Detail & Debugging Sidebar (1/3 width) */}
          <Card className="lg:col-span-1 flex flex-col justify-between">
            <CardHeader className="py-3 px-5 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Node Inspector
              </CardTitle>
            </CardHeader>

            <CardContent className="p-5 flex-1 space-y-4">
              {selectedNode ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
                      {selectedNode.type} Node
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-muted/40">
                      {selectedNode.id}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-foreground leading-snug">
                    {selectedNode.title}
                  </h4>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {selectedNode.details}
                  </p>

                  <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Mapping Status
                    </p>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{selectedNode.status}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-12 space-y-2 text-muted-foreground">
                  <Database className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-xs font-medium">Select a node from the graph to inspect lineage & rules.</p>
                </div>
              )}

              {/* GraphRAG Debugging info */}
              <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-2 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Terminal className="h-3 w-3 text-primary" />
                  GraphRAG Context
                </p>
                <div className="font-mono text-[10px] text-muted-foreground space-y-1">
                  <p>• Vector Index: cosine-distance</p>
                  <p>• Knowledge Graph: Cypher 4.4</p>
                  <p>• Pipeline: Hybrid Graph + RAG</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function KnowledgeGraphPage() {
  return (
    <ProtectedRoute>
      <KnowledgeGraphExplorerContent />
    </ProtectedRoute>
  );
}
