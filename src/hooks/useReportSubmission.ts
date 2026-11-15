import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/contexts/ProfileContext';
import { isCapabilitySubject } from '@/config/subjects';
import { PARENT_REPORT_VERSION, reportSubmissionService, reportWindowDates, type ReportSubmissionContext, type ReportSubmissionInput, type ReportWindowDates } from '@/services/reportSubmission';
import type { CapabilitySubject, ReportEligibility } from '@/services/types';

type PendingRequest = { accountId: string; profileId: string; input: ReportSubmissionInput; blocked?: boolean };
type RecoveryState = { key: string; request?: PendingRequest; error: string; blocked: boolean; busy: boolean };
const readAuth = () => ({ accountId: localStorage.getItem('user_id') || '', token: localStorage.getItem('access_token') || '' });
const requestKey = (context: ReportSubmissionContext) => `tint-report-request:${JSON.stringify([context.accountId, context.profileId])}`;
const readPending = (key: string, context: ReportSubmissionContext): PendingRequest | undefined => {
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return;
  const record = JSON.parse(raw) as PendingRequest;
  if (!record || record.accountId !== context.accountId || record.profileId !== context.profileId || !record.input || !isCapabilitySubject(record.input.subject) || ![3, 7, 30].includes(record.input.window_days) || typeof record.input.client_request_id !== 'string' || !record.input.client_request_id.trim() || record.input.client_request_id.length > 128) throw new Error('Invalid saved request');
  if (Object.hasOwn(record.input, 'content_version') && record.input.content_version !== PARENT_REPORT_VERSION) throw new Error('Invalid saved content version');
  const { from_date: from, through_date: through, window_days: days } = record.input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through) || Date.parse(through) - Date.parse(from) !== (days - 1) * 86400000) throw new Error('Invalid saved window');
  return record;
};

export function useReportSubmission(subject: CapabilitySubject, windowDays: number, isReadEnabled: (subject: CapabilitySubject) => boolean) {
  const navigate = useNavigate();
  const { activeProfileId, loading: profileLoading } = useProfile();
  const [auth, setAuth] = useState(readAuth);
  const context: ReportSubmissionContext = { ...auth, profileId: activeProfileId || '' };
  const owner = JSON.stringify([context.accountId, context.token, context.profileId, profileLoading]);
  const key = requestKey(context);
  const ready = Boolean(context.accountId && context.token && context.profileId && !profileLoading);
  const scope = JSON.stringify([owner, subject, windowDays, isReadEnabled(subject)]);
  const [eligibilityResult, setEligibility] = useState<{ scope: string; value?: ReportEligibility; dates?: ReportWindowDates; loading: boolean }>({ scope: '', loading: true });
  const [recovery, setRecovery] = useState<RecoveryState>({ key: '', error: '', blocked: false, busy: false });
  const runtime = useRef({ mounted: false, generation: 0, controller: new AbortController(), busy: false });
  const current = useRef({ owner, scope, context, key, ready, subject, windowDays, isReadEnabled, eligibilityResult });
  useLayoutEffect(() => { current.current = { owner, scope, context, key, ready, subject, windowDays, isReadEnabled, eligibilityResult }; });
  const publishRecovery = useCallback((value: RecoveryState) => setRecovery(value), []);
  const live = useCallback((capturedOwner: string, generation: number, captured: ReportSubmissionContext) => {
    const storedProfile = localStorage.getItem('active_profile_id');
    return runtime.current.mounted && runtime.current.generation === generation && current.current.owner === capturedOwner && current.current.ready && localStorage.getItem('user_id') === captured.accountId && localStorage.getItem('access_token') === captured.token && (!storedProfile || storedProfile === captured.profileId);
  }, []);

  useEffect(() => {
    const sync = () => setAuth(readAuth());
    window.addEventListener('auth:changed', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('auth:changed', sync); window.removeEventListener('storage', sync); };
  }, []);

  useEffect(() => {
    runtime.current.controller.abort();
    runtime.current = { mounted: true, generation: runtime.current.generation + 1, controller: new AbortController(), busy: false };
    const snapshot = current.current;
    try {
      const request = snapshot.ready ? readPending(snapshot.key, snapshot.context) : undefined;
      publishRecovery({ key: snapshot.key, request, blocked: Boolean(request?.blocked), busy: false, error: request?.blocked ? '已有请求发生冲突，请联系支持，不会创建新请求。' : request ? '上次提交尚未确认，请重试已有请求。' : '' });
    } catch {
      publishRecovery({ key: snapshot.key, error: '无法读取已有请求，暂不可创建新报告。', blocked: true, busy: false });
    }
    return () => { runtime.current.mounted = false; ++runtime.current.generation; runtime.current.controller.abort(); };
  }, [owner, publishRecovery]);

  useEffect(() => {
    const snapshot = current.current;
    const generation = runtime.current.generation;
    const controller = new AbortController();
    const valid = () => !controller.signal.aborted && current.current.scope === snapshot.scope && live(snapshot.owner, generation, snapshot.context);
    if (snapshot.ready && snapshot.isReadEnabled(snapshot.subject)) {
      const dates = reportWindowDates(snapshot.windowDays);
      void reportSubmissionService.eligibility({ subject: snapshot.subject, window_days: snapshot.windowDays, content_version: PARENT_REPORT_VERSION, ...dates }, snapshot.context, controller.signal, valid)
        .then(value => { if (valid()) setEligibility({ scope: snapshot.scope, value, dates, loading: false }); })
        .catch(() => { if (valid()) setEligibility({ scope: snapshot.scope, loading: false }); });
    }
    return () => controller.abort();
  }, [scope, live]);

  const submit = useCallback(async () => {
    const snapshot = current.current;
    const generation = runtime.current.generation;
    const valid = () => live(snapshot.owner, generation, snapshot.context);
    if (runtime.current.busy || !valid()) return;
    runtime.current.busy = true;
    let pending: PendingRequest | undefined;
    try {
      pending = readPending(snapshot.key, snapshot.context);
      if (pending?.blocked) { runtime.current.busy = false; return; }
      if (pending) {
        if (!snapshot.isReadEnabled(pending.input.subject)) { runtime.current.busy = false; return; }
      } else {
        if (snapshot.eligibilityResult.scope !== snapshot.scope || snapshot.eligibilityResult.value?.eligible !== true || !snapshot.eligibilityResult.dates || !snapshot.isReadEnabled(snapshot.subject)) { runtime.current.busy = false; return; }
        const created = { accountId: snapshot.context.accountId, profileId: snapshot.context.profileId, input: { subject: snapshot.subject, window_days: snapshot.windowDays, content_version: PARENT_REPORT_VERSION, client_request_id: crypto.randomUUID(), ...snapshot.eligibilityResult.dates } };
        // Persist before dispatch so reload/unmount cannot turn uncertain acceptance into a new job.
        window.sessionStorage.setItem(snapshot.key, JSON.stringify(created));
        pending = created;
      }
      publishRecovery({ key: snapshot.key, request: pending, error: '', blocked: false, busy: true });
      const jobId = await reportSubmissionService.submit(pending.input, snapshot.context, runtime.current.controller.signal, valid);
      if (!valid()) return;
      try { window.sessionStorage.removeItem(snapshot.key); } catch { /* A remaining record safely replays this job. */ }
      try {
        localStorage.setItem('active_report_job_id', jobId);
        localStorage.removeItem('active_report_id');
      } catch { /* Navigation does not depend on the optional home-page shortcut. */ }
      navigate(`/report-generating/${encodeURIComponent(jobId)}`);
    } catch (error) {
      if (!valid()) return;
      const status = (error as { response?: { status?: number } }).response?.status;
      const conflict = status === 409;
      const definitive = status !== undefined && [400, 403, 404, 422].includes(status);
      if (conflict && pending) {
        pending = { ...pending, blocked: true };
        try { window.sessionStorage.setItem(snapshot.key, JSON.stringify(pending)); } catch { /* Keep the same request locked in this view. */ }
      } else if (definitive) {
        try { window.sessionStorage.removeItem(snapshot.key); pending = undefined; } catch { /* Retain the original request if clearing storage fails. */ }
      }
      runtime.current.busy = false;
      publishRecovery({ key: snapshot.key, request: pending, busy: false, blocked: conflict || !pending && !definitive, error: conflict ? '已有请求发生冲突，请联系支持，不会创建新请求。' : definitive ? '报告请求未被接受，请检查资格后再试。' : pending ? '提交结果尚未确认，请重试已有请求。' : '无法保存请求，暂不可提交报告。' });
    }
  }, [live, navigate, publishRecovery]);

  const visibleRecovery = recovery.key === key ? recovery : undefined;
  const eligibility = eligibilityResult.scope === scope ? eligibilityResult.value : undefined;
  const eligibilityLoading = !ready || eligibilityResult.scope !== scope || eligibilityResult.loading;
  const pendingRequest = visibleRecovery?.request?.input;
  const canSubmit = ready && Boolean(visibleRecovery) && !visibleRecovery?.busy && !visibleRecovery?.blocked && (pendingRequest ? isReadEnabled(pendingRequest.subject) : !eligibilityLoading && eligibility?.eligible === true && isReadEnabled(subject));
  return { eligibility, eligibilityLoading, pendingRequest, busy: visibleRecovery?.busy || false, error: visibleRecovery?.error || '', canSubmit, submit };
}
