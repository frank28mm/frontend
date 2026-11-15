import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '@/services/api';
import type {
    CapabilitySubject,
    MistakeItem,
    MistakeListResponse,
    QuestionCard,
    SubmissionDetail,
} from '@/services/types';
import { HomeFab } from '@/components/ui/HomeButton';
import { BackButton } from '@/components/ui/BackButton';
import { QuestionText } from '@/components/ui/QuestionText';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import {
    isCapabilitySubject,
    subjectOption,
    usesCanonicalQuestionDetail,
} from '@/config/subjects';
import {
    getKnowledgeTagDisplayName,
    getKnowledgeTags,
} from '@/utils/knowledgeTags';
import { useKnowledgeTagTranslations } from '@/hooks/useKnowledgeTagTranslations';
import {
    resolveOwnedImageEvidence,
    type OwnedEvidenceClaim,
} from '@/utils/ownedEvidence';
import { buildQuestionPresentation } from '@/utils/questionPresentation';
import { useSubjectCapabilities } from '@/hooks/useSubjectCapabilities';

const toKey = (item: MistakeItem) => `${item.submission_id}:${item.item_id}`;
const SUBMISSION_DETAIL_CONCURRENCY = 4;

type CanonicalMistakeFields = {
    material_group_id?: unknown;
    evidence_refs?: unknown;
};

const stringValue = (value: unknown): string => String(value ?? '').trim();

const stringList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map(stringValue).filter(Boolean);
};

const recordValue = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;

const rawQuestion = (item: MistakeItem): Record<string, unknown> | null =>
    recordValue(item.raw);

const rawQuestionText = (item: MistakeItem): string => {
    const raw = rawQuestion(item);
    return stringValue(raw?.question_text || raw?.question_content || raw?.stem || raw?.prompt);
};

const rawQuestionSlice = (item: MistakeItem): string => {
    const raw = rawQuestion(item);
    return stringValue(
        raw?.review_slice_image_url ||
        raw?.question_slice_image_url ||
        raw?.figure_slice_image_url,
    );
};

const exactQuestion = (
    submission: SubmissionDetail | undefined,
    itemID: string,
): Record<string, unknown> | null =>
    submission?.questions?.find((question) => stringValue(question.item_id) === itemID) || null;

const extractItemToken = (raw: unknown): string | null => {
    const s0 = String(raw || '').trim();
    if (!s0) return null;
    let s = s0;
    try {
        s = decodeURIComponent(s0);
    } catch {
        // ignore
    }
    const m = s.match(/:q:([^/]+)$/);
    if (m && m[1]) return String(m[1]).trim() || null;
    if (s.startsWith('q:')) return String(s.slice(2)).trim() || null;
    return s;
};

const formatDateTime = (value?: string) => {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    const date = dt.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
};

const orderMistakesByPresentation = (
    items: MistakeItem[],
    submissions: Record<string, SubmissionDetail>,
): MistakeItem[] => {
    const orderedQueues = new Map<string, MistakeItem[]>();
    for (const submissionID of new Set(items.map((item) => item.submission_id))) {
        const submission = submissions[submissionID];
        if (!submission) continue;
        const presentation = buildQuestionPresentation(submission);
        if (presentation.source !== 'learning_artifacts_v1') continue;

        const rankByItemID = new Map(
            presentation.questions.map((question, index) => [question.item_id, index]),
        );
        const ranked = items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.submission_id === submissionID)
            .sort((left, right) => {
                const leftRank = rankByItemID.get(left.item.item_id);
                const rightRank = rankByItemID.get(right.item.item_id);
                if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
                if (leftRank !== undefined) return -1;
                if (rightRank !== undefined) return 1;
                return left.index - right.index;
            })
            .map(({ item }) => item);
        orderedQueues.set(submissionID, ranked);
    }

    return items.map((item) => orderedQueues.get(item.submission_id)?.shift() || item);
};

interface ReviewFlowLocationState {
  mode?: 'review' | 'all' | 'mastered';
  subject?: CapabilitySubject;
  tagId?: string;
  tagName?: string;
  taxonomyVersion?: string;
}

const ReviewFlow: React.FC = () => {
    const navigate = useNavigate();
    const { tag } = useParams();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search || '');
    const { language } = useLanguage();
    const { showToast } = useToast();
    const { loading: capabilitiesLoading, isReadEnabled } = useSubjectCapabilities();
    const state = location.state as ReviewFlowLocationState | null;
    const queryMode = searchParams.get('mode');
    const mode = state?.mode || (queryMode === 'mastered' ? 'mastered' : 'review');
    const querySubject = searchParams.get('subject');
    const requestedSubject = state?.subject || (isCapabilitySubject(querySubject) ? querySubject : 'math');
    const subject = requestedSubject;
    const subjectReadEnabled = isReadEnabled(subject);
    const subjectGatePending = capabilitiesLoading && !subjectReadEnabled;
    const selectedTagId = (state?.tagId || (tag ? decodeURIComponent(tag) : '')).trim();
    const queryTagName = (searchParams.get('tag_name') || '').trim();
    const taxonomyVersion = (state?.taxonomyVersion || searchParams.get('taxonomy_version') || '').trim();
    const [activeItems, setActiveItems] = useState<MistakeItem[]>([]);
    const [allItems, setAllItems] = useState<MistakeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [submissions, setSubmissions] = useState<Record<string, SubmissionDetail>>({});
    const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(() => new Set());
    const submissionsRef = useRef<Record<string, SubmissionDetail>>({});
    const detailQueueRef = useRef<string[]>([]);
    const pendingDetailIDsRef = useRef<Set<string>>(new Set());
    const activeDetailRequestsRef = useRef(0);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (capabilitiesLoading || subjectReadEnabled) return;
        const label = subjectOption(subject).label;
        showToast(`${label}入口已暂时关闭`, 'info');
        navigate('/data?subject=math', { replace: true });
    }, [capabilitiesLoading, navigate, showToast, subject, subjectReadEnabled]);

    useEffect(() => {
        if (subjectGatePending || !subjectReadEnabled) return;
        const load = async () => {
            setLoading(true);
            setLoadError(false);
            try {
                const params = {
                    subject,
                    knowledge_point_id: selectedTagId || undefined,
                    taxonomy_version: taxonomyVersion || undefined,
                    limit_submissions: 10000,
                };
                const [activeRes, allRes] = await Promise.all([
                    apiClient.get<MistakeListResponse>('/mistakes', { params }),
                    apiClient.get<MistakeListResponse>('/mistakes', { params: { ...params, include_excluded: true } }),
                ]);
                setActiveItems(activeRes.data.items || []);
                setAllItems(allRes.data.items || []);
            } catch (err) {
                console.error(err);
                setActiveItems([]);
                setAllItems([]);
                setLoadError(true);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [selectedTagId, subject, subjectGatePending, subjectReadEnabled, taxonomyVersion]);

    const filteredActive = useMemo(() => {
        return activeItems.filter((item) => (item.subject || 'math') === subject);
    }, [activeItems, subject]);

    const excludedItems = useMemo(() => {
        const activeKeys = new Set(filteredActive.map(toKey));
        return allItems
            .filter((item) => (item.subject || 'math') === subject)
            .filter((item) => !activeKeys.has(toKey(item)));
    }, [allItems, filteredActive, subject]);

    const sourceItems = useMemo(() => {
        return mode === 'mastered' ? excludedItems : filteredActive;
    }, [excludedItems, filteredActive, mode]);
    useKnowledgeTagTranslations(sourceItems, language);

    const items = useMemo(() => {
        return orderMistakesByPresentation(sourceItems, submissions);
    }, [sourceItems, submissions]);

    const selectedTagTitle = useMemo(() => {
        if (state?.tagName) return state.tagName;
        if (queryTagName) return queryTagName;
        if (!selectedTagId) return '分类';
        return selectedTagId;
    }, [queryTagName, selectedTagId, state?.tagName]);

    const submissionIDsKey = useMemo(() => Array.from(new Set(
        sourceItems.map((item) => item.submission_id).filter(Boolean),
    )).join('|'), [sourceItems]);

    useEffect(() => {
        const drainQueue = () => {
            while (
                mountedRef.current &&
                activeDetailRequestsRef.current < SUBMISSION_DETAIL_CONCURRENCY &&
                detailQueueRef.current.length > 0
            ) {
                const sid = detailQueueRef.current.shift();
                if (!sid) continue;
                if (submissionsRef.current[sid]) {
                    pendingDetailIDsRef.current.delete(sid);
                    continue;
                }

                activeDetailRequestsRef.current += 1;
                void apiClient.get<SubmissionDetail>(`/submissions/${sid}`)
                    .then((res) => {
                        if (!mountedRef.current) return;
                        setSubmissions((current) => {
                            if (current[sid]) return current;
                            const next = { ...current, [sid]: res.data };
                            submissionsRef.current = next;
                            return next;
                        });
                    })
                    .catch((err) => {
                        console.error(err);
                    })
                    .finally(() => {
                        activeDetailRequestsRef.current -= 1;
                        pendingDetailIDsRef.current.delete(sid);
                        drainQueue();
                    });
            }
        };

        const ids = Array.from(new Set(sourceItems.map((item) => item.submission_id).filter(Boolean)));
        for (const sid of ids) {
            if (submissionsRef.current[sid] || pendingDetailIDsRef.current.has(sid)) continue;
            pendingDetailIDsRef.current.add(sid);
            detailQueueRef.current.push(sid);
        }
        drainQueue();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submissionIDsKey]);

    const resolveCard = (item: MistakeItem): QuestionCard | null => {
        const sub = submissions[item.submission_id];
        const found = sub?.question_cards?.find((c) => c.item_id === item.item_id) || null;
        if (found) return found;
        if (usesCanonicalQuestionDetail(item.subject || subject)) return null;
        const token =
            extractItemToken(item.question_number) || extractItemToken(item.item_id);
        if (!token) return null;
        const foundByQn =
            sub?.question_cards?.find(
                (c) => String(c.question_number || '').trim() === String(token).trim()
            ) || null;
        if (foundByQn) return foundByQn;
        const foundByToken =
            sub?.question_cards?.find(
                (c) => extractItemToken(c.item_id) === token
            ) || null;
        if (foundByToken) return foundByToken;
        return null;
    };

    const resolveCanonicalQuestion = (item: MistakeItem): Record<string, unknown> | null =>
        exactQuestion(submissions[item.submission_id], stringValue(item.item_id));

    const resolveMaterialGroup = (item: MistakeItem) => {
        const sub = submissions[item.submission_id];
        const question = resolveCanonicalQuestion(item);
        const fields = item as MistakeItem & CanonicalMistakeFields;
        const groupID = stringValue(fields.material_group_id || question?.material_group_id);
        if (!groupID) return null;
        const group = sub?.material_groups?.find((entry) => entry.group_id === groupID) || null;
        if (!group || !group.item_ids.includes(item.item_id)) return null;
        return group;
    };

    const resolveGroupLabel = (item: MistakeItem): string => {
        if (!usesCanonicalQuestionDetail(item.subject || subject)) return '';
        const group = resolveMaterialGroup(item);
        if (!group) return '';
        return `题组 · ${stringValue(group.title) || group.group_id}`;
    };

    const resolveCanonicalThumb = (item: MistakeItem) => {
        const sub = submissions[item.submission_id];
        const question = resolveCanonicalQuestion(item);
        if (!sub || !question) return null;

        const fields = item as MistakeItem & CanonicalMistakeFields;
        const optionRefs = Array.isArray(question.options)
            ? question.options.flatMap((option) => stringList(recordValue(option)?.evidence_refs))
            : [];
        const questionRefs = Array.from(new Set([
            ...stringList(fields.evidence_refs),
            ...stringList(question.evidence_refs),
        ]));
        const claims: OwnedEvidenceClaim[] = [
            {
                evidenceRefs: questionRefs,
                ownerType: 'question',
                ownerId: item.item_id,
                allowedRoles: ['question'],
            },
            {
                evidenceRefs: optionRefs,
                ownerType: 'question',
                ownerId: item.item_id,
                allowedRoles: ['options'],
            },
        ];

        const group = resolveMaterialGroup(item);
        for (const material of group?.materials || []) {
            claims.push({
                evidenceRefs: material.evidence_refs,
                ownerType: 'material',
                ownerId: material.material_id,
                allowedRoles: ['material', 'instructions'],
            });
        }

        return resolveOwnedImageEvidence(sub.evidence_registry || [], claims)[0] || null;
    };

    const resolveThumb = (item: MistakeItem) => {
        if (usesCanonicalQuestionDetail(item.subject || subject)) {
            const owned = resolveCanonicalThumb(item);
            if (owned) {
                return {
                    url: owned.url,
                    identity: `${owned.evidence.evidence_id}:${owned.url}`,
                };
            }
            const rawSlice = rawQuestionSlice(item);
            return rawSlice ? { url: rawSlice, identity: `raw:${rawSlice}` } : null;
        }
        const rawSlice = rawQuestionSlice(item);
        if (rawSlice) return { url: rawSlice, identity: `raw:${rawSlice}` };
        const card = resolveCard(item);
        if (card?.review_slice_image_url) {
            return { url: card.review_slice_image_url, identity: card.review_slice_image_url };
        }
        const sub = submissions[item.submission_id];
        if (sub?.page_image_urls && typeof card?.page_index === 'number') {
            const url = sub.page_image_urls[card.page_index] || '';
            return url ? { url, identity: url } : null;
        }
        return null;
    };

    const resolveQuestionText = (item: MistakeItem): string => {
        const rawText = rawQuestionText(item);
        if (rawText) return rawText;
        if (usesCanonicalQuestionDetail(item.subject || subject)) {
            const question = resolveCanonicalQuestion(item);
            return stringValue(question?.question_text || question?.question_content) ||
                stringValue(resolveCard(item)?.question_content) ||
                stringValue(item.reason) ||
                '题目内容';
        }
        return stringValue(resolveCard(item)?.question_content || item.reason) || '题目内容';
    };

    const handleExclude = async (item: MistakeItem) => {
        try {
            await apiClient.post('/mistakes/exclusions', {
                submission_id: item.submission_id,
                item_id: item.item_id,
                reason: '已掌握',
            });
            try {
                localStorage.setItem(`submission_dirty_${item.submission_id}`, String(Date.now()));
            } catch {
                // ignore
            }
            setActiveItems((prev) => prev.filter((row) => toKey(row) !== toKey(item)));
        } catch (err) {
            console.error(err);
            alert('操作失败，请稍后重试');
        }
    };

    const handleRestore = async (item: MistakeItem) => {
        try {
            await apiClient.delete(
                `/mistakes/exclusions/${encodeURIComponent(item.submission_id)}/${encodeURIComponent(item.item_id)}`
            );
            try {
                localStorage.setItem(`submission_dirty_${item.submission_id}`, String(Date.now()));
            } catch {
                // ignore
            }
            setActiveItems((prev) => prev.some((row) => toKey(row) === toKey(item))
                ? prev
                : [...prev, item]);
        } catch (err) {
            console.error(err);
            alert('操作失败，请稍后重试');
        }
    };

    const openDetail = (item: MistakeItem) => {
        const card = resolveCard(item);
        navigate(`/question/${encodeURIComponent(item.item_id)}`, {
            state: {
                submissionId: item.submission_id,
                subject: item.subject || subject,
                knowledge_tags: getKnowledgeTags(item).map((tagItem) =>
                    getKnowledgeTagDisplayName(tagItem, language)
                ),
                card:
                    card ||
                    ({
                        item_id: item.item_id,
                        question_number: item.question_number || 'N/A',
                        page_index: 0,
                        question_content: resolveQuestionText(item),
                        verdict: 'incorrect',
                        reason: item.reason,
                    } as QuestionCard),
            },
        });
    };

    return (
        <div className="bg-[#EFEEEE] min-h-screen relative w-full max-w-md mx-auto flex flex-col antialiased font-sans text-[#363C4A]">
            <header className="pt-8 pb-4 px-6 flex flex-col z-20 sticky top-0 bg-[#EFEEEE]/95 backdrop-blur-md transition-all">
                <div className="flex items-center justify-between mb-6">
                    <BackButton onClick={() => navigate(-1)} />
                    <h1 className="text-xl font-bold tracking-tight text-[#363C4A] flex-1 text-center pr-10">{selectedTagTitle}</h1>
                </div>
                <div className="w-full py-2">
                    <div className="grid grid-cols-3 gap-3 p-1.5 rounded-full bg-[#EFEEEE] shadow-[inset_6px_6px_12px_#CFCFCF,inset_-6px_-6px_12px_#FFFFFF] w-full">
                        <button className="w-full py-2 rounded-full bg-[#EFEEEE] shadow-[-8px_-8px_20px_#FFFFFF,8px_8px_20px_#CFCFCF] text-[#363C4A] font-bold text-sm tracking-wide transition-all duration-300">
                            {mode === 'mastered' ? '已掌握' : '错题'}
                        </button>
                        <button className="w-full py-2 rounded-full text-[#9AA5B6] font-semibold text-sm tracking-wide transition-all duration-300">
                            {subjectOption(subject).label}
                        </button>
                        <button className="w-full py-2 rounded-full text-[#9AA5B6] font-semibold text-sm tracking-wide transition-all duration-300">
                            {items.length} 题
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center gap-8 px-4 pb-40 w-full max-w-lg mx-auto mt-4">
                {loading && <div className="text-sm text-gray-400">加载中...</div>}
                {!loading && loadError && <div className="text-sm text-red-400">数据加载失败</div>}
                {!loading && !loadError && !items.length && <div className="text-sm text-gray-400">暂无数据</div>}

                {items.map((item) => {
                    const thumbnail = resolveThumb(item);
                    const thumbnailKey = thumbnail
                        ? `${toKey(item)}:${thumbnail.identity}`
                        : '';
                    const thumbnailFailed = thumbnailKey
                        ? failedThumbnails.has(thumbnailKey)
                        : false;
                    const isEnglish = (item.subject || subject) === 'english';
                    const usesContainedEvidence = usesCanonicalQuestionDetail(item.subject || subject);
                    const questionNumber = stringValue(item.question_number || item.item_id);
                    const itemSubjectLabel = subjectOption(item.subject || subject).label;
                    const groupLabel = resolveGroupLabel(item);

                    return (
                        <div
                            key={toKey(item)}
                            data-testid="mistake-review-item"
                            className="w-[90%] flex flex-col p-5 bg-[#EFEEEE] rounded-[2rem] shadow-[-8px_-8px_20px_#FFFFFF,8px_8px_20px_#CFCFCF] transition-all duration-300 border border-white/50"
                        >
                        <div
                            onClick={() => openDetail(item)}
                            className="w-full aspect-[4/3] rounded-2xl bg-[#EFEEEE] shadow-[inset_10px_10px_20px_#CFCFCF,inset_-10px_-10px_20px_#FFFFFF] p-6 mb-5 relative overflow-hidden flex flex-col justify-center border border-white/20 cursor-pointer"
                        >
                            <div className="flex gap-4 items-start">
                                <div className="flex-1 min-w-0">
                                    {groupLabel && (
                                        <div className="mb-2 text-[10px] font-bold text-[#26A9DB] [overflow-wrap:anywhere]">
                                            {groupLabel}
                                        </div>
                                    )}
                                    {isEnglish ? (
                                        <div className="text-[#363c4a] text-[16px] leading-relaxed break-words whitespace-pre-wrap clamp-4 [overflow-wrap:anywhere]">
                                            {resolveQuestionText(item)}
                                        </div>
                                    ) : (
                                        <QuestionText
                                            as="div"
                                            className="font-serif text-[#363c4a] text-[16px] leading-relaxed break-words whitespace-pre-wrap clamp-4"
                                            text={resolveQuestionText(item)}
                                        />
                                    )}
                                    <div className="mt-3 text-[10px] text-[#9AA5B6] tracking-widest font-semibold">
                                        {formatDateTime(item.created_at)}
                                    </div>
                                </div>
                                {thumbnail && (
                                    <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-[-6px_-6px_12px_#FFFFFF,6px_6px_12px_#CFCFCF] border border-white/40 bg-[#EFEEEE] shrink-0">
                                        {thumbnailFailed ? (
                                            <div
                                                role="status"
                                                className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] leading-4 text-[#9AA5B6]"
                                            >
                                                题目图片暂不可用
                                            </div>
                                        ) : (
                                            <img
                                                alt={usesContainedEvidence ? `${itemSubjectLabel}题目 ${questionNumber} 图示` : '题目预览'}
                                                src={thumbnail.url}
                                                className={usesContainedEvidence
                                                    ? 'w-full h-full object-contain'
                                                    : 'w-full h-full object-cover mix-blend-multiply opacity-95'}
                                                onError={() => {
                                                    if (!thumbnailKey) return;
                                                    setFailedThumbnails((current) => {
                                                        const next = new Set(current);
                                                        next.add(thumbnailKey);
                                                        return next;
                                                    });
                                                }}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-between pl-2">
                            <div className="flex flex-col justify-center gap-2">
                                <div className="flex gap-2">
                                    {getKnowledgeTags(item).slice(0, 2).map((tagItem) => (
                                        <span key={tagItem.id} className="text-[10px] text-[#9AA5B6] px-3 py-1.5 rounded-lg bg-[#EFEEEE] shadow-[inset_2px_2px_4px_#CFCFCF,inset_-2px_-2px_4px_#FFFFFF] font-medium border border-white/30">
                                            {getKnowledgeTagDisplayName(tagItem, language)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={() => mode === 'mastered'
                                    ? handleRestore(item)
                                    : handleExclude(item)}
                                aria-label={mode === 'mastered' ? '恢复到错题' : '标记为已掌握'}
                                className={`size-16 rounded-full bg-[#EFEEEE] transition-all duration-300 font-black text-xl tracking-wider border border-white/40 ${
                                    mode === 'mastered'
                                        ? 'shadow-[-8px_-8px_20px_#FFFFFF,8px_8px_20px_#CFCFCF] text-[#4ADE80] hover:text-[#26A9DB]'
                                        : 'shadow-[-8px_-8px_20px_#FFFFFF,8px_8px_20px_#CFCFCF] text-[#9AA5B6] hover:text-[#26A9DB]'
                                }`}
                            >
                                {mode === 'mastered' ? '恢复' : 'OK'}
                            </button>
                        </div>
                        </div>
                    );
                })}
            </main>
            <HomeFab to="/" />
        </div>
    );
};

export default ReviewFlow;
