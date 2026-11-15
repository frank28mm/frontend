import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubmissions } from '@/hooks/useAppSWR';
import type { CapabilitySubject, SubmissionItem } from '@/services/types';
import { HomeFab } from '@/components/ui/HomeButton';
import { useToast } from '@/components/ui/Toast';
import { isCapabilitySubject, isScienceSubject, subjectOption, SUBJECT_OPTIONS } from '@/config/subjects';
import { useSubjectCapabilities } from '@/hooks/useSubjectCapabilities';
import { performanceLevelFromSummary } from '@/utils/performanceRating';

type SubjectFilter = 'all' | CapabilitySubject;

const formatTime = (value?: string) => {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

const toDisplayId = (submissionId: string) => {
  if (!submissionId) return '#--';
  return `#${submissionId.slice(-6)}`;
};

const toDayKey = (value?: string) => {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDayHeader = (dayKey: string) => {
  if (!dayKey) return '';
  const dt = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return dayKey;
  const today = new Date();
  const todayKey = toDayKey(today.toISOString());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = toDayKey(yesterday.toISOString());
  const month = String(dt.getMonth() + 1);
  const day = String(dt.getDate());
  if (dayKey === todayKey) return `今天 ${month}月${day}日`;
  if (dayKey === yesterdayKey) return `昨天 ${month}月${day}日`;
  return `${month}月${day}日`;
};

const subjectName = (subject?: string) => subjectOption(subject).label;
const subjectIcon = (subject?: string) => subjectOption(subject).icon;

const localDayUTCRange = (dayKey: string | null) => {
  if (!dayKey) return { from: undefined, before: undefined };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return { from: undefined, before: undefined };

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const from = new Date(year, month, day);
  if (
    from.getFullYear() !== year ||
    from.getMonth() !== month ||
    from.getDate() !== day
  ) {
    return { from: undefined, before: undefined };
  }
  const before = new Date(year, month, day + 1);
  return { from: from.toISOString(), before: before.toISOString() };
};

const History: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { loading: capabilitiesLoading, isReadEnabled } = useSubjectCapabilities();
  const [filterOpen, setFilterOpen] = useState(false);
  const [subject, setSubject] = useState<SubjectFilter>('all');
  const [dayFilterKey, setDayFilterKey] = useState<string | null>(null);

  const [draftSubject, setDraftSubject] = useState<CapabilitySubject>('math');
  const [draftSubjectTouched, setDraftSubjectTouched] = useState(false);
  const [draftDayKey, setDraftDayKey] = useState<string | null>(null);
  const [draftMonth, setDraftMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const dateRange = useMemo(() => localDayUTCRange(dayFilterKey), [dayFilterKey]);
  const {
    data,
    isLoading: loading,
    isLoadingMore,
    hasMore,
    error: swrError,
    loadMore,
    mutate,
  } = useSubmissions({
    subject: subject !== 'all' ? subject : undefined,
    from: dateRange.from,
    before: dateRange.before,
  });
  const items = useMemo(
    () => (data?.items ?? []).filter((item) => {
      const itemSubject = String(item.subject || '').trim().toLowerCase();
      if (capabilitiesLoading && isScienceSubject(itemSubject)) return false;
      return !isCapabilitySubject(itemSubject) || isReadEnabled(itemSubject);
    }),
    [capabilitiesLoading, data?.items, isReadEnabled],
  );
  const error = swrError ? '加载失败' : null;
  const listLoading = loading || capabilitiesLoading;

  useEffect(() => {
    const checkDirtySubmissions = () => {
      const dirtyKeys = Object.keys(localStorage)
        .filter((key) => key.startsWith('submission_dirty_'))
        .map((key) => key.replace('submission_dirty_', ''));

      if (dirtyKeys.length > 0) {
        dirtyKeys.forEach((key) => {
          try {
            localStorage.removeItem(`submission_dirty_${key}`);
          } catch {
            // ignore
          }
        });
        mutate();
      }
    };

    checkDirtySubmissions();

    const handleFocus = () => checkDirtySubmissions();
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [mutate]);

  useEffect(() => {
    if (location.state?.refresh) {
      mutate();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, mutate]);

  useEffect(() => {
    if (!filterOpen) return;
    const targetSubject = subject !== 'all' && isReadEnabled(subject) ? subject : 'math';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftSubject(targetSubject);
    setDraftSubjectTouched(false);
    setDraftDayKey(dayFilterKey);
    const base = dayFilterKey ? new Date(`${dayFilterKey}T00:00:00`) : new Date();
    if (!Number.isNaN(base.getTime())) {
      const targetMonth = new Date(base.getFullYear(), base.getMonth(), 1);
      setDraftMonth(targetMonth);
    }
  }, [filterOpen, subject, dayFilterKey, isReadEnabled]);

  const summaryText = (item: SubmissionItem) => {
    const total = item.summary?.total_items ?? 0;
    const wrong = item.summary?.wrong_count ?? 0;
    const uncertain = item.summary?.uncertain_count ?? 0;
    return `共${total}题 · 错${wrong} · 待定${uncertain}`;
  };

  const groups = useMemo(() => {
    const map: Record<string, SubmissionItem[]> = {};
    items.forEach((it) => {
      const key = toDayKey(it.created_at) || 'unknown';
      map[key] = map[key] || [];
      map[key].push(it);
    });
    const keys = Object.keys(map).sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => ({
      dayKey: k,
      label: k === 'unknown' ? '更早' : formatDayHeader(k),
      items: (map[k] || []).sort((a, b) => (String(b.created_at || '')).localeCompare(String(a.created_at || ''))),
    }));
  }, [items]);

  return (
    <div
      className="relative flex h-[100dvh] w-full flex-col max-w-md mx-auto bg-neu-bg text-neu-text transition-colors duration-200 antialiased overflow-x-hidden"
      style={{ touchAction: 'pan-y', overscrollBehaviorX: 'none' }}
    >
      <header className="shrink-0 z-30 flex items-center justify-center px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 bg-neu-bg/90 backdrop-blur-sm relative">
        <h1 className="text-xl font-bold text-neu-text-secondary tracking-tight">历史记录</h1>
        <button
          onClick={() => setFilterOpen(true)}
          className="absolute right-6 h-10 w-10 rounded-full flex items-center justify-center shadow-neu-icon-btn active:shadow-neu-pressed transition-all duration-300 bg-neu-bg z-40"
        >
          <span className="material-symbols-outlined text-neu-text-secondary" style={{ fontSize: '20px' }}>tune</span>
        </button>
      </header>

      <main
        className="flex-1 px-6 overflow-y-auto overflow-x-hidden no-scrollbar pb-[max(6rem,env(safe-area-inset-bottom))]"
        style={{ touchAction: 'pan-y', overscrollBehaviorX: 'none' }}
      >
        {listLoading && <div className="text-sm text-gray-400 text-center mt-6">加载中...</div>}
        {error && <div className="text-sm text-red-500 text-center mt-6">{error}</div>}
        {!listLoading && !groups.length && <div className="text-sm text-gray-400 text-center mt-6">暂无数据</div>}

        <div className="relative mb-8">
          <div className="absolute left-5 top-10 bottom-0 w-1 rounded-full bg-neu-bg shadow-neu-pressed-sm"></div>

          {groups.map((group) => (
            <div key={group.dayKey} className="relative mb-10">
              <div className="flex items-center mb-6 relative z-10">
                <div className="w-10 flex justify-center">
                  <div className="h-4 w-4 rounded-full bg-neu-bg border-2 border-primary shadow-neu-flat-sm"></div>
                </div>
                <h2 className="ml-2 text-sm font-bold text-neu-text-secondary uppercase tracking-widest">
                  {group.label}
                </h2>
              </div>

              <div className="pl-12 space-y-5">
                {group.items.map((item) => {
                  const rid = performanceLevelFromSummary(item.summary);
                  return (
                    <div
                      key={item.submission_id}
                      onClick={() => navigate(`/history/${item.submission_id}`, { state: { from: 'history' } })}
                      className="relative group rounded-2xl bg-neu-bg shadow-neu-flat p-5 flex flex-col gap-2 active:scale-[0.98] transition-transform duration-200 cursor-pointer border border-white/40"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="h-12 w-12 rounded-full flex items-center justify-center text-neu-text-secondary shrink-0">
                            <span className="material-symbols-outlined">{subjectIcon(item.subject)}</span>
                          </div>
                          <div className="min-w-0 flex-1 bg-neu-bg shadow-neu-pressed rounded-xl px-4 py-2">
                            <h3 className="font-bold text-neu-text text-base">{subjectName(item.subject)}</h3>
                            <div className="flex items-center gap-2 text-xs text-[#DC143C] mt-1 font-medium">
                              <span>{toDisplayId(item.submission_id)}</span>
                              <span className="w-1 h-1 rounded-full bg-[#DC143C]/50"></span>
                              <span>{formatTime(item.created_at) || '--:--'}</span>
                            </div>
                          </div>
                        </div>

                        {rid && (
                          <div className="h-8 w-8 rounded-full bg-neu-bg shadow-neu-pressed flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-success">{rid}</span>
                          </div>
                        )}
                      </div>

                      <div className="pl-16 min-w-0">
                        <div className="text-[10px] text-neu-text-secondary truncate">
                          {summaryText(item)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {!loading && hasMore && (
            <div className="relative z-10 flex justify-center pl-10 pb-4">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={isLoadingMore}
                aria-label={isLoadingMore ? '正在加载更早记录' : '加载更早'}
                className="min-w-36 h-12 px-5 rounded-2xl bg-neu-bg shadow-neu-flat-sm active:shadow-neu-pressed transition-all duration-200 flex items-center justify-center gap-2 text-sm font-bold text-neu-text-secondary disabled:opacity-50"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-lg">history</span>
                <span>{isLoadingMore ? '加载中...' : '加载更早'}</span>
              </button>
            </div>
          )}
        </div>
      </main>

      {filterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-neu-bg/60 backdrop-blur-[6px]"></div>
          <div className="relative w-full max-w-[340px] bg-neu-popup rounded-[40px] shadow-popup-base pt-20 px-6 pb-6 flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-300">
            <button
              onClick={() => setFilterOpen(false)}
              className="absolute top-5 left-6 w-10 h-10 rounded-full bg-neu-popup shadow-popup-flat flex items-center justify-center text-neu-text-secondary active:shadow-popup-pressed transition-all duration-200 z-50"
            >
              <span className="material-symbols-outlined font-bold text-lg">close</span>
            </button>

            <div className="grid w-full grid-cols-2 gap-3 rounded-2xl bg-neu-popup p-2 shadow-popup-pressed select-none">
              {SUBJECT_OPTIONS.map((option) => {
                const active = draftSubject === option.id;
                const enabled = isReadEnabled(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    aria-disabled={!enabled}
                    onClick={() => {
                      if (!enabled) {
                        showToast(`${option.label}入口已暂时关闭`, 'info');
                        return;
                      }
                      setDraftSubjectTouched(true);
                      setDraftSubject(option.id);
                    }}
                    className={`h-12 rounded-xl text-base font-bold transition-all ${
                      active
                        ? 'bg-neu-popup text-neu-text shadow-[5px_5px_10px_#cbd0d6,-5px_-5px_10px_#ffffff,0_0_15px_rgba(59,130,246,0.3)]'
                        : 'text-neu-text-secondary'
                    } ${enabled ? '' : 'cursor-not-allowed opacity-50'}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-5 select-none">
              <div className="flex items-center justify-between px-2">
                <button
                  type="button"
                  onClick={() => setDraftMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  className="w-10 h-10 rounded-full bg-neu-popup shadow-popup-flat flex items-center justify-center text-neu-text-secondary active:shadow-popup-pressed transition-all duration-200"
                >
                  <span className="material-symbols-outlined text-sm font-bold">arrow_back_ios_new</span>
                </button>
                <div className="text-neu-text font-bold text-lg tracking-widest">
                  {draftMonth.getFullYear()}年 {draftMonth.getMonth() + 1}月
                </div>
                <button
                  type="button"
                  onClick={() => setDraftMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  className="w-10 h-10 rounded-full bg-neu-popup shadow-popup-flat flex items-center justify-center text-neu-text-secondary active:shadow-popup-pressed transition-all duration-200"
                >
                  <span className="material-symbols-outlined text-sm font-bold">arrow_forward_ios</span>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-y-4 gap-x-2 text-center">
                {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
                  <div
                    key={w}
                    className={`text-[10px] font-medium pb-2 ${
                      w === '日' || w === '六' ? 'text-[#E11D48]' : 'text-neu-text-secondary'
                    }`}
                  >
                    {w}
                  </div>
                ))}

                {(() => {
                  const y = draftMonth.getFullYear();
                  const m = draftMonth.getMonth();
                  const first = new Date(y, m, 1);
                  // Monday-first calendar: shift JS (Sun=0) to (Mon=0)
                  const start = (first.getDay() + 6) % 7;
                  const days = new Date(y, m + 1, 0).getDate();
                  const cells: Array<number | null> = [];
                  for (let i = 0; i < start; i += 1) cells.push(null);
                  for (let d = 1; d <= days; d += 1) cells.push(d);
                  while (cells.length % 7 !== 0) cells.push(null);

                  return cells.map((d, idx) => {
                    if (!d) return <div key={`empty-${idx}`} className="h-10 w-10"></div>;
                    const dayKey = toDayKey(new Date(y, m, d).toISOString());
                    const selected = draftDayKey === dayKey;
                    return (
                      <button
                        type="button"
                        key={dayKey}
                        onClick={() => setDraftDayKey((prev) => (prev === dayKey ? null : dayKey))}
                        className={
                          selected
                            ? 'h-10 w-10 mx-auto flex items-center justify-center rounded-2xl bg-neu-popup shadow-popup-pressed-deep cursor-pointer relative'
                            : 'group h-10 w-10 mx-auto flex items-center justify-center rounded-2xl bg-neu-popup shadow-popup-flat-sm text-neu-text-secondary text-xs active:shadow-popup-pressed cursor-pointer transition-all'
                        }
                      >
                        <span
                          className={
                            selected
                              ? 'text-[#E11D48] font-bold text-base drop-shadow-[0_0_5px_rgba(225,29,72,0.6)]'
                              : undefined
                          }
                        >
                          {d}
                        </span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSubject(draftSubjectTouched ? draftSubject : subject);
                setDayFilterKey(draftDayKey);
                setFilterOpen(false);
              }}
              className="w-full h-14 rounded-2xl bg-neu-popup shadow-popup-flat flex items-center justify-center gap-2 text-[#E11D48] active:shadow-popup-pressed transition-all active:scale-[0.98] group"
            >
              <span className="font-bold text-lg tracking-wider group-active:translate-y-px">确认</span>
            </button>
          </div>
        </div>
      )}

      {!filterOpen && <HomeFab to="/" />}
    </div>
  );
};

export default History;
