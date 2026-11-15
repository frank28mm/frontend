import { useEffect, useLayoutEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { plansService, validPlanId, type PlanDetail, type PlanSummary } from '@/services/plans';
import { validReportProfileId } from '@/services/reportNavigationScope';

function parseScope(search: string, detail: boolean) {
  const params = new URLSearchParams(search);
  const profiles = params.getAll('profileId');
  const versions = params.getAll('version');
  const profileId = profiles[0];
  const version = versions.length ? Number(versions[0]) : 0;
  const valid = [...params.keys()].every(key => key === 'profileId' || detail && key === 'version') &&
    profiles.length <= 1 && (profileId === undefined || validReportProfileId(profileId)) &&
    versions.length <= 1 && (!versions.length || /^[1-9]\d*$/.test(versions[0]) && Number.isSafeInteger(version) && version <= 1000000);
  return { profileId, version, valid };
}

type Result = {
  scopeKey: string; requestKey: string; items: PlanSummary[]; detail?: PlanDetail;
  versionScopeKey: string; knownVersion: number;
  nextOffset: number; hasMore: boolean; error: string;
};

const authStorageChanged = (event: StorageEvent) => event.key === null || event.key === 'user_id' || event.key === 'access_token';
function savedPlanError(error: unknown): string {
  if (isAxiosError(error) && [404, 403].includes(error.response?.status || 0)) return '方案不存在或暂不可用。';
  if (isAxiosError(error) && error.response?.status === 401) return '请登录后查看保存的复习方案。';
  if (error instanceof Error && ['UNSUPPORTED_PLAN_CONTRACT', 'INVALID_PLAN_LIST', 'INVALID_SAVED_PLAN'].includes(error.message)) {
    return '保存的方案数据不兼容，暂无法展示。';
  }
  return '无法读取保存的复习方案，请重试。';
}

// Scope is URL-owned, not the globally selected child. Each effect owns its abort/fence.
export function useSavedPlans(mode: 'list' | 'detail', search: string, id = '') {
  const { profileId, version, valid: queryValid } = parseScope(search, mode === 'detail');
  const valid = queryValid && (mode !== 'detail' || validPlanId(id));
  const accountId = localStorage.getItem('user_id') || '';
  const token = localStorage.getItem('access_token') || '';
  const [authEpoch, setAuthEpoch] = useState(0);
  const [action, setAction] = useState({ scopeKey: '', offset: 0, attempt: 0 });
  const [result, setResult] = useState<Result>();
  const scopeKey = JSON.stringify([mode, id, search, accountId, token, authEpoch]);
  const versionScopeKey = JSON.stringify([mode, id, profileId, accountId, token, authEpoch]);
  const offset = action.scopeKey === scopeKey ? action.offset : 0;
  const attempt = action.scopeKey === scopeKey ? action.attempt : 0;
  const requestKey = JSON.stringify([scopeKey, offset, attempt]);

  useEffect(() => {
    const changed = () => setAuthEpoch(epoch => epoch + 1);
    const storageChanged = (event: StorageEvent) => { if (authStorageChanged(event)) changed(); };
    window.addEventListener('auth:changed', changed);
    window.addEventListener('storage', storageChanged);
    return () => { window.removeEventListener('auth:changed', changed); window.removeEventListener('storage', storageChanged); };
  }, []);

  useLayoutEffect(() => {
    if (!valid || !accountId || !token) return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    const storageChanged = (event: StorageEvent) => { if (authStorageChanged(event)) abort(); };
    window.addEventListener('auth:changed', abort);
    window.addEventListener('storage', storageChanged);
    const isCurrent = () => !controller.signal.aborted && localStorage.getItem('user_id') === accountId && localStorage.getItem('access_token') === token;
    const context = { accountId, token, isCurrent };
    const pending = mode === 'list'
      ? plansService.list(context, profileId, offset, controller.signal)
      : plansService.detail(id, version, context, profileId, controller.signal);
    pending.then(value => {
      if (!isCurrent()) return;
      setResult(previous => {
        const page = mode === 'list' ? value as PlanSummary[] : [];
        const prior = offset > 0 && previous?.scopeKey === scopeKey ? previous.items : [];
        const items = [...new Map([...prior, ...page].map(item => [item.plan_id, item])).values()];
        const detail = mode === 'detail' ? value as PlanDetail : undefined;
        const knownVersion = Math.max(detail?.version || 0, previous?.versionScopeKey === versionScopeKey ? previous.knownVersion : 0);
        return { scopeKey, requestKey, items, detail, versionScopeKey, knownVersion,
          nextOffset: offset + page.length, hasMore: mode === 'list' && page.length === 20 && offset + page.length <= 1000000, error: '' };
      });
    }).catch(error => {
      if (!isCurrent()) return;
      setResult(previous => ({ scopeKey, requestKey,
        items: offset > 0 && previous?.scopeKey === scopeKey ? previous.items : [],
        versionScopeKey, knownVersion: previous?.versionScopeKey === versionScopeKey ? previous.knownVersion : 0,
        nextOffset: offset, hasMore: mode === 'list', error: savedPlanError(error) }));
    });
    return () => { abort(); window.removeEventListener('auth:changed', abort); window.removeEventListener('storage', storageChanged); };
  }, [accountId, token, valid, mode, id, version, profileId, offset, requestKey, scopeKey, versionScopeKey]);

  const current = result?.scopeKey === scopeKey ? result : undefined;
  const completed = current?.requestKey === requestKey;
  const error = !valid ? '链接参数无效' : !accountId || !token ? '请登录后查看保存的复习方案。' : completed ? current.error : '';
  const loading = valid && Boolean(accountId && token) && !completed;
  return {
    items: current?.items || [], detail: completed ? current.detail : undefined,
    loading, error, hasMore: Boolean(current?.hasMore), profileId, version,
    knownVersion: result?.versionScopeKey === versionScopeKey ? result.knownVersion : 0,
    retry: () => setAction({ scopeKey, offset, attempt: attempt + 1 }),
    loadMore: () => { if (!loading && !error && current?.hasMore) setAction({ scopeKey, offset: current.nextOffset, attempt: 0 }); },
  };
}
