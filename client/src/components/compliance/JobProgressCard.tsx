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
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-success/10 text-success border border-success/30 font-medium">
          <Wifi className="w-3 h-3" /> Live WebSockets
        </span>
      );
    case 'sse':
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-medium">
          <Radio className="w-3 h-3" /> SSE Stream
        </span>
      );
    case 'polling':
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/30 font-medium">
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
    <div className="w-full bg-card border border-border rounded-xl p-6 shadow-xl transition-all duration-150">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-elevated border border-border flex items-center justify-center">
            {isRunning && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
            {isCompleted && <CheckCircle2 className="w-5 h-5 text-success" />}
            {isFailed && <XCircle className="w-5 h-5 text-danger" />}
            {isCancelled && <Ban className="w-5 h-5 text-warning" />}
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              Compliance Audit Engine
              {connectionType !== 'disconnected' && <ConnectionBadge type={connectionType} />}
            </h3>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">Job ID: {jobId}</p>
          </div>
        </div>

        {isRunning && (
          <button
            onClick={cancelJob}
            className="px-3 py-1.5 text-xs font-medium text-foreground hover:text-danger bg-surface-elevated hover:bg-danger/10 border border-border hover:border-danger/30 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Ban className="w-3.5 h-3.5" /> Cancel Job
          </button>
        )}

        {isCompleted && job?.report_id && (
          <Link
            href={`/compliance/reports/${job.report_id}`}
            className="px-4 py-2 text-xs font-semibold text-success-foreground bg-success hover:bg-success/90 rounded-md transition-colors flex items-center gap-1.5 border border-success"
          >
            <FileText className="w-4 h-4" /> View Report
          </Link>
        )}
      </div>

      {/* Progress Bar Section */}
      <div className="space-y-2 mb-6">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            {currentStep || 'Processing pipeline...'}
          </span>
          <span className="text-primary font-mono font-semibold">{progress}%</span>
        </div>

        <div className="w-full h-2.5 bg-surface-elevated rounded-full overflow-hidden border border-border">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isCompleted
                ? 'bg-success'
                : isFailed
                ? 'bg-danger'
                : isCancelled
                ? 'bg-warning'
                : 'bg-primary'
            }`}
            style={{ width: `${Math.max(progress, 3)}%` }}
          />
        </div>

        {isRunning && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" /> Estimated Time Remaining:
            </span>
            <span className="font-mono text-foreground font-semibold">
              {formatEta(estimatedRemainingSeconds)}
            </span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-lg text-danger text-xs flex items-start gap-2.5">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Audit Failure</p>
            <p className="text-danger/90 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Live Stage Timeline */}
      <div className="border-t border-border pt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
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
                className={`p-3 rounded-lg border text-xs transition-colors ${
                  completed
                    ? 'bg-success/10 border-success/30 text-foreground'
                    : active
                    ? 'bg-surface-elevated border-primary text-foreground'
                    : 'bg-surface-elevated/40 border-border text-muted-foreground'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-medium truncate">{stage.label}</span>
                  {completed && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
                  {active && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />}
                  {!completed && !active && (
                    <span className="w-2 h-2 rounded-full bg-border shrink-0" />
                  )}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
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
