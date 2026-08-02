'use client';

import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Wifi,
  Radio,
  RefreshCw,
  Ban,
  FileText,
} from 'lucide-react';
import { useJobProgress, ConnectionType } from '@/hooks/useJobProgress';

interface JobProgressCardProps {
  jobId: string;
  onCompleted?: (reportId: string) => void;
}

const STAGES = [
  { threshold: 5, label: 'Upload & Validation', icon: 'upload' },
  { threshold: 15, label: 'Fetching Regulation Clauses', icon: 'regulation' },
  { threshold: 30, label: 'Vector Retrieval (Qdrant)', icon: 'vector' },
  { threshold: 45, label: 'Knowledge Graph Retrieval (Neo4j)', icon: 'graph' },
  { threshold: 60, label: 'Hybrid Ranking & Context Assembly', icon: 'hybrid' },
  { threshold: 75, label: 'LLM Reasoning & Evaluation', icon: 'llm' },
  { threshold: 90, label: 'Generating Recommendations', icon: 'recs' },
  { threshold: 100, label: 'Saving Final Compliance Report', icon: 'save' },
];

function formatEta(seconds: number | null): string {
  if (seconds === null || seconds < 0) return 'Calculating...';
  if (seconds === 0) return 'Almost done';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs} sec`;
  return `${mins} min ${secs} sec`;
}

function ConnectionBadge({ type }: { type: ConnectionType }) {
  switch (type) {
    case 'ws':
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
          <Wifi className="w-3 h-3 animate-pulse" /> Live WebSockets
        </span>
      );
    case 'sse':
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
          <Radio className="w-3 h-3 animate-pulse" /> SSE Stream
        </span>
      );
    case 'polling':
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
          <RefreshCw className="w-3 h-3 animate-spin" /> 10s Polling
        </span>
      );
    default:
      return null;
  }
}

export const JobProgressCard: React.FC<JobProgressCardProps> = ({ jobId, onCompleted }) => {
  const {
    job,
    progress,
    currentStep,
    estimatedRemainingSeconds,
    status,
    connectionType,
    error,
    cancelJob,
  } = useJobProgress(jobId);

  const isCompleted = status === 'COMPLETED';
  const isFailed = status === 'FAILED';
  const isCancelled = status === 'CANCELLED';
  const isRunning = status === 'QUEUED' || status === 'RUNNING';

  React.useEffect(() => {
    if (isCompleted && job?.report_id && onCompleted) {
      onCompleted(job.report_id);
    }
  }, [isCompleted, job?.report_id, onCompleted]);

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center">
            {isRunning && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
            {isCompleted && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {isFailed && <XCircle className="w-5 h-5 text-rose-400" />}
            {isCancelled && <Ban className="w-5 h-5 text-amber-400" />}
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              Compliance Audit Engine
              {connectionType !== 'disconnected' && <ConnectionBadge type={connectionType} />}
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Job ID: {jobId}</p>
          </div>
        </div>

        {isRunning && (
          <button
            onClick={cancelJob}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-rose-400 bg-slate-800/80 hover:bg-rose-500/10 border border-slate-700/60 hover:border-rose-500/30 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Ban className="w-3.5 h-3.5" /> Cancel Job
          </button>
        )}

        {isCompleted && job?.report_id && (
          <Link
            href={`/compliance/reports/${job.report_id}`}
            className="px-4 py-2 text-xs font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" /> View Report
          </Link>
        )}
      </div>

      {/* Progress Bar Section */}
      <div className="space-y-2 mb-6">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            {currentStep || 'Processing pipeline...'}
          </span>
          <span className="text-indigo-400 font-mono font-semibold">{progress}%</span>
        </div>

        <div className="w-full h-3 bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isCompleted
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-lg shadow-emerald-500/30'
                : isFailed
                ? 'bg-rose-500'
                : isCancelled
                ? 'bg-amber-500'
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 animate-pulse'
            }`}
            style={{ width: `${Math.max(progress, 3)}%` }}
          />
        </div>

        {isRunning && (
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Estimated Time Remaining:
            </span>
            <span className="font-mono text-slate-200 font-semibold">
              {formatEta(estimatedRemainingSeconds)}
            </span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2.5">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Audit Failure</p>
            <p className="text-rose-300/90 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Live Stage Timeline */}
      <div className="border-t border-slate-800/80 pt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Pipeline Timeline
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {STAGES.map((stage) => {
            const completed = progress >= stage.threshold;
            const active =
              isRunning &&
              progress < stage.threshold &&
              (STAGES.find((s) => progress < s.threshold)?.threshold === stage.threshold);

            return (
              <div
                key={stage.threshold}
                className={`p-3 rounded-xl border text-xs transition-all ${
                  completed
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-slate-200'
                    : active
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200 ring-1 ring-indigo-500/30'
                    : 'bg-slate-800/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-medium truncate">{stage.label}</span>
                  {completed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {active && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />}
                  {!completed && !active && (
                    <span className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
                  )}
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {completed ? 'Complete' : active ? 'In Progress' : 'Waiting'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
