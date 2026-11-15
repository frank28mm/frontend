import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReports } from '@/hooks/useAppSWR';
import type { CapabilitySubject, ReportListItem, ReportListResponse } from '@/services/types';
import { HomeFab } from '@/components/ui/HomeButton';
import { BackButton } from '@/components/ui/BackButton';
import { isCapabilitySubject, isScienceSubject, subjectOption } from '@/config/subjects';
import { useSubjectCapabilities } from '@/hooks/useSubjectCapabilities';

const toDisplayId = (reportId: string) => {
    if (!reportId) return '#--';
    return `#${reportId.slice(-6)}`;
};

const toDateKey = (createdAt?: string) => {
    if (!createdAt) return 'unknown';
    return createdAt.slice(0, 10);
};

const toDisplayDate = (createdAt?: string) => {
    const dateKey = toDateKey(createdAt);
    if (!dateKey || dateKey === 'unknown') return '';
    return dateKey.replaceAll('-', '.');
};

const reportSubject = (item: ReportListItem): CapabilitySubject | null => {
    const directSubject = String(item.subject || '').trim().toLowerCase();
    if (isCapabilitySubject(directSubject)) return directSubject;
    const paramsSubject = String(item.params?.subject || '').trim().toLowerCase();
    return isCapabilitySubject(paramsSubject) ? paramsSubject : null;
};

const ReportHistory: React.FC = () => {
    const navigate = useNavigate();
    const { data, isLoading: loading } = useReports();
    const { loading: capabilitiesLoading, isReadEnabled } = useSubjectCapabilities();
    const items = useMemo(
        () => (data?.items || []).filter((item) => {
            const subject = reportSubject(item);
            if (capabilitiesLoading && isScienceSubject(subject)) return false;
            return !subject || isReadEnabled(subject);
        }),
        [capabilitiesLoading, data?.items, isReadEnabled],
    );
    const listLoading = loading || capabilitiesLoading;

    const groups = useMemo(() => {
        const map = new Map<string, ReportListResponse['items']>();

        for (const item of items) {
            const dateKey = toDateKey(item.created_at);
            const list = map.get(dateKey);
            if (list) list.push(item);
            else map.set(dateKey, [item]);
        }

        const sorted = [...map.entries()].sort(([a], [b]) => {
            const left = a === 'unknown' ? '' : a;
            const right = b === 'unknown' ? '' : b;
            return right.localeCompare(left);
        });
        return sorted.map(([dateKey, list]) => ({
            dateKey,
            items: [...list].sort((left, right) =>
                (right.created_at || '').localeCompare(left.created_at || ''),
            ),
        }));
    }, [items]);

    return (
        <div
            className="relative flex h-[100dvh] w-full flex-col max-w-md mx-auto bg-neu-bg pb-24 text-neu-text transition-colors duration-200 antialiased overflow-hidden"
            style={{ touchAction: 'pan-y', overscrollBehaviorX: 'none' }}
        >
            <header className="sticky top-0 shrink-0 z-30 flex items-center justify-center px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 bg-neu-bg/90 backdrop-blur-sm relative">
                <div className="absolute left-6">
                    <BackButton onClick={() => navigate(-1)} />
                </div>
                <h1 className="text-xl font-bold text-neu-text-secondary tracking-tight">报告记录</h1>
            </header>

            <main
                className="flex-1 min-h-0 px-6 overflow-y-auto overflow-x-hidden no-scrollbar pb-10"
                style={{ touchAction: 'pan-y', overscrollBehaviorX: 'none' }}
            >
                {listLoading && (
                  <div className="text-sm text-gray-400 text-center mt-6">加载中...</div>
                )}
                {!listLoading && !items.length && (
                  <div className="text-sm text-gray-400 text-center mt-6">暂无数据</div>
                )}

                {groups.map((group) => (
                    <div key={group.dateKey} className="relative mb-8">
                        <div className="absolute left-5 top-5 -bottom-5 w-1 rounded-full bg-neu-bg shadow-[inset_1px_1px_2px_#d1d0d0,inset_-1px_-1px_2px_#ffffff]"></div>

                        <div className="space-y-5 pl-12 pt-2">
                            {group.items.map((item) => {
                                const reportId = item.report_id || (item as { id?: string }).id || item.report_id;
                                const subject = reportSubject(item);
                                const subjectMeta = subject ? subjectOption(subject) : null;
                                return (
                                    <div
                                        key={reportId}
                                        data-report-subject={subject || 'unknown'}
                                        onClick={() => {
                                            if (subject) {
                                                navigate(`/report/${reportId}`, { state: { subject } });
                                                return;
                                            }
                                            navigate(`/report/${reportId}`);
                                        }}
                                        className="relative group rounded-2xl bg-neu-bg shadow-neu-flat p-4 flex items-center justify-between gap-3 active:scale-[0.98] transition-transform duration-200 cursor-pointer"
                                    >
                                        <div className="flex-1 bg-neu-bg shadow-neu-pressed rounded-xl px-4 py-3">
                                            <div className="flex min-w-0 items-start justify-between gap-3">
                                                <h3 className="min-w-0 font-bold text-neu-text text-sm">{item.title || '学情报告'}</h3>
                                                {subjectMeta && (
                                                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-neu-text-secondary">
                                                        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">{subjectMeta.icon}</span>
                                                        {subjectMeta.label}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-[#DC143C] mt-1 font-medium">
                                                <span>{toDisplayId(reportId)}</span>
                                                <span className="w-1 h-1 rounded-full bg-[#DC143C]/50"></span>
                                                <span>{toDisplayDate(item.created_at)}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center justify-center shrink-0">
                                            <div className="h-10 w-10 rounded-full bg-neu-bg shadow-neu-pressed flex items-center justify-center text-neu-text-secondary group-hover:text-primary transition-colors">
                                                <span className="material-symbols-outlined text-[20px]">visibility</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </main>

            <HomeFab to="/" />
        </div>
    );
};

export default ReportHistory;
