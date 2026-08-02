'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { OrganizationSwitcher } from '@/components/layout/OrganizationSwitcher';
import { ShieldAlert, Activity, User, Clock, Loader2, Search } from 'lucide-react';
import { api } from '@/services/api';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface AuditLogItem {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity?: string;
  entity_id?: string;
  timestamp: string;
}

export function AuditLogsContent() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchAuditLogs = useCallback(async () => {
    const orgId = localStorage.getItem('selected_organization_id');
    if (!orgId) return;
    setIsLoading(true);
    try {
      const response = await api.get(`/organizations/${orgId}/audit-logs`);
      setLogs(response.data);
    } catch (err) {
      console.error('Failed loading audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuditLogs();
    const handleOrgChange = () => fetchAuditLogs();
    window.addEventListener('organization_changed', handleOrgChange);
    return () => window.removeEventListener('organization_changed', handleOrgChange);
  }, [fetchAuditLogs]);

  const filteredLogs = logs.filter((l) =>
    l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (l.entity && l.entity.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-indigo-400" />
              Security Audit Stream
            </h1>
            <OrganizationSwitcher onOrganizationChanged={fetchAuditLogs} />
          </div>
          <p className="text-xs text-slate-400">
            Immutable log of organizational activities, user management changes, and compliance audit execution.
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        <Input
          type="text"
          placeholder="Filter audit logs by action, user, or entity..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-slate-900 border-slate-800 text-slate-200 text-xs h-10 rounded-xl"
        />
      </div>

      {/* Audit Log Stream Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          <span className="text-xs">Fetching audit stream...</span>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl">
          <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-300">No audit records found</p>
          <p className="text-xs text-slate-500 mt-1">Actions performed in this organization will be logged automatically.</p>
        </div>
      ) : (
        <Card className="bg-slate-900 border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-4">Action</th>
                  <th className="p-4">User</th>
                  <th className="p-4">Entity</th>
                  <th className="p-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[10px]">
                        {log.action}
                      </Badge>
                    </td>

                    <td className="p-4 text-slate-200 font-sans font-medium">
                      {log.user_name}
                    </td>

                    <td className="p-4 text-slate-400">
                      {log.entity || 'System'} {log.entity_id ? `(${log.entity_id.slice(0, 8)}...)` : ''}
                    </td>

                    <td className="p-4 text-right text-slate-500 text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <ProtectedRoute>
      <AuditLogsContent />
    </ProtectedRoute>
  );
}
