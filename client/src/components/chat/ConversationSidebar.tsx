"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  MessageSquare,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  Building2,
  ArrowLeft,
  LogOut,
  Layers,
  Pin,
  PinOff,
  Copy,
  Download,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Organization } from "@/services/api/organizations";

export interface SidebarConversation {
  id: string;
  title: string;
  organizationId?: string | null;
  isPinned?: boolean;
  isArchived?: boolean;
  messageCount?: number;
  updatedAt: string;
}

interface ConversationSidebarProps {
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
  onLogout: () => void;
  isMobileDrawer?: boolean;
}

export function ConversationSidebar({
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
  onLogout,
  isMobileDrawer = false,
}: ConversationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global Keyboard Shortcuts: Ctrl+K focus search, Ctrl+N new chat
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        onNewChat();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onNewChat]);

  const activeConversations = conversations.filter((c) => !c.isArchived);
  const filteredConversations = activeConversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedConversations = filteredConversations.filter((c) => c.isPinned);
  const recentConversations = filteredConversations.filter((c) => !c.isPinned);

  const startRename = (conv: SidebarConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
    setOpenMenuId(null);
  };

  const saveRename = (id: string, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (editingTitle.trim() && onRenameConversation) {
      onRenameConversation(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const renderConversationItem = (conv: SidebarConversation) => {
    const isActive = activeConvId === conv.id;
    const isEditing = editingId === conv.id;
    const isMenuOpen = openMenuId === conv.id;

    return (
      <div
        key={conv.id}
        onClick={() => {
          setOpenMenuId(null);
          onSelectConversation(conv.id);
        }}
        className={`group relative flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors text-xs ${
          isActive
            ? "bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 font-medium border border-indigo-500/20"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        }`}
      >
        <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-indigo-500" />

          {isEditing ? (
            <form onSubmit={(e) => saveRename(conv.id, e)} className="flex items-center gap-1 flex-1">
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="w-full px-1.5 py-0.5 text-xs bg-background border border-indigo-500 rounded text-foreground focus:outline-none"
                autoFocus
              />
              <button type="submit" className="text-emerald-500 hover:text-emerald-600 p-0.5">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingId(null);
                }}
                className="text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <div className="flex flex-col truncate">
              <span className="truncate flex items-center gap-1">
                {conv.isPinned && <Pin className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                <span className="truncate">{conv.title}</span>
              </span>
              <span className="text-[10px] text-muted-foreground/80 font-normal">
                {conv.messageCount ? `${conv.messageCount} msgs • ` : ""}{conv.updatedAt}
              </span>
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuId(isMenuOpen ? null : conv.id);
              }}
              className="p-1 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>

            {/* Quick Action Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 top-6 z-50 w-44 bg-popover border border-border rounded-xl shadow-lg p-1 text-xs text-foreground space-y-0.5 animate-in fade-in duration-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(null);
                    onTogglePinConversation && onTogglePinConversation(conv.id, !!conv.isPinned, e);
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-muted rounded-lg flex items-center gap-2"
                >
                  {conv.isPinned ? <PinOff className="h-3.5 w-3.5 text-amber-500" /> : <Pin className="h-3.5 w-3.5 text-amber-500" />}
                  <span>{conv.isPinned ? "Unpin Chat" : "Pin Chat"}</span>
                </button>

                <button
                  onClick={(e) => startRename(conv, e)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-muted rounded-lg flex items-center gap-2"
                >
                  <Edit2 className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Rename</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(null);
                    onDuplicateConversation && onDuplicateConversation(conv.id, e);
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-muted rounded-lg flex items-center gap-2"
                >
                  <Copy className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Duplicate</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(null);
                    onExportConversation && onExportConversation(conv.id, "markdown", e);
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-muted rounded-lg flex items-center gap-2"
                >
                  <Download className="h-3.5 w-3.5 text-sky-500" />
                  <span>Export Markdown</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(null);
                    onDeleteConversation(conv.id, e);
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-muted rounded-lg flex items-center gap-2 text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Archive / Delete</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`border-r border-border bg-card/60 flex flex-col shrink-0 h-full ${
        isMobileDrawer ? "w-full" : "w-80 hidden md:flex"
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/20">
            <Layers className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold tracking-tight text-foreground">LexisGraph AI</span>
        </div>
        <ThemeToggle />
      </div>

      {/* New Chat Button & Search */}
      <div className="p-3 space-y-2">
        <Button
          onClick={onNewChat}
          className="w-full flex items-center justify-between bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm text-xs font-semibold py-2"
        >
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            <span>New Legal Query</span>
          </div>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] bg-white/20 rounded">Ctrl+N</kbd>
        </Button>

        {/* Search Conversations Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search queries... (Ctrl+K)"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 rounded-md border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Active Organization Selector */}
      <div className="px-3 py-2 border-b border-border/50">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
          Active Organization
        </label>
        <div className="relative">
          <Building2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            disabled={isLoadingOrgs}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 rounded-md border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Conversation Thread History List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Pinned Section */}
        {pinnedConversations.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider px-2 flex items-center gap-1">
              <Pin className="h-3 w-3 fill-amber-500" />
              <span>Pinned ({pinnedConversations.length})</span>
            </span>
            {pinnedConversations.map(renderConversationItem)}
          </div>
        )}

        {/* Recent Section */}
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 block">
            Recent Chats ({recentConversations.length})
          </span>

          {filteredConversations.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">No matching conversations.</p>
          ) : (
            recentConversations.map(renderConversationItem)
          )}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="p-3 border-t border-border flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onNavigateDashboard}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
