'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  BookOpen,
  Search,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  FileText,
  Shield,
  Layers,
  Sparkles,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { regulationsApi, GlobalRegulation } from '@/services/api/regulations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface RegulationLibraryModalProps {
  organizationId: string;
  organizationName?: string;
  onLinkChanged?: () => void;
}

export const RegulationLibraryModal: React.FC<RegulationLibraryModalProps> = ({
  organizationId,
  organizationName,
  onLinkChanged,
}) => {
  const [regulations, setRegulations] = useState<GlobalRegulation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchRegulations = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    try {
      const data = await regulationsApi.listRegulations(organizationId, searchQuery);
      setRegulations(data);
    } catch (err) {
      console.error('Failed to fetch global regulations:', err);
      toast.error('Failed to load global regulation library.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, searchQuery]);

  useEffect(() => {
    fetchRegulations();
  }, [fetchRegulations]);

  const handleToggleLink = async (reg: GlobalRegulation) => {
    setActionInProgress(reg.id);
    try {
      if (reg.is_linked) {
        await regulationsApi.unlinkRegulation(organizationId, reg.id);
        toast.info(`Unlinked ${reg.title} from organization.`);
      } else {
        await regulationsApi.linkRegulation(organizationId, reg.id);
        toast.success(`Linked ${reg.title} to organization!`);
      }
      setRegulations((prev) =>
        prev.map((item) =>
          item.id === reg.id ? { ...item, is_linked: !item.is_linked } : item
        )
      );
      if (onLinkChanged) onLinkChanged();
    } catch (err: any) {
      console.error('Link toggle failed:', err);
      toast.error(err?.response?.data?.detail || 'Failed to update regulation link.');
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            Global Regulation Library
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Deduplicated shared repository. Link regulations to{' '}
            <span className="font-semibold text-slate-200">{organizationName || 'your organization'}</span> without duplicating embeddings or storage.
          </p>
        </div>
        <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 px-3 py-1 text-xs self-start sm:self-auto">
          <Sparkles className="w-3 h-3 mr-1 animate-pulse" /> Shared Repository
        </Badge>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        <Input
          type="text"
          placeholder="Search global regulations (e.g. Code of Wages, DPDP Act, POSH Act)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500 text-xs h-10 rounded-xl"
        />
      </div>

      {/* Regulations List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          <span className="text-xs">Searching global regulation library...</span>
        </div>
      ) : regulations.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
          <AlertCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-300 font-medium">No regulations found</p>
          <p className="text-xs text-slate-500 mt-1">
            {searchQuery ? 'Try adjusting your search criteria.' : 'Upload a regulation document to add it to the global library.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[450px] overflow-y-auto pr-1">
          {regulations.map((reg) => (
            <Card
              key={reg.id}
              className={`p-4 transition-all duration-200 border bg-slate-950/60 flex flex-col justify-between ${
                reg.is_linked
                  ? 'border-indigo-500/40 shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100 line-clamp-1">{reg.title}</h3>
                  {reg.is_linked ? (
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] shrink-0">
                      Linked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-400 border-slate-700 text-[10px] shrink-0">
                      Available
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                  {reg.act_name && (
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3 text-slate-500" /> {reg.act_name}
                    </span>
                  )}
                  {reg.version && (
                    <span className="font-mono text-indigo-400">v{reg.version}</span>
                  )}
                  {reg.act_year && (
                    <span className="text-slate-500 font-mono">({reg.act_year})</span>
                  )}
                  {reg.jurisdiction && (
                    <span className="text-slate-400">• {reg.jurisdiction}</span>
                  )}
                </div>

                <p className="text-[11px] font-mono text-slate-500 truncate">
                  SHA-256: {reg.document_hash?.slice(0, 16)}...
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800/60 mt-3 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {(reg.file_size / 1024).toFixed(0)} KB
                </span>
                <Button
                  size="sm"
                  onClick={() => handleToggleLink(reg)}
                  disabled={actionInProgress === reg.id}
                  variant={reg.is_linked ? 'outline' : 'default'}
                  className={`h-8 text-xs font-medium px-3 rounded-lg transition-all ${
                    reg.is_linked
                      ? 'border-slate-700 text-slate-300 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20'
                  }`}
                >
                  {actionInProgress === reg.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : reg.is_linked ? (
                    <>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Unlink
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Link to Org
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
