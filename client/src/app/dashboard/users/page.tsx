'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/context/auth-context';
import {
  Users,
  UserPlus,
  Shield,
  Mail,
  Trash2,
  Loader2,
  Search,
  RefreshCw,
  AlertCircle,
  XCircle,
  Link2,
  Share2,
  Copy,
  Check,
  MoreVertical,
  Clock,
  Inbox,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { organizationsService, OrganizationMember } from '@/services/api/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRoleLabel, getRoleBadgeClass, isRoleAdmin } from '@/utils/role-utils';
import { NaturalAvatar } from '@/components/ui/NaturalAvatar';

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

const ROLE_DEFINITIONS: Record<
  string,
  { label: string; description: string }
> = {
  ADMIN: {
    label: 'Admin',
    description:
      'Admins can manage organization members, invitations, roles, settings, policies, and compliance runs.',
  },
  COMPLIANCE_ANALYST: {
    label: 'Compliance Analyst',
    description:
      'Compliance Analysts can upload policies, initiate compliance analyses, and investigate findings.',
  },
  REVIEWER: {
    label: 'Reviewer',
    description:
      'Reviewers can inspect compliance findings, examine citations and evidence, and perform review actions.',
  },
  VIEWER: {
    label: 'Viewer',
    description:
      'Viewers have read-only access to view authorized policies, compliance reports, and findings.',
  },
};

const INVITATION_ROLES = [
  { value: 'COMPLIANCE_ANALYST', label: 'Compliance Analyst' },
  { value: 'REVIEWER', label: 'Reviewer' },
  { value: 'VIEWER', label: 'Viewer' },
];

const CHANGE_ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'COMPLIANCE_ANALYST', label: 'Compliance Analyst' },
  { value: 'REVIEWER', label: 'Reviewer' },
  { value: 'VIEWER', label: 'Viewer' },
];

export function UserManagementContent() {
  const { user, activeMembership, permissions, isAdmin: authIsAdmin } = useAuth();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeOrgId =
    activeMembership?.organization_id ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('selected_organization_id')
      : null);
  const activeOrgName =
    activeMembership?.organization_name || 'Active Workspace';

  // Modal states
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteMethod, setInviteMethod] = useState<'EMAIL' | 'LINK'>('EMAIL');
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<string>('COMPLIANCE_ANALYST');
  const [isSendingInvite, setIsSendingInvite] = useState<boolean>(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Edit Role Modal state
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);
  const [newRole, setNewRole] = useState<string>('');
  const [isUpdatingRole, setIsUpdatingRole] = useState<boolean>(false);

  // Remove Member Modal state
  const [removingMember, setRemovingMember] = useState<OrganizationMember | null>(null);
  const [isRemoving, setIsRemoving] = useState<boolean>(false);

  // Fetch organization team data
  const fetchTeamData = useCallback(async () => {
    if (!activeOrgId) {
      setMembers([]);
      setInvitations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [membersData, invitationsData] = await Promise.all([
        organizationsService.getMembers(activeOrgId).catch((err) => {
          console.error('Failed to fetch members:', err);
          return [];
        }),
        organizationsService.getInvitations(activeOrgId).catch(() => []),
      ]);

      setMembers(membersData || []);
      setInvitations(invitationsData || []);
    } catch (err: any) {
      console.error('Failed loading team data:', err);
      const detail =
        err?.response?.data?.detail ||
        'Failed to load organization team members and invitations.';
      setError(detail);
      toast.error(detail);
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  // Sync on organization change event
  useEffect(() => {
    const handleOrgChange = () => fetchTeamData();
    window.addEventListener('organization_changed', handleOrgChange);
    return () => window.removeEventListener('organization_changed', handleOrgChange);
  }, [fetchTeamData]);

  // Determine current user permissions in this active workspace
  const currentMember = useMemo(
    () => members.find((m) => m.user_id === user?.id),
    [members, user?.id]
  );

  const canManageTeam =
    permissions?.canManageOrganization ||
    authIsAdmin ||
    isRoleAdmin(currentMember?.role, user?.is_superuser);

  // Filter members by name or email
  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.full_name && m.full_name.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.username && m.username.toLowerCase().includes(q))
    );
  }, [members, searchQuery]);

  // Handle invitation creation
  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;

    if (inviteMethod === 'EMAIL' && !inviteEmail.trim()) {
      toast.error('Please enter a valid work email address.');
      return;
    }

    setIsSendingInvite(true);
    setGeneratedInviteUrl('');

    try {
      const res = await organizationsService.createInvitation(activeOrgId, {
        email: inviteMethod === 'EMAIL' ? inviteEmail.trim() : undefined,
        role: inviteRole,
      });

      const fullUrl = `${window.location.origin}/invite/${res.token}`;
      setGeneratedInviteUrl(fullUrl);

      if (inviteMethod === 'EMAIL') {
        toast.success(`Invitation sent to ${inviteEmail}!`);
        setShowInviteModal(false);
        setInviteEmail('');
      } else {
        toast.success('Shareable invitation link generated!');
      }

      fetchTeamData();
    } catch (err: any) {
      console.error('Failed creating invitation:', err);
      const detail = err?.response?.data?.detail || 'Failed to create invitation.';
      toast.error(typeof detail === 'string' ? detail : 'Failed to create invitation.');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleShareLink = async (url: string) => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'LexisGraph Team Invitation',
          text: `You have been invited to join ${activeOrgName} on LexisGraph.`,
          url: url,
        });
        toast.success('Shared invitation link!');
        return;
      } catch {
        // Fallback to copy
      }
    }

    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success('Invitation link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleResendInvitation = async (inv: PendingInvitation) => {
    if (!activeOrgId) return;
    try {
      const res = await organizationsService.createInvitation(activeOrgId, {
        email: inv.email || undefined,
        role: inv.role,
      });
      const fullUrl = `${window.location.origin}/invite/${res.token}`;
      navigator.clipboard.writeText(fullUrl);
      toast.success('New invitation link created and copied to clipboard!');
      fetchTeamData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to resend invitation.');
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!activeOrgId) return;
    try {
      await organizationsService.cancelInvitation(activeOrgId, invitationId);
      toast.info('Invitation revoked.');
      fetchTeamData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to revoke invitation.');
    }
  };

  const handleUpdateRole = async () => {
    if (!editingMember || !activeOrgId || !newRole) return;
    setIsUpdatingRole(true);

    try {
      await organizationsService.updateMemberRole(
        activeOrgId,
        editingMember.user_id,
        newRole
      );
      toast.success(`Role updated for ${editingMember.full_name || editingMember.email}!`);
      setEditingMember(null);
      fetchTeamData();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to update member role.';
      toast.error(typeof detail === 'string' ? detail : 'Failed to update member role.');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!removingMember || !activeOrgId) return;
    setIsRemoving(true);

    try {
      await organizationsService.removeMember(
        activeOrgId,
        removingMember.user_id
      );
      toast.success(
        `Removed ${removingMember.full_name || removingMember.email} from ${activeOrgName}.`
      );
      setRemovingMember(null);
      fetchTeamData();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to remove member.';
      toast.error(typeof detail === 'string' ? detail : 'Failed to remove member.');
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Team Members
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage team members, invitations, and access permissions for{' '}
            <span className="font-semibold text-foreground">{activeOrgName}</span>.
          </p>
        </div>

        {/* Primary Action */}
        {canManageTeam && (
          <Button
            onClick={() => {
              setShowInviteModal(true);
              setGeneratedInviteUrl('');
              setInviteEmail('');
              setInviteRole('COMPLIANCE_ANALYST');
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 px-3.5 shadow-sm cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            <span>Invite Member</span>
          </Button>
        )}
      </div>

      {/* ── Compact Member Summary (Two Compact Counts) ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/70 bg-card text-xs shadow-2xs">
          <Users className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground font-medium">Active Members:</span>
          <span className="font-semibold text-foreground tabular-nums">
            {isLoading ? '...' : members.length}
          </span>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/70 bg-card text-xs shadow-2xs">
          <Mail className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-muted-foreground font-medium">Pending Invitations:</span>
          <span className="font-semibold text-foreground tabular-nums">
            {isLoading ? '...' : invitations.length}
          </span>
        </div>
      </div>

      {/* ── Search Filter ── */}
      <div className="relative max-w-md w-full">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          type="text"
          placeholder="Search members by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-14 bg-background border-border text-foreground text-xs h-9 rounded-lg"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Error State ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold">Failed to load team data</h3>
              <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">{error}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTeamData}
            className="gap-2 border-red-300 text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/50 shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        </div>
      )}

      {/* ── Main Content Area ── */}
      {isLoading ? (
        <div className="space-y-4">
          <Card className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </Card>
        </div>
      ) : !error && (
        <div className="space-y-8">
          {/* Active Members Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Active Members
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground tabular-nums">
                  {filteredMembers.length}
                </span>
              </div>
            </div>

            {filteredMembers.length === 0 ? (
              <Card className="p-8 bg-card border-border/60 rounded-xl text-center space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mx-auto">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  {searchQuery
                    ? 'No members match your search'
                    : 'No members in this workspace yet'}
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {searchQuery
                    ? 'Try checking for spelling errors or clearing your search query.'
                    : 'Invite legal analysts or reviewers to collaborate on compliance assessments.'}
                </p>
                {searchQuery ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="text-xs font-medium cursor-pointer"
                  >
                    Clear Search
                  </Button>
                ) : (
                  canManageTeam && (
                    <Button
                      size="sm"
                      onClick={() => setShowInviteModal(true)}
                      className="text-xs font-semibold cursor-pointer"
                    >
                      Invite Member
                    </Button>
                  )
                )}
              </Card>
            ) : (
              <Card className="bg-card border-border/60 rounded-xl overflow-hidden shadow-sm">
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground font-semibold text-[11px] border-b border-border/60">
                      <tr>
                        <th className="p-3.5 pl-4 w-[36%]">Member</th>
                        <th className="p-3.5 w-[22%]">Role</th>
                        <th className="p-3.5 w-[14%]">Status</th>
                        <th className="p-3.5 w-[18%]">Joined</th>
                        {canManageTeam && (
                          <th className="p-3.5 pr-4 w-[10%] text-right">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredMembers.map((member) => {
                        const isCurrentUser = member.user_id === user?.id;
                        const joinedFormatted = member.joined_at
                          ? format(new Date(member.joined_at), 'MMM d, yyyy')
                          : '—';

                        return (
                          <tr
                            key={member.id}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            {/* Member Avatar + Name + "You" badge + Email */}
                            <td className="p-3.5 pl-4">
                              <div className="flex items-center gap-3">
                                <NaturalAvatar
                                  name={member.full_name || member.email || 'Member'}
                                  shape="circle"
                                  maxInitials={1}
                                  className="w-8 h-8 text-xs shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-foreground truncate">
                                      {member.full_name || 'Team Member'}
                                    </span>
                                    {isCurrentUser && (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/25">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[240px]">
                                    {member.email}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Role Badge */}
                            <td className="p-3.5">
                              <Badge
                                className={`text-[10px] font-semibold uppercase tracking-wider ${getRoleBadgeClass(
                                  member.role
                                )}`}
                              >
                                <Shield className="w-3 h-3 mr-1" />
                                {formatRoleLabel(member.role)}
                              </Badge>
                            </td>

                            {/* Status */}
                            <td className="p-3.5">
                              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 text-[10px] font-medium">
                                Active
                              </Badge>
                            </td>

                            {/* Joined Date */}
                            <td className="p-3.5 text-muted-foreground text-[11px] whitespace-nowrap">
                              {joinedFormatted}
                            </td>

                            {/* Actions Three-dot Menu */}
                            {canManageTeam && (
                              <td className="p-3.5 pr-4 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                                        title="Member actions"
                                      >
                                        <MoreVertical className="w-4 h-4" />
                                        <span className="sr-only">Actions</span>
                                      </Button>
                                    }
                                  />
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setEditingMember(member);
                                        setNewRole(member.role);
                                      }}
                                      className="cursor-pointer gap-2"
                                    >
                                      <Shield className="w-3.5 h-3.5 text-primary" />
                                      <span>Change Role</span>
                                    </DropdownMenuItem>

                                    {!isCurrentUser && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => setRemovingMember(member)}
                                          variant="destructive"
                                          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Remove from Workspace</span>
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="md:hidden divide-y divide-border/60">
                  {filteredMembers.map((member) => {
                    const isCurrentUser = member.user_id === user?.id;
                    const joinedFormatted = member.joined_at
                      ? format(new Date(member.joined_at), 'MMM d, yyyy')
                      : '—';

                    return (
                      <div key={member.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <NaturalAvatar
                              name={member.full_name || member.email || 'Member'}
                              shape="circle"
                              maxInitials={1}
                              className="w-8 h-8 text-xs shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-foreground text-xs truncate">
                                  {member.full_name || 'Team Member'}
                                </span>
                                {isCurrentUser && (
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/25">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground font-mono truncate">
                                {member.email}
                              </div>
                            </div>
                          </div>

                          <Badge
                            className={`text-[10px] font-semibold uppercase shrink-0 ${getRoleBadgeClass(
                              member.role
                            )}`}
                          >
                            {formatRoleLabel(member.role)}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                          <span>Joined: {joinedFormatted}</span>

                          {canManageTeam && (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                                  >
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </Button>
                                }
                              />
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingMember(member);
                                    setNewRole(member.role);
                                  }}
                                  className="cursor-pointer gap-2"
                                >
                                  <Shield className="w-3.5 h-3.5 text-primary" />
                                  <span>Change Role</span>
                                </DropdownMenuItem>

                                {!isCurrentUser && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setRemovingMember(member)}
                                      variant="destructive"
                                      className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Remove from Workspace</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          {/* Pending Invitations Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Pending Invitations
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground tabular-nums">
                  {invitations.length}
                </span>
              </div>
            </div>

            {invitations.length === 0 ? (
              <Card className="p-6 bg-card border-border/60 rounded-xl text-center space-y-1">
                <h3 className="text-xs font-semibold text-foreground">
                  No pending invitations
                </h3>
                <p className="text-xs text-muted-foreground">
                  Invitations awaiting acceptance will appear here.
                </p>
              </Card>
            ) : (
              <Card className="bg-card border-border/60 rounded-xl overflow-hidden shadow-sm p-4">
                <div className="divide-y divide-border/60">
                  {invitations.map((inv) => {
                    const fullInviteUrl =
                      typeof window !== 'undefined'
                        ? `${window.location.origin}/invite/${inv.token}`
                        : `/invite/${inv.token}`;

                    const sentDate = inv.created_at
                      ? format(new Date(inv.created_at), 'MMM d, yyyy')
                      : '—';
                    const expiresDate = inv.expires_at
                      ? format(new Date(inv.expires_at), 'MMM d, yyyy')
                      : '—';

                    return (
                      <div
                        key={inv.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground text-xs truncate max-w-[260px]">
                              {inv.email || 'Shareable Invitation Link'}
                            </span>
                            <Badge
                              className={`text-[10px] font-semibold uppercase ${getRoleBadgeClass(
                                inv.role
                              )}`}
                            >
                              {formatRoleLabel(inv.role)}
                            </Badge>
                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 text-[10px] font-medium">
                              Pending
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Sent: {sentDate} · Expires: {expiresDate}
                          </p>
                        </div>

                        {canManageTeam && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleShareLink(fullInviteUrl)}
                              className="h-7 text-xs bg-background border-border hover:bg-muted text-foreground gap-1 cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                              <span>Copy Link</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResendInvitation(inv)}
                              className="h-7 text-xs bg-background border-border hover:bg-muted text-foreground gap-1 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Resend</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCancelInvitation(inv.id)}
                              className="h-7 text-xs text-rose-500 hover:bg-rose-500/10 gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Revoke</span>
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

      {/* ── Invite Member Modal ── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-background border border-border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                <span>Invite Team Member</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-muted-foreground hover:text-foreground text-xs cursor-pointer p-1 rounded"
              >
                ✕
              </button>
            </div>

            {/* Dual Method Toggle */}
            <div className="flex items-center gap-2 bg-muted/40 p-1 rounded-lg border border-border/60">
              <button
                type="button"
                onClick={() => {
                  setInviteMethod('EMAIL');
                  setGeneratedInviteUrl('');
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  inviteMethod === 'EMAIL'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Invite by Email</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInviteMethod('LINK');
                  setGeneratedInviteUrl('');
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  inviteMethod === 'LINK'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Share Link</span>
              </button>
            </div>

            <form onSubmit={handleGenerateInvite} className="space-y-4">
              {inviteMethod === 'EMAIL' ? (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Work Email Address
                  </label>
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
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground leading-relaxed">
                  Generates a secure single-use invitation link for{' '}
                  <span className="font-semibold text-foreground">{activeOrgName}</span>.
                </div>
              )}

              {/* Role Selector */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Organization Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-background border border-border text-foreground text-xs h-9 rounded-lg px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {INVITATION_ROLES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Role Description */}
                <p className="text-[11px] text-muted-foreground mt-1.5 bg-muted/30 p-2 rounded border border-border/40">
                  {ROLE_DEFINITIONS[inviteRole]?.description}
                </p>
              </div>

              {/* Generated Link Display */}
              {generatedInviteUrl && (
                <div className="space-y-2 p-3 rounded-lg bg-card border border-border">
                  <label className="text-[11px] font-semibold text-foreground block">
                    Invitation Link:
                  </label>
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
                      className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 px-3 cursor-pointer shrink-0 gap-1"
                    >
                      {copiedLink ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                    </Button>
                    {typeof navigator !== 'undefined' && 'share' in navigator && (
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowInviteModal(false)}
                  className="text-xs h-8 text-muted-foreground cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSendingInvite}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 px-4 cursor-pointer"
                >
                  {isSendingInvite ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  ) : null}
                  <span>
                    {inviteMethod === 'EMAIL'
                      ? 'Send Invitation'
                      : 'Generate Link'}
                  </span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Change Role Modal ── */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-background border border-border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span>Change Member Role</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="text-muted-foreground hover:text-foreground text-xs cursor-pointer p-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Member Details */}
              <div className="p-3 rounded-lg bg-card border border-border/70 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Member:</span>
                  <span className="font-semibold text-foreground">
                    {editingMember.full_name || 'Team Member'}
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="text-muted-foreground">{editingMember.email}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                  <span className="text-muted-foreground">Current Role:</span>
                  <Badge
                    className={`text-[10px] font-semibold uppercase ${getRoleBadgeClass(
                      editingMember.role
                    )}`}
                  >
                    {formatRoleLabel(editingMember.role)}
                  </Badge>
                </div>
              </div>

              {/* New Role Selector */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  New Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-background border border-border text-foreground text-xs h-9 rounded-lg px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {CHANGE_ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Explanation */}
                <div className="mt-2 p-2.5 rounded bg-muted/40 border border-border/50 text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground block mb-0.5">
                    {ROLE_DEFINITIONS[newRole]?.label || newRole} Permissions:
                  </span>
                  {ROLE_DEFINITIONS[newRole]?.description}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setEditingMember(null)}
                  className="text-xs h-8 text-muted-foreground cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateRole}
                  disabled={isUpdatingRole || newRole === editingMember.role}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 px-4 cursor-pointer"
                >
                  {isUpdatingRole && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  )}
                  <span>Save Changes</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove Member Confirmation Modal ── */}
      {removingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-background border border-border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2 text-rose-500">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
              <span>Remove member from workspace?</span>
            </h3>

            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">
                {removingMember.full_name || removingMember.email}
              </span>{' '}
              will lose access to{' '}
              <span className="font-semibold text-foreground">{activeOrgName}</span>.
              Their LexisGraph account and access to other organizations will remain
              unchanged.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => setRemovingMember(null)}
                className="text-xs h-8 text-muted-foreground cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmRemoveMember}
                disabled={isRemoving}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-8 px-4 cursor-pointer"
              >
                {isRemoving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : null}
                <span>Remove Member</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UserManagementPage() {
  const { activeMembership } = useAuth();
  const activeOrgId = activeMembership?.organization_id;

  return (
    <ProtectedRoute>
      <AppShell>
        <UserManagementContent key={activeOrgId || 'no-org'} />
      </AppShell>
    </ProtectedRoute>
  );
}
