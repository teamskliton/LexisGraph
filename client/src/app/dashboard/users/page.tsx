'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { OrganizationSwitcher } from '@/components/layout/OrganizationSwitcher';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { useAuth } from '@/context/auth-context';
import {
  Users,
  UserPlus,
  Shield,
  Mail,
  Trash2,
  Edit2,
  Loader2,
  Search,
  Clock,
  RefreshCw,
  AlertCircle,
  XCircle,
  Building2,
  Link2,
  Share2,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { organizationsService } from '@/services/api/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface Member {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  joined_at: string;
  last_active: string;
}

interface PendingInvitation {
  id: string;
  organization_id: string;
  email?: string | null;
  role: string;
  token: string;
  created_at: string;
  expires_at: string;
  invited_by: string;
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin (Full organization & team management)' },
  { value: 'LEGAL_ANALYST', label: 'Legal Analyst (Policy upload & compliance runs)' },
  { value: 'REVIEWER', label: 'Reviewer (Findings & report review)' },
  { value: 'VIEWER', label: 'Viewer (Read-only dashboard & report downloads)' },
];

function formatRoleLabel(role: string) {
  const normalized = role.toUpperCase();
  if (normalized === 'ADMIN' || normalized === 'ORGANIZATION_ADMIN' || normalized === 'SUPER_ADMIN') {
    return 'Admin';
  }
  if (normalized === 'LEGAL_ANALYST' || normalized === 'MANAGER') {
    return 'Legal Analyst';
  }
  if (normalized === 'REVIEWER') {
    return 'Reviewer';
  }
  if (normalized === 'VIEWER' || normalized === 'EMPLOYEE') {
    return 'Viewer';
  }
  return role.replace('_', ' ');
}

function getRoleBadgeClass(role: string) {
  const normalized = role.toUpperCase();
  if (normalized === 'ADMIN' || normalized === 'ORGANIZATION_ADMIN' || normalized === 'SUPER_ADMIN') {
    return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30';
  }
  if (normalized === 'LEGAL_ANALYST' || normalized === 'MANAGER') {
    return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30';
  }
  if (normalized === 'REVIEWER') {
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
  }
  return 'bg-muted text-muted-foreground border-border';
}

export function UserManagementContent() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Invite Modal & Dual Method state
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteMethod, setInviteMethod] = useState<'EMAIL' | 'LINK'>('EMAIL');
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<string>('LEGAL_ANALYST');
  const [isSendingInvite, setIsSendingInvite] = useState<boolean>(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Edit Role Modal
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [newRole, setNewRole] = useState<string>('');

  // Delete Member Confirmation Modal
  const [removingMember, setRemovingMember] = useState<Member | null>(null);
  const [isRemoving, setIsRemoving] = useState<boolean>(false);

  const fetchTeamData = useCallback(async () => {
    const orgId = typeof window !== 'undefined' ? localStorage.getItem('selected_organization_id') : null;
    if (!orgId) return;

    setSelectedOrgId(orgId);
    setIsLoading(true);

    try {
      // Fetch Active Members
      const membersRes = await api.get(`/organizations/${orgId}/members`);
      setMembers(membersRes.data || []);

      // Fetch Pending Invitations
      try {
        const invRes = await api.get(`/organizations/${orgId}/invitations`);
        setInvitations(invRes.data || []);
      } catch {
        setInvitations([]);
      }
    } catch (err) {
      console.error('Failed loading team members:', err);
      toast.error('Failed to load organization team members.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamData();
    const handleOrgChange = () => fetchTeamData();
    window.addEventListener('organization_changed', handleOrgChange);
    return () => window.removeEventListener('organization_changed', handleOrgChange);
  }, [fetchTeamData]);

  const currentMember = members.find((m) => m.user_id === user?.id);
  const isAdmin = user?.is_superuser || currentMember?.role?.toUpperCase() === 'ADMIN' || currentMember?.role?.toUpperCase() === 'ORGANIZATION_ADMIN' || currentMember?.role?.toUpperCase() === 'SUPER_ADMIN';

  // Handle Invitation Generation (Email or Share Link)
  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;

    if (inviteMethod === 'EMAIL' && !inviteEmail.trim()) {
      toast.error('Please enter a valid work email address.');
      return;
    }

    setIsSendingInvite(true);
    setGeneratedInviteUrl('');

    try {
      const res = await organizationsService.createInvitation(selectedOrgId, {
        email: inviteMethod === 'EMAIL' ? inviteEmail.trim() : undefined,
        role: inviteRole,
      });

      const fullUrl = `${window.location.origin}/invite/${res.token}`;
      setGeneratedInviteUrl(fullUrl);

      if (inviteMethod === 'EMAIL') {
        toast.success(`Invitation created for ${inviteEmail}!`);
      } else {
        toast.success('Shareable invitation link generated!');
      }

      fetchTeamData();
    } catch (err: any) {
      console.error('Failed creating invitation:', err);
      toast.error(err?.response?.data?.detail || 'Failed to create invitation.');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleShareLink = async (url: string) => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'LexisGraph Team Invitation',
          text: `You have been invited to join the team on LexisGraph as a ${formatRoleLabel(inviteRole)}.`,
          url: url,
        });
        toast.success('Shared invitation link!');
        return;
      } catch {
        // User cancelled or share unhandled; fall back to copy
      }
    }

    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success('Copied invitation link to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleResendInvitation = async (inv: PendingInvitation) => {
    try {
      const res = await organizationsService.createInvitation(selectedOrgId, {
        email: inv.email || undefined,
        role: inv.role,
      });
      const fullUrl = `${window.location.origin}/invite/${res.token}`;
      navigator.clipboard.writeText(fullUrl);
      toast.success(`New invitation link copied to clipboard!`);
      fetchTeamData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to resend invitation.');
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await api.delete(`/organizations/${selectedOrgId}/invitations/${invitationId}`);
      toast.info('Cancelled invitation.');
      fetchTeamData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to cancel invitation.');
    }
  };

  const handleUpdateRole = async () => {
    if (!editingMember || !selectedOrgId) return;

    try {
      await api.put(`/organizations/${selectedOrgId}/members/${editingMember.user_id}/role`, {
        role: newRole,
      });
      toast.success(`Updated role for ${editingMember.full_name}!`);
      setEditingMember(null);
      fetchTeamData();
    } catch (err) {
      toast.error('Failed to update member role.');
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!removingMember || !selectedOrgId) return;
    setIsRemoving(true);
    try {
      await api.delete(`/organizations/${selectedOrgId}/members/${removingMember.user_id}`);
      toast.info(`Removed ${removingMember.full_name} from organization.`);
      setRemovingMember(null);
      fetchTeamData();
    } catch (err) {
      toast.error('Failed to remove member.');
    } finally {
      setIsRemoving(false);
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold flex items-center gap-2 text-foreground">
              <Users className="w-6 h-6 text-indigo-500" />
              Team & Member Management
            </h1>
            <OrganizationSwitcher onOrganizationChanged={fetchTeamData} />
          </div>
          <p className="text-xs text-muted-foreground">
            Manage organization team members, legal roles (Admin, Legal Analyst, Reviewer, Viewer), and invitation links.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <ThemeToggle />
          {isAdmin && (
            <Button
              onClick={() => {
                setShowInviteModal(true);
                setGeneratedInviteUrl('');
                setInviteEmail('');
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 h-9 rounded-xl shadow-lg shadow-indigo-600/20 cursor-pointer shrink-0"
            >
              <UserPlus className="w-4 h-4 mr-1.5" /> Invite Member
            </Button>
          )}
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
        <Input
          type="text"
          placeholder="Search team members by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-background border-border text-foreground text-xs h-10 rounded-xl"
        />
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="text-xs">Loading team members and invitations...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active Members Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                Active Team Members ({filteredMembers.length})
              </h2>
            </div>

            {filteredMembers.length === 0 ? (
              <Card className="p-8 bg-card border-border rounded-2xl text-center space-y-2">
                <Users className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-semibold text-foreground">
                  {members.length <= 1
                    ? "You're the only member of this organization."
                    : 'No matching team members found.'}
                </p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Invite legal analysts or reviewers to collaborate on compliance reports.
                </p>
              </Card>
            ) : (
              <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-sm dark:shadow-2xl">
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px] border-b border-border">
                      <tr>
                        <th className="p-4">Name & Email</th>
                        <th className="p-4">Role</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Joined</th>
                        {isAdmin && <th className="p-4 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredMembers.map((member) => (
                        <tr key={member.id} className="hover:bg-muted/40 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold text-xs shrink-0">
                                {member.full_name ? member.full_name[0].toUpperCase() : 'U'}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground truncate">{member.full_name || 'Team Member'}</div>
                                <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[240px]">{member.email}</div>
                              </div>
                            </div>
                          </td>

                          <td className="p-4">
                            <Badge className={`text-[10px] uppercase font-mono ${getRoleBadgeClass(member.role)}`}>
                              <Shield className="w-3 h-3 mr-1" />
                              {formatRoleLabel(member.role)}
                            </Badge>
                          </td>

                          <td className="p-4">
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                              {member.status}
                            </Badge>
                          </td>

                          <td className="p-4 text-muted-foreground font-mono text-[11px]">
                            {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'N/A'}
                          </td>

                          {isAdmin && (
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingMember(member);
                                    setNewRole(member.role);
                                  }}
                                  className="h-7 w-7 text-muted-foreground hover:text-indigo-500 hover:bg-muted cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>

                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setRemovingMember(member)}
                                  className="h-7 w-7 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="md:hidden divide-y divide-border">
                  {filteredMembers.map((member) => (
                    <div key={member.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold text-xs shrink-0">
                            {member.full_name ? member.full_name[0].toUpperCase() : 'U'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground text-xs truncate">{member.full_name || 'Team Member'}</div>
                            <div className="text-[11px] text-muted-foreground font-mono truncate">{member.email}</div>
                          </div>
                        </div>
                        <Badge className={`text-[10px] uppercase font-mono shrink-0 ${getRoleBadgeClass(member.role)}`}>
                          {formatRoleLabel(member.role)}
                        </Badge>
                      </div>

                      {isAdmin && (
                        <div className="flex justify-end gap-2 pt-1 border-t border-border/60">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingMember(member);
                              setNewRole(member.role);
                            }}
                            className="h-7 text-xs text-indigo-500 hover:bg-indigo-500/10"
                          >
                            <Edit2 className="w-3 h-3 mr-1" /> Edit Role
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRemovingMember(member)}
                            className="h-7 text-xs text-rose-500 hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Pending Invitations Section */}
          <div className="space-y-3 pt-2">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-500" /> Pending Invitations ({invitations.length})
            </h2>

            {invitations.length === 0 ? (
              <Card className="p-6 bg-card border-border rounded-2xl text-center">
                <p className="text-xs text-muted-foreground">No pending invitations.</p>
              </Card>
            ) : (
              <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-sm dark:shadow-2xl p-4 space-y-3">
                <div className="divide-y divide-border/60">
                  {invitations.map((inv) => {
                    const fullInviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/invite/${inv.token}` : `/invite/${inv.token}`;
                    return (
                      <div key={inv.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground text-xs truncate max-w-[260px]">
                              {inv.email || "Shareable Invitation Link"}
                            </span>
                            <Badge className={`text-[10px] uppercase font-mono ${getRoleBadgeClass(inv.role)}`}>
                              {formatRoleLabel(inv.role)}
                            </Badge>
                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">
                              Pending
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Sent: {new Date(inv.created_at).toLocaleDateString()} · Expires: {new Date(inv.expires_at).toLocaleDateString()}
                          </p>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleShareLink(fullInviteUrl)}
                              className="h-7 text-xs bg-background border-border hover:bg-muted text-foreground gap-1 cursor-pointer"
                            >
                              <Copy className="w-3 h-3" /> Copy Link
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResendInvitation(inv)}
                              className="h-7 text-xs bg-background border-border hover:bg-muted text-foreground gap-1 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" /> Resend
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCancelInvitation(inv.id)}
                              className="h-7 text-xs text-rose-500 hover:bg-rose-500/10 gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3 h-3" /> Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Invite Member Dual Modal (Email vs Share Link) */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-500" /> Invite Team Member
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-muted-foreground hover:text-foreground text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Dual Method Toggle */}
            <div className="flex items-center gap-2 bg-muted/40 p-1 rounded-xl border border-border/60">
              <button
                type="button"
                onClick={() => {
                  setInviteMethod('EMAIL');
                  setGeneratedInviteUrl('');
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  inviteMethod === 'EMAIL'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Mail className="w-3.5 h-3.5" /> Invite by Email
              </button>

              <button
                type="button"
                onClick={() => {
                  setInviteMethod('LINK');
                  setGeneratedInviteUrl('');
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  inviteMethod === 'LINK'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" /> Share Invitation Link
              </button>
            </div>

            <form onSubmit={handleGenerateInvite} className="space-y-4">
              {inviteMethod === 'EMAIL' ? (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Work Email Address</label>
                  <Input
                    type="email"
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="bg-background border-border text-xs h-9 text-foreground"
                  />
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20 text-xs text-muted-foreground leading-relaxed">
                  Generates a secure, time-limited single-use link. Recipient can sign up or log in to join your organization workspace.
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-background border border-border text-foreground text-xs h-9 rounded-xl px-3"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Generated Link Display */}
              {generatedInviteUrl && (
                <div className="space-y-2 p-3 rounded-xl bg-card border border-border space-y-2">
                  <label className="text-[11px] font-bold text-foreground block">Invitation Link Ready:</label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      readOnly
                      value={generatedInviteUrl}
                      className="bg-background border-border text-xs h-8 text-foreground font-mono"
                    />
                    <Button
                      type="button"
                      size="xs"
                      onClick={() => handleShareLink(generatedInviteUrl)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8 px-3 cursor-pointer shrink-0 gap-1"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedLink ? 'Copied' : 'Copy'}
                    </Button>
                    {typeof navigator !== "undefined" && "share" in navigator && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => handleShareLink(generatedInviteUrl)}
                        className="text-xs h-8 px-2.5 cursor-pointer shrink-0 gap-1"
                        title="Share Link"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowInviteModal(false)} className="text-xs h-8 text-muted-foreground">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSendingInvite} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8 px-4 cursor-pointer">
                  {isSendingInvite ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : inviteMethod === 'EMAIL' ? (
                    'Send Invitation'
                  ) : (
                    'Generate Invite Link'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-500" /> Change Role for {editingMember.full_name}
            </h3>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-muted-foreground block">Select New Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full bg-background border border-border text-foreground text-xs h-9 rounded-xl px-3"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="ghost" onClick={() => setEditingMember(null)} className="text-xs h-8 text-muted-foreground">
                  Cancel
                </Button>
                <Button onClick={handleUpdateRole} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8 px-4 cursor-pointer">
                  Save Role
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Member Removal Modal */}
      {removingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2 text-rose-500">
              <AlertCircle className="w-5 h-5 text-rose-500" /> Remove {removingMember.full_name}?
            </h3>

            <p className="text-xs text-muted-foreground leading-relaxed">
              This will immediately remove access for <span className="font-semibold text-foreground">{removingMember.email}</span> from this organization workspace.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setRemovingMember(null)} className="text-xs h-8 text-muted-foreground">
                Cancel
              </Button>
              <Button
                onClick={handleConfirmRemoveMember}
                disabled={isRemoving}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs h-8 px-4 cursor-pointer"
              >
                {isRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Remove Member'}
              </Button>
            </div>
          </div>
        </div >
      )}
    </div>
  );
}

export default function UserManagementPage() {
  return (
    <ProtectedRoute>
      <UserManagementContent />
    </ProtectedRoute>
  );
}
