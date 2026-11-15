import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '@/services/api';
import type { AxiosError } from 'axios';
import type { JobResponse, JobStatus } from '@/services/types';
import { hasBlockingPendingReview } from '@/utils/questionRelations';

interface UseJobPollingOptions {
    jobId: string | null;
    totalPages?: number;
    onDone?: (data: JobResponse) => void;
    onFail?: (error: unknown) => void;
    enabled?: boolean;
}

type ApiErrorBody = {
    detail?: string;
    error?: string;
};

export function useJobPolling({ jobId, totalPages = 1, onDone, onFail, enabled = true }: UseJobPollingOptions) {
    const [status, setStatus] = useState<JobStatus>('pending');
    const [data, setData] = useState<JobResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [longRunning, setLongRunning] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);
    const inFlightRef = useRef(false);
    const pollStartedAtRef = useRef<number>(Date.now());
    const notFoundCountRef = useRef(0);
    const onDoneRef = useRef(onDone);
    const onFailRef = useRef(onFail);

    // Calculate max wait time in ms
    // min(30min, max(10min, total_pages * 6min))
    const maxWaitMs = Math.min(30, Math.max(10, totalPages * 6)) * 60 * 1000;

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        onDoneRef.current = onDone;
    }, [onDone]);

    useEffect(() => {
        onFailRef.current = onFail;
    }, [onFail]);

    const stopPolling = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const schedulePoll = useCallback(
        (interval: number) => {
            if (!isMountedRef.current) return;
            stopPolling();
            timeoutRef.current = setTimeout(() => pollRef.current?.(), interval);
        },
        [stopPolling]
    );

    // Use a ref to store the latest poll function to avoid circular dependency
    const pollRef = useRef<(() => Promise<void>) | null>(null);

    const poll = useCallback(async () => {
        if (!jobId || !enabled) return;
        if (!isMountedRef.current) return;
        if (inFlightRef.current) return;

        inFlightRef.current = true;
        try {
            const response = await apiClient.get<JobResponse>(`/jobs/${jobId}`);

            if (!isMountedRef.current) return;

            const jobData = response.data;
            notFoundCountRef.current = 0;
            setData(jobData);
            setStatus(jobData.status);

            const elapsedMs = jobData.elapsed_ms || 0;
            const cards = Array.isArray(jobData.question_cards) ? jobData.question_cards : [];
            const hasPendingReview = hasBlockingPendingReview(cards);

            if (jobData.status === 'done' && !hasPendingReview) {
                onDoneRef.current?.(jobData);
                stopPolling();
                return;
            }

            if (jobData.status === 'failed') {
                setError(jobData.error || 'Job failed');
                onFailRef.current?.(jobData.error || 'Job failed');
                stopPolling();
                return;
            }

            if (elapsedMs > maxWaitMs) {
                setLongRunning(true);
                console.warn('Job polling timed out based on max_wait rule');
            }

            // Determine next interval
            let interval = 10000;
            const elapsedMinutes = elapsedMs / 60000;
            if (elapsedMinutes < 2) {
                interval = 2000;
            } else if (elapsedMinutes < 10) {
                interval = 5000;
            }
            if (elapsedMs > maxWaitMs) {
                interval = 10000;
            }

            schedulePoll(interval);

        } catch (err) {
            const ax = err as AxiosError<ApiErrorBody>;
            const httpStatus = ax?.response?.status;
            const detail = ax?.response?.data?.detail || ax?.response?.data?.error;

            if (httpStatus === 404) {
                // New jobs may be enqueued just before status is visible. Retry briefly.
                notFoundCountRef.current += 1;
                const withinGraceWindow = Date.now() - pollStartedAtRef.current < 15000;
                if (withinGraceWindow || notFoundCountRef.current <= 8) {
                    schedulePoll(1000);
                    return;
                }
            }

            // If the job no longer exists (cache expired / backend restarted), treat it as failed
            // so Home can return to normal state instead of being stuck in PROCESSING forever.
            if (httpStatus === 404 || httpStatus === 410) {
                const msg = String(detail || 'Job not found');
                setStatus('failed');
                setError(msg);
                onFailRef.current?.(msg);
                stopPolling();
                return;
            }

            console.error('Polling error', err);
            schedulePoll(5000);
        } finally {
            inFlightRef.current = false;
        }
    }, [jobId, enabled, maxWaitMs, schedulePoll, stopPolling]);

    // Update the ref whenever poll changes
    useEffect(() => {
        pollRef.current = poll;
    }, [poll]);

    // Start polling when jobId or enabled changes
    useEffect(() => {
        stopPolling();
        inFlightRef.current = false;
        notFoundCountRef.current = 0;
        pollStartedAtRef.current = Date.now();
        setError(null);
        setLongRunning(false);

        if (enabled && jobId) {
            pollRef.current?.();
        }
        return () => stopPolling();
    }, [jobId, enabled, stopPolling]);

    return { status, data, error, longRunning };
}
