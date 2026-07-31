"use client";

import React, { useState } from "react";
import {
  Menu,
  X,
  BookOpen,
  Wifi,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Organization } from "@/services/api/organizations";
import { ConversationSidebar, SidebarConversation } from "./ConversationSidebar";

interface ChatLayoutProps {
  children: React.ReactNode;
  activeConversationTitle?: string;
  isStreaming?: boolean;
  conversations: SidebarConversation[];
  activeConvId: string;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string, e: React.MouseEvent) => void;
  onRenameConversation?: (id: string, newTitle: string) => void;
  onTogglePinConversation?: (id: string, currentPinned: boolean, e: React.MouseEvent) => void;
  onDuplicateConversation?: (id: string, e: React.MouseEvent) => void;
  onExportConversation?: (id: string, format: "markdown" | "text", e: React.MouseEvent) => void;
  organizations: Organization[];
  selectedOrgId: string;
  setSelectedOrgId: (id: string) => void;
  isLoadingOrgs: boolean;
  onNavigateDashboard: () => void;
  onNavigateCompliance: () => void;
  onLogout: () => void;
}

export function ChatLayout({
  children,
  activeConversationTitle,
  isStreaming,
  conversations,
  activeConvId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  onTogglePinConversation,
  onDuplicateConversation,
  onExportConversation,
  organizations,
  selectedOrgId,
  setSelectedOrgId,
  isLoadingOrgs,
  onNavigateDashboard,
  onNavigateCompliance,
  onLogout,
}: ChatLayoutProps) {
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        activeConvId={activeConvId}
        onSelectConversation={(id) => {
          onSelectConversation(id);
          setIsMobileOpen(false);
        }}
        onNewChat={() => {
          onNewChat();
          setIsMobileOpen(false);
        }}
        onDeleteConversation={onDeleteConversation}
        onRenameConversation={onRenameConversation}
        onTogglePinConversation={onTogglePinConversation}
        onDuplicateConversation={onDuplicateConversation}
        onExportConversation={onExportConversation}
        organizations={organizations}
        selectedOrgId={selectedOrgId}
        setSelectedOrgId={setSelectedOrgId}
        isLoadingOrgs={isLoadingOrgs}
        onNavigateDashboard={onNavigateDashboard}
        onLogout={onLogout}
      />

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-black/60 backdrop-blur-sm">
          <div className="w-80 h-full bg-background relative shadow-2xl">
            <button
              onClick={() => setIsMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground z-10"
            >
              <X className="h-4 w-4" />
            </button>

            <ConversationSidebar
              isMobileDrawer
              conversations={conversations}
              activeConvId={activeConvId}
              onSelectConversation={(id) => {
                onSelectConversation(id);
                setIsMobileOpen(false);
              }}
              onNewChat={() => {
                onNewChat();
                setIsMobileOpen(false);
              }}
              onDeleteConversation={onDeleteConversation}
              onRenameConversation={onRenameConversation}
              onTogglePinConversation={onTogglePinConversation}
              onDuplicateConversation={onDuplicateConversation}
              onExportConversation={onExportConversation}
              organizations={organizations}
              selectedOrgId={selectedOrgId}
              setSelectedOrgId={setSelectedOrgId}
              isLoadingOrgs={isLoadingOrgs}
              onNavigateDashboard={onNavigateDashboard}
              onLogout={onLogout}
            />
          </div>
        </div>
      )}

      {/* Main Chat Container */}
      <main className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
        {/* Top Navigation Header */}
        <header className="h-14 border-b border-border px-4 flex items-center justify-between bg-card/40 backdrop-blur shrink-0 z-10">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div>
              <h1 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <span>{activeConversationTitle || "AI Legal Assistant"}</span>
                {isStreaming ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full font-medium border border-indigo-500/20 animate-pulse">
                    <Sparkles className="h-3 w-3" />
                    Streaming...
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full font-medium border border-indigo-500/20">
                    Hybrid GraphRAG
                  </span>
                )}
              </h1>
              <p className="text-[11px] text-muted-foreground hidden sm:flex items-center gap-2">
                <span>{selectedOrg ? `Org: ${selectedOrg.name}` : "LexisGraph AI"}</span>
                <span>•</span>
                <span className="flex items-center gap-1 text-emerald-500 font-medium">
                  <Wifi className="h-3 w-3" />
                  Connected
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateCompliance}
              className="text-xs gap-1.5 hidden sm:flex"
            >
              <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
              Compliance Engine
            </Button>
          </div>
        </header>

        {/* Content Body (ChatWindow + MessageInput) */}
        {children}
      </main>
    </div>
  );
}
