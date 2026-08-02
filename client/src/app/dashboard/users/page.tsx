'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { OrganizationSwitcher } from '@/components/layout/OrganizationSwitcher';
import {
  Users,
  UserPlus,
  Shield,
  UserCheck,
  Mail,
  Trash2,
  Edit2,
  Loader2,
  Sparkles,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/services/api';
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

export function UserManagementContent() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Invite Modal
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<string>('EMPLOYEE');
  const [isSendingInvite, setIsSendingInvite] = useState<boolean>(false);

  // Role Edit Modal
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [newRole, setNewRole] = useState<string>('EMPLOYEE');

  const fetchMembers = useCallback(async () => {
    const orgId = localStorage.getItem('selected_organization_id');
    if (!orgId) return;
    setSelectedOrgId(orgId);
    setIsLoading(true);

    try {
      const response = await api.get(`/organizations/${orgId}/members`);
      setMembers(response.data);
    } catch (err) {
      console.error('Failed to load organization members:', err);
      toast.error('Failed to load team members.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
    const handleOrgChange = () => fetchMembers();
    window.addEventListener('organization_changed', handleOrgChange);
    return () => window.removeEventListener('organization_changed', handleOrgChange);
  }, [fetchMembers]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !selectedOrgId) return;

    setIsSendingInvite(true);
    try {
      await api.post(`/organizations/${selectedOrgId}/invitations`, {
        email: inviteEmail,
        role: inviteRole,
      });
      toast.success(`Invitation sent to ${inviteEmail}!`);
      setShowInviteModal(false);
      setInviteEmail('');
      fetchMembers();
    } catch (err: any) {
      console.error('Invite failed:', err);
      toast.error(err?.response?.data?.detail || 'Failed to send invitation.');
    } finally {
      setIsSendingInvite(false);
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
      fetchMembers();
    } catch (err) {
      toast.error('Failed to update member role.');
    }
  };

  const handleRemoveMember = async (member: Member) => {
    if (!selectedOrgId) return;
    if (!confirm(`Are you sure you want to remove ${member.full_name} from this organization?`)) return;

    try {
      await api.delete(`/organizations/${selectedOrgId}/members/${member.user_id}`);
      toast.info(`Removed ${member.full_name} from organization.`);
      fetchMembers();
    } catch (err) {
      toast.error('Failed to remove member.');
    }
  };

  const filteredMembers = members.filter((m) =>
    m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-indigo-400" />
              Team & Role-Based Access Control
            </h1>
            <OrganizationSwitcher onOrganizationChanged={fetchMembers} />
          </div>
          <p className="text-xs text-slate-400">
            Manage organization members, assign RBAC roles (Admin, Manager, Employee), and issue invitations.
          </p>
        </div>

        <Button
          onClick={() => setShowInviteModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 h-9 rounded-xl shadow-lg shadow-indigo-600/20"
        >
          <UserPlus className="w-4 h-4 mr-1.5" /> Invite User
        </Button>
      </div>

      {/* Search Filter */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        <Input
          type="text"
          placeholder="Search team members by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-slate-900 border-slate-800 text-slate-200 text-xs h-10 rounded-xl"
        />
      </div>

      {/* Members Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          <span className="text-xs">Loading organization members...</span>
        </div>
      ) : (
        <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-4">User</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Joined Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                          {member.full_name ? member.full_name[0].toUpperCase() : 'U'}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200">{member.full_name || 'Team Member'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{member.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <Badge className={`text-[10px] uppercase font-mono ${
                        member.role === 'ORGANIZATION_ADMIN' || member.role === 'SUPER_ADMIN'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                          : member.role === 'MANAGER'
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        <Shield className="w-3 h-3 mr-1" />
                        {member.role.replace('_', ' ')}
                      </Badge>
                    </td>

                    <td className="p-4">
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                        {member.status}
                      </Badge>
                    </td>

                    <td className="p-4 text-slate-400 font-mono text-[11px]">
                      {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'N/A'}
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingMember(member);
                            setNewRole(member.role);
                          }}
                          className="h-7 w-7 text-slate-400 hover:text-indigo-400 hover:bg-slate-800"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRemoveMember(member)}
                          className="h-7 w-7 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-400" /> Invite Team Member
            </h3>

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Email Address</label>
                <Input
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs h-9 text-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs h-9 rounded-xl px-3"
                >
                  <option value="EMPLOYEE">Employee (Read-Only access)</option>
                  <option value="MANAGER">Manager (Upload & Compliance analysis)</option>
                  <option value="ORGANIZATION_ADMIN">Organization Admin (Full org control)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowInviteModal(false)} className="text-xs h-8 text-slate-400">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSendingInvite} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8 px-4">
                  {isSendingInvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Send Invite'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" /> Change Role for {editingMember.full_name}
            </h3>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300 block">Select Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs h-9 rounded-xl px-3"
              >
                <option value="EMPLOYEE">Employee (Read-Only access)</option>
                <option value="MANAGER">Manager (Upload & Compliance analysis)</option>
                <option value="ORGANIZATION_ADMIN">Organization Admin (Full org control)</option>
              </select>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="ghost" onClick={() => setEditingMember(null)} className="text-xs h-8 text-slate-400">
                  Cancel
                </Button>
                <Button onClick={handleUpdateRole} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-8 px-4">
                  Save Role
                </Button>
              </div>
            </div>
          </div>
        </div>
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
