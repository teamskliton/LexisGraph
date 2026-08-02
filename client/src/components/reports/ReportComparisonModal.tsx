'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  GitCompare,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  XCircle,
  Loader2,
  X,
} from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface ReportComparisonModalProps {
  reportId1: string;
  reportId2: string;
  onClose: () => void;
}

export const ReportComparisonModal: React.FC<ReportComparisonModalProps> = ({
  reportId1,
  reportId2,
  onClose,
}) => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'resolved' | 'regressions' | 'new' | 'recommendations'>('resolved');

  const fetchComparison = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/reports/compare', {
        params: { report_id_1: reportId1, report_id_2: reportId2 },
      });
      setData(response.data);
    } catch (err) {
      console.error('Failed fetching report comparison:', err);
    } finally {
      setIsLoading(false);
    }
  }, [reportId1, reportId2]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto" />
          <p className="text-sm font-medium text-slate-300">Comparing report versions...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const scoreDiff = data.score_diff ?? 0;
  const isImproved = scoreDiff >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-6 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Compliance Report Comparison</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Score Diff Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-slate-950/60 border-slate-800 flex flex-col justify-between">
            <span className="text-xs text-slate-400">Baseline Report (v{data.report_1?.version || 1})</span>
            <div className="text-2xl font-bold font-mono text-slate-200 mt-1">
              {data.report_1?.overall_score}%
            </div>
            <span className="text-[11px] text-slate-500 mt-1">
              {data.report_1?.created_at ? new Date(data.report_1.created_at).toLocaleDateString() : ''}
            </span>
          </Card>

          <Card className="p-4 bg-slate-950/60 border-slate-800 flex flex-col justify-between">
            <span className="text-xs text-slate-400">Compared Report (v{data.report_2?.version || 2})</span>
            <div className="text-2xl font-bold font-mono text-slate-200 mt-1">
              {data.report_2?.overall_score}%
            </div>
            <span className="text-[11px] text-slate-500 mt-1">
              {data.report_2?.created_at ? new Date(data.report_2.created_at).toLocaleDateString() : ''}
            </span>
          </Card>

          <Card className={`p-4 border flex flex-col justify-between ${
            isImproved ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'
          }`}>
            <span className="text-xs font-semibold text-slate-300">Score Difference</span>
            <div className="flex items-center gap-2 mt-1">
              {isImproved ? (
                <TrendingUp className="w-6 h-6 text-emerald-400" />
              ) : (
                <TrendingDown className="w-6 h-6 text-rose-400" />
              )}
              <span className={`text-2xl font-bold font-mono ${isImproved ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isImproved ? `+${scoreDiff}%` : `${scoreDiff}%`}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1">
              {isImproved ? 'Compliance Improved' : 'Regression Detected'}
            </span>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-slate-800 pb-2">
          <Button
            size="sm"
            variant={activeTab === 'resolved' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('resolved')}
            className={`text-xs h-8 px-3 rounded-lg ${
              activeTab === 'resolved' ? 'bg-emerald-600 text-white' : 'text-slate-400'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            Resolved ({data.resolved_findings?.length || 0})
          </Button>

          <Button
            size="sm"
            variant={activeTab === 'regressions' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('regressions')}
            className={`text-xs h-8 px-3 rounded-lg ${
              activeTab === 'regressions' ? 'bg-rose-600 text-white' : 'text-slate-400'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-400" />
            Regressions ({data.regression_findings?.length || 0})
          </Button>

          <Button
            size="sm"
            variant={activeTab === 'new' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('new')}
            className={`text-xs h-8 px-3 rounded-lg ${
              activeTab === 'new' ? 'bg-indigo-600 text-white' : 'text-slate-400'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5 mr-1 text-indigo-400" />
            New Items ({data.new_findings?.length || 0})
          </Button>
        </div>

        {/* Tab Content Panel */}
        <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1">
          {activeTab === 'resolved' && (
            data.resolved_findings?.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No resolved findings between versions.</p>
            ) : (
              data.resolved_findings.map((item: any, idx: number) => (
                <div key={idx} className="p-3 bg-slate-950 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-200">{item.clause_id}</span>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Previous: <span className="text-rose-400 font-mono">{item.previous_status}</span> → Current: <span className="text-emerald-400 font-mono">{item.current_status}</span>
                    </p>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Resolved</Badge>
                </div>
              ))
            )
          )}

          {activeTab === 'regressions' && (
            data.regression_findings?.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No compliance regressions detected!</p>
            ) : (
              data.regression_findings.map((item: any, idx: number) => (
                <div key={idx} className="p-3 bg-slate-950 border border-rose-500/30 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-200">{item.clause_id}</span>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Previous: <span className="text-emerald-400 font-mono">{item.previous_status}</span> → Current: <span className="text-rose-400 font-mono">{item.current_status}</span>
                    </p>
                  </div>
                  <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">{item.severity || 'HIGH'} Risk</Badge>
                </div>
              ))
            )
          )}

          {activeTab === 'new' && (
            data.new_findings?.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No new clause findings evaluated.</p>
            ) : (
              data.new_findings.map((item: any, idx: number) => (
                <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{item.clause_id}</span>
                    <Badge variant="outline" className="text-slate-400 border-slate-700">{item.status}</Badge>
                  </div>
                  {item.reasoning && <p className="text-slate-400 text-[11px]">{item.reasoning}</p>}
                </div>
              ))
            )
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <Button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-4 rounded-xl">
            Close Comparison
          </Button>
        </div>
      </div>
    </div>
  );
};
