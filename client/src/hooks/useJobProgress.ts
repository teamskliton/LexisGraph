import { useEffect, useState, useRef, useCallback } from 'react';
import { complianceApi, ComplianceJob } from '@/services/api/compliance';
import { getToken } from '@/utils/auth-storage';

export type ConnectionType = 'ws' | 'sse' | 'polling' | 'disconnected';

export interface UseJobProgressReturn {
  job: ComplianceJob | null;
  progress: number;
  currentStep: string;
  estimatedRemainingSeconds: number | null;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | null;
  connectionType: ConnectionType;
  error: string | null;
  cancelJob: () => Promise<void>;
  refreshJob: () => Promise<void>;
}

export function useJobProgress(jobId: string | null): UseJobProgressReturn {
  const [job, setJob] = useState<ComplianceJob | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<string>('Initializing');
  const [estimatedRemainingSeconds, setEstimatedRemainingSeconds] = useState<number | null>(null);
  const [status, setStatus] = useState<'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | null>(null);
  const [connectionType, setConnectionType] = useState<ConnectionType>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wsReconnectAttempts = useRef<number>(0);

  const clearAllConnections = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const handleEvent = useCallback((data: any) => {
    if (!data) return;
    if (typeof data.progress === 'number') setProgress(data.progress);
    if (data.current_step) setCurrentStep(data.current_step);
    if (data.status) setStatus(data.status);
    if (data.estimated_remaining_seconds !== undefined) {
      setEstimatedRemainingSeconds(data.estimated_remaining_seconds);
    }
    if (data.error) setError(data.error);

    setJob((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: data.status || prev.status,
        progress: typeof data.progress === 'number' ? data.progress : prev.progress,
        current_step: data.current_step || prev.current_step,
        report_id: data.report_id || prev.report_id,
        error_message: data.error || prev.error_message,
      };
    });
  }, []);

  const startPolling = useCallback(
    (targetJobId: string) => {
      clearAllConnections();
      setConnectionType('polling');
      console.log(`[useJobProgress] Polling active (2s interval) for job ${targetJobId}`);

      const poll = async () => {
        try {
          const latest = await complianceApi.getComplianceJob(targetJobId);
          setJob(latest);
          setProgress(latest.progress);
          setCurrentStep(latest.current_step);
          setStatus(latest.status);
          if (latest.error_message) setError(latest.error_message);

          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(latest.status)) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setConnectionType('disconnected');
          }
        } catch (err: any) {
          console.error('[useJobProgress] Polling error:', err);
        }
      };

      poll();
      pollTimerRef.current = setInterval(poll, 2000);
    },
    [clearAllConnections]
  );

  const startSSE = useCallback(
    (targetJobId: string, token: string) => {
      clearAllConnections();
      setConnectionType('sse');
      console.log(`[useJobProgress] Fallback: Connecting SSE stream for job ${targetJobId}`);

      const authToken = token || getToken() || (typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '');
      const apiHost = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const sseUrl = `${apiHost.replace(/\/$/, '')}/jobs/${targetJobId}/stream?token=${encodeURIComponent(authToken)}`;
      const es = new EventSource(sseUrl);
      sseRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleEvent(data);
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status)) {
            es.close();
            setConnectionType('disconnected');
          }
        } catch (err) {
          console.error('[useJobProgress] SSE parse error:', err);
        }
      };

      es.onerror = (err) => {
        console.warn('[useJobProgress] SSE connection notice, falling back to Polling:', err);
        es.close();
        startPolling(targetJobId);
      };
    },
    [clearAllConnections, handleEvent, startPolling]
  );

  const startWebSocketRef = useRef<((id: string) => void) | null>(null);

  const startWebSocket = useCallback(
    (targetJobId: string) => {
      clearAllConnections();
      setConnectionType('ws');

      const token = getToken() || (typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = process.env.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '')
        : `${protocol}//${window.location.hostname}:8000`;

      const wsUrl = `${host}/ws/jobs/${targetJobId}?token=${encodeURIComponent(token)}`;
      console.log(`[useJobProgress] Connecting WebSocket: ${wsUrl}`);

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[useJobProgress] WebSocket connected successfully');
          wsReconnectAttempts.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleEvent(data);

            if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status)) {
              ws.close();
              setConnectionType('disconnected');
            }
          } catch (err) {
            console.error('[useJobProgress] WebSocket parse error:', err);
          }
        };

        ws.onerror = (err) => {
          console.warn('[useJobProgress] WebSocket connection error:', err);
        };

        ws.onclose = (event) => {
          console.log(`[useJobProgress] WebSocket disconnected (code: ${event.code})`);
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status || '')) {
            setConnectionType('disconnected');
            return;
          }

          if (wsReconnectAttempts.current < 2) {
            wsReconnectAttempts.current += 1;
            console.log(`[useJobProgress] Attempting WebSocket reconnect (${wsReconnectAttempts.current}/2)...`);
            setTimeout(() => startWebSocketRef.current?.(targetJobId), 1500);
          } else {
            console.warn('[useJobProgress] Max WebSocket reconnects reached, falling back to SSE');
            startSSE(targetJobId, token);
          }
        };
      } catch (err) {
        console.error('[useJobProgress] Failed creating WebSocket:', err);
        startSSE(targetJobId, token);
      }
    },
    [clearAllConnections, handleEvent, startSSE, status]
  );

  useEffect(() => {
    startWebSocketRef.current = startWebSocket;
  }, [startWebSocket]);

  const fetchInitialJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const initial = await complianceApi.getComplianceJob(jobId);
      setJob(initial);
      setProgress(initial.progress);
      setCurrentStep(initial.current_step);
      setStatus(initial.status);
      if (initial.error_message) setError(initial.error_message);

      if (['QUEUED', 'RUNNING'].includes(initial.status)) {
        startWebSocket(jobId);
      } else {
        setConnectionType('disconnected');
      }
    } catch (err: any) {
      console.error('[useJobProgress] Fetch initial job error:', err);
      setError(err.message || 'Failed fetching job details');
    }
  }, [jobId, startWebSocket]);

  useEffect(() => {
    if (jobId) {
      fetchInitialJob();
    } else {
      clearAllConnections();
      setJob(null);
      setProgress(0);
      setCurrentStep('');
      setStatus(null);
      setConnectionType('disconnected');
    }

    return () => {
      clearAllConnections();
    };
  }, [jobId, fetchInitialJob, clearAllConnections]);

  const cancelJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const updated = await complianceApi.cancelComplianceJob(jobId);
      handleEvent({ status: 'CANCELLED', current_step: 'Job cancelled by user' });
      setJob(updated);
      clearAllConnections();
      setConnectionType('disconnected');
    } catch (err: any) {
      console.error('[useJobProgress] Cancel job error:', err);
      setError(err.message || 'Failed cancelling job');
    }
  }, [jobId, handleEvent, clearAllConnections]);

  return {
    job,
    progress,
    currentStep,
    estimatedRemainingSeconds,
    status,
    connectionType,
    error,
    cancelJob,
    refreshJob: fetchInitialJob,
  };
}
