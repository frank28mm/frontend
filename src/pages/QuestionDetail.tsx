import { PRODUCT_IDENTITY } from "@/content/productIdentity";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/services/api';
import type { LearningQuestion, QuestionCard, SubmissionDetail, Verdict } from '@/services/types';
import { MaterialGroupDetail } from '@/components/learning/MaterialGroupDetail';
import { SimpleQuestionDetail } from '@/components/learning/SimpleQuestionDetail';
import { HomeFab } from '@/components/ui/HomeButton';
import { BackButton } from '@/components/ui/BackButton';
import { useToast } from '@/components/ui/Toast';
import { isCapabilitySubject, isScienceSubject, subjectOption, usesCanonicalQuestionDetail } from '@/config/subjects';
import { compareQuestionNumbers } from '@/utils/questionOrder';
import { useProfile } from '@/contexts/ProfileContext';
import { fetchSubmissionDetailWithProfiles } from '@/utils/submissionDetail';
import {
  buildQuestionPresentation,
  findMaterialGroupForItem,
  findQuestionByItemId,
  type PresentationQuestion,
} from '@/utils/questionPresentation';
import { resolveOwnedQuestionImageEvidence } from '@/utils/ownedEvidence';
import {
  isQuestionNavFilter,
  matchesQuestionNavFilter,
  normalizeQuestionNavItemIds,
  questionNavLabel,
  sortQuestionCardsByOrder,
  type QuestionNavigationState,
  type QuestionNavFilter,
} from '@/utils/questionNavigation';
import { useSubjectCapabilities } from '@/hooks/useSubjectCapabilities';

const extractQuestionNumberFromItemId = (raw: unknown): string | null => {
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
  return null;
};

const canDecodeImage = (url: string, timeoutMs = 8_000): Promise<boolean> =>
  new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutID);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timeoutID = window.setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });

interface ReloadedImage {
  ready: boolean;
  displayURL?: string;
  disposable?: boolean;
}

const decodeReloadedImage = async (url: string, timeoutMs = 8_000): Promise<ReloadedImage> => {
  if (typeof fetch !== 'function' || typeof URL.createObjectURL !== 'function') {
    const ready = await canDecodeImage(url, timeoutMs);
    return { ready, ...(ready ? { displayURL: url } : {}) };
  }
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) return { ready: false };
    const objectURL = URL.createObjectURL(await response.blob());
    const ready = await canDecodeImage(objectURL, timeoutMs);
    if (!ready) {
      URL.revokeObjectURL(objectURL);
      return { ready: false };
    }
    return { ready: true, displayURL: objectURL, disposable: true };
  } catch {
    const ready = await canDecodeImage(url, timeoutMs);
    return { ready, ...(ready ? { displayURL: url } : {}) };
  }
};

interface ReloadedImageOverride {
  sourceURL: string;
  displayURL: string;
}

const extractHttpStatus = (err: unknown): number | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  if (!('response' in err)) return undefined;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  if (!('status' in response)) return undefined;
  const status = (response as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

const extractHttpDetail = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  if (!('response' in err)) return undefined;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  if (!('data' in response)) return undefined;
  const data = (response as { data?: unknown }).data;
  if (typeof data === 'string') return data;
  if (typeof data !== 'object' || data === null) return undefined;
  if ('detail' in data) {
    const detail = (data as { detail?: unknown }).detail;
    return typeof detail === 'string' ? detail : undefined;
  }
  return undefined;
};

const isPlaceholderDetailText = (raw: unknown): boolean => {
  const s = String(raw || '').trim();
  if (!s) return true;
  return s.startsWith('（批改未完成') || s.startsWith('（未提取到');
};

const isLearningQuestion = (question: PresentationQuestion | undefined): question is LearningQuestion =>
  Boolean(
    question &&
      (question.display_mode === 'simple_question' || question.display_mode === 'material_group'),
  );

const summaryNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const updateSubmissionVerdict = (
  submission: SubmissionDetail,
  itemID: string,
  verdict: Verdict,
  summary?: unknown,
): SubmissionDetail => {
  const questionCards = (submission.question_cards || []).map((questionCard) =>
    questionCard.item_id === itemID ? { ...questionCard, verdict } : questionCard,
  );
  const questions = (submission.questions || []).map((question) =>
    String(question.item_id || '').trim() === itemID
      ? { ...question, verdict, verdict_source: 'manual' }
      : question,
  );
  const summaryRecord =
    summary && typeof summary === 'object' ? (summary as Record<string, unknown>) : null;
  const nextSummary = summaryRecord
    ? {
        ...(submission.summary || {}),
        total_items: summaryNumber(summaryRecord.total_items) ?? submission.summary?.total_items,
        wrong_count: summaryNumber(summaryRecord.wrong_count) ?? submission.summary?.wrong_count,
        uncertain_count:
          summaryNumber(summaryRecord.uncertain_count) ?? submission.summary?.uncertain_count,
        blank_count: summaryNumber(summaryRecord.blank_count) ?? submission.summary?.blank_count,
      }
    : submission.summary;
  return { ...submission, question_cards: questionCards, questions, summary: nextSummary };
};

interface QuestionDetailLocationState {
  submissionId?: string;
  subject?: string;
  card?: QuestionCard;
  questionNav?: QuestionNavigationState;
}

const QuestionDetail: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as QuestionDetailLocationState | null) || null;
  const [hasModified, setHasModified] = useState(false);
  const { id } = useParams();
  const decodedId = useMemo(() => {
    const raw = String(id || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [id]);
  const [searchParams] = useSearchParams();
  const submissionId = searchParams.get('submissionId') || locationState?.submissionId || '';
  const [card, setCard] = useState<QuestionCard | null>(locationState?.card || null);
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [rebuildPolling, setRebuildPolling] = useState(false);
  const [rebuildRunToken, setRebuildRunToken] = useState(0);
  const [questionImageRetryToken, setQuestionImageRetryToken] = useState(0);
  const [failedFigureSliceImageUrl, setFailedFigureSliceImageUrl] = useState<string | null>(null);
  const [failedCanonicalImageIDs, setFailedCanonicalImageIDs] = useState<Set<string>>(() => new Set());
  const [reloadedFigureImage, setReloadedFigureImage] = useState<ReloadedImageOverride | null>(null);
  const [reloadedCanonicalImages, setReloadedCanonicalImages] = useState<Record<string, ReloadedImageOverride>>({});
  const disposableImageURLs = useRef<Set<string>>(new Set());
  const [verdictBusy, setVerdictBusy] = useState(false);
  const { showToast } = useToast();
  const { profiles, activeProfileId } = useProfile();
  const { loading: capabilitiesLoading, isReadEnabled } = useSubjectCapabilities();
  const routeSubject = isCapabilitySubject(locationState?.subject) ? locationState.subject : null;
  const cardSubject = isCapabilitySubject(locationState?.card?.subject) ? locationState.card.subject : null;
  const submissionSubject = isCapabilitySubject(submission?.subject) ? submission.subject : null;
  const hintedSubject = isScienceSubject(cardSubject) ? cardSubject : routeSubject || cardSubject;
  const gatedSubject = submissionSubject || hintedSubject;
  const scienceSubject = isScienceSubject(gatedSubject) ? gatedSubject : null;
  const subjectReadEnabled = gatedSubject ? isReadEnabled(gatedSubject) : true;
  const subjectGatePending = Boolean(scienceSubject && capabilitiesLoading);
  const subjectBlocked = Boolean(gatedSubject && !capabilitiesLoading && !subjectReadEnabled);

  useEffect(() => {
    if (!subjectBlocked || !gatedSubject) return;
    showToast(`${subjectOption(gatedSubject).label}入口已暂时关闭`, 'info');
    navigate('/', { replace: true });
  }, [gatedSubject, navigate, showToast, subjectBlocked]);

  const submissionProfileId = useMemo(() => {
    const raw = String(submission?.profile_id || '').trim();
    return raw || null;
  }, [submission]);

  const requestProfileHeaders = useMemo(() => {
    // IMPORTANT: when user has multiple children, backend requires correct X-Profile-Id.
    // Using submission.profile_id avoids "submission not found" when user currently switched to another child.
    return submissionProfileId ? { 'X-Profile-Id': submissionProfileId } : undefined;
  }, [submissionProfileId]);

  const questionPresentation = useMemo(
    () => buildQuestionPresentation(submission),
    [submission],
  );
  const hasCanonicalQuestionPresentation = Boolean(
    usesCanonicalQuestionDetail(submission?.subject) &&
      questionPresentation.source === 'learning_artifacts_v1',
  );

  useEffect(() => {
    const load = async () => {
      if (!submissionId || submission) return;
      if (subjectGatePending || subjectBlocked) return;
      try {
        const res = await fetchSubmissionDetailWithProfiles(submissionId, {
          activeProfileId,
          profiles,
        });
        setSubmission(res.data);
        setLoadError(null);
        if (!card) {
          const key = decodedId || String(id || '');
          const foundById = res.data.question_cards?.find((c) => c.item_id === key) || null;
          if (foundById) {
            setCard(foundById);
            return;
          }
          const nextPresentation = buildQuestionPresentation(res.data);
          const requiresExactItemID = usesCanonicalQuestionDetail(res.data.subject) &&
            nextPresentation.source === 'learning_artifacts_v1';
          if (requiresExactItemID) {
            setCard(null);
            return;
          }
          const qn = extractQuestionNumberFromItemId(key);
          if (!qn) {
            setCard(null);
            return;
          }
          const foundByQn = res.data.question_cards?.find(
            (c) => String(c.question_number || '').trim() === String(qn).trim()
          );
          setCard(foundByQn || null);
        }
      } catch (err) {
        console.error(err);
        const status = extractHttpStatus(err);
        setLoadError(
          extractHttpDetail(err) ||
            (status === 404 ? '题目详情暂未更新完成，请稍后重试。' : '题目详情加载失败，请稍后重试。')
        );
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, submission, id, decodedId, activeProfileId, profiles, subjectGatePending, subjectBlocked]);

  useEffect(() => {
    if (!submission) return;
    const key = decodedId || String(id || '');
    const foundById = submission.question_cards?.find((c) => c.item_id === key) || null;
    if (foundById) {
      setCard(foundById);
      return;
    }
    if (hasCanonicalQuestionPresentation) {
      setCard(null);
      return;
    }
    const qn = extractQuestionNumberFromItemId(key);
    if (!qn) {
      setCard(null);
      return;
    }
    const foundByQn = submission.question_cards?.find(
      (c) => String(c.question_number || '').trim() === String(qn).trim()
    );
    setCard(foundByQn || null);
  }, [submission, id, decodedId, hasCanonicalQuestionPresentation]);

  const refetchSubmission = useCallback(async (): Promise<SubmissionDetail | null> => {
    if (subjectGatePending || subjectBlocked) return null;
    if (!submissionId) return null;
    const sid = String(submissionId || '').trim();
    if (!sid) return null;
    const res = await fetchSubmissionDetailWithProfiles(sid, {
      knownProfileId: submissionProfileId,
      activeProfileId,
      profiles,
    });
    setSubmission(res.data);
    setLoadError(null);

    const key = String(decodedId || id || card?.item_id || '').trim();
    const foundByID =
      res.data.question_cards?.find((questionCard) => questionCard.item_id === key) || null;
    if (foundByID) {
      setCard(foundByID);
      return res.data;
    }
    const nextPresentation = buildQuestionPresentation(res.data);
    const requiresExactItemID = usesCanonicalQuestionDetail(res.data.subject) &&
      nextPresentation.source === 'learning_artifacts_v1';
    if (requiresExactItemID) {
      setCard(null);
      return res.data;
    }
    const qn =
      extractQuestionNumberFromItemId(key) || String(card?.question_number || '').trim();
    if (!qn) return res.data;
    const found =
      res.data.question_cards?.find((c) => String(c.question_number || '').trim() === qn) || null;
    if (found) setCard(found);
    return res.data;
  }, [submissionId, decodedId, id, card, submissionProfileId, activeProfileId, profiles, subjectGatePending, subjectBlocked]);

  useEffect(() => {
    const sid = String(submissionId || '').trim();
    if (!sid) return undefined;

    const refreshSubmission = async () => {
      try {
        await refetchSubmission();
      } catch (err) {
        console.error(err);
      }
    };

    const handleFocus = () => {
      void refreshSubmission();
    };
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshSubmission();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [submissionId, refetchSubmission]);

  const fullQuestion = useMemo(() => {
    const list = submission?.questions;
    if (!Array.isArray(list) || !list.length) return null;
    const key = String(decodedId || id || card?.item_id || '');
    const key2 = key.trim();
    if (!key2) return null;
    const byItemId =
      (list.find((q) => String((q as Record<string, unknown>)?.item_id || '').trim() === key2) as Record<string, unknown> | null) || null;
    if (byItemId) return byItemId;
    if (hasCanonicalQuestionPresentation) return null;

    const qn = extractQuestionNumberFromItemId(key2) || String(card?.question_number || '').trim();
    if (!qn) return null;
    return (
      (list.find((q) => String((q as Record<string, unknown>)?.question_number || '').trim() === qn) as Record<string, unknown> | null) || null
    );
  }, [submission?.questions, id, card, decodedId, hasCanonicalQuestionPresentation]);

  const figureSliceImageUrl = useMemo(() => {
    const q = fullQuestion as Record<string, unknown> | null;
    return String(q?.figure_slice_image_url || '').trim();
  }, [fullQuestion]);
  const hasUsableFigureSlice = Boolean(
    figureSliceImageUrl && figureSliceImageUrl !== failedFigureSliceImageUrl,
  );
  const figureSliceDisplayURL =
    reloadedFigureImage?.sourceURL === figureSliceImageUrl
      ? reloadedFigureImage.displayURL
      : figureSliceImageUrl;

  const canonicalQuestion = useMemo(() => {
    if (!hasCanonicalQuestionPresentation) return null;
    const itemID = String(decodedId || card?.item_id || '').trim();
    if (!itemID) return null;
    const question = findQuestionByItemId(questionPresentation, itemID);
    return isLearningQuestion(question) ? question : null;
  }, [hasCanonicalQuestionPresentation, decodedId, card?.item_id, questionPresentation]);
  const canonicalQuestionImages = useMemo(() => {
    if (!canonicalQuestion) return [];
    return resolveOwnedQuestionImageEvidence(
      questionPresentation.evidenceRegistry,
      canonicalQuestion,
    );
  }, [canonicalQuestion, questionPresentation.evidenceRegistry]);
  const canonicalQuestionImageIdentity = canonicalQuestionImages
    .map(({ evidence, url }) => `${evidence.evidence_id}:${url}`)
    .join('|');
  useEffect(() => {
    setFailedCanonicalImageIDs(new Set());
  }, [canonicalQuestionImageIdentity]);
  const hasCanonicalQuestionImage = canonicalQuestionImages.some(
    ({ evidence }) => !failedCanonicalImageIDs.has(evidence.evidence_id),
  );
  const canonicalQuestionImageOverrides = useMemo(
    () => Object.fromEntries(
      canonicalQuestionImages.flatMap(({ evidence, url }) => {
        const override = reloadedCanonicalImages[evidence.evidence_id];
        return override?.sourceURL === url
          ? [[evidence.evidence_id, override.displayURL] as const]
          : [];
      }),
    ),
    [canonicalQuestionImages, reloadedCanonicalImages],
  );
  const replaceReloadedImages = useCallback((
    figure: ReloadedImageOverride | null,
    canonical: Record<string, ReloadedImageOverride>,
    disposableURLs: readonly string[],
  ) => {
    for (const url of disposableImageURLs.current) URL.revokeObjectURL(url);
    disposableImageURLs.current = new Set(disposableURLs);
    setReloadedFigureImage(figure);
    setReloadedCanonicalImages(canonical);
  }, []);
  useEffect(() => () => {
    for (const url of disposableImageURLs.current) URL.revokeObjectURL(url);
  }, []);
  const handleCanonicalQuestionImageError = useCallback((evidenceID: string) => {
    setFailedCanonicalImageIDs((current) => new Set(current).add(evidenceID));
  }, []);
  const handleCanonicalQuestionImageLoad = useCallback((evidenceID: string) => {
    setFailedCanonicalImageIDs((current) => {
      if (!current.has(evidenceID)) return current;
      const next = new Set(current);
      next.delete(evidenceID);
      return next;
    });
  }, []);
  const canonicalGroup = useMemo(
    () =>
      canonicalQuestion?.display_mode === 'material_group'
        ? findMaterialGroupForItem(questionPresentation, canonicalQuestion.item_id) || null
        : null,
    [canonicalQuestion, questionPresentation],
  );
  const canonicalGroupQuestions = useMemo(() => {
    if (!canonicalGroup) return [];
    return canonicalGroup.item_ids
      .map((itemID) => findQuestionByItemId(questionPresentation, itemID))
      .filter((question): question is PresentationQuestion => Boolean(question));
  }, [canonicalGroup, questionPresentation]);
  const legacyQuestion = useMemo<PresentationQuestion>(() => {
    const detail = (fullQuestion || {}) as Record<string, unknown>;
    const rawStudentAnswer = String(detail.student_answer || '').trim();
    const rawReason = String(detail.reason || card?.reason || '').trim();
    const rawBasis = detail.judgment_basis;
    const judgmentBasis = Array.isArray(rawBasis)
      ? rawBasis.map((value) => String(value || '').trim()).filter((value) => value && !isPlaceholderDetailText(value))
      : String(rawBasis || '').trim() && !isPlaceholderDetailText(rawBasis)
        ? [String(rawBasis).trim()]
        : [];
    return {
      ...(card || {}),
      ...detail,
      item_id: String(card?.item_id || decodedId || id || 'unknown').trim() || 'unknown',
      question_number: String(detail.question_number || card?.question_number || '').trim(),
      verdict: (card?.verdict || detail.verdict) as Verdict | undefined,
      student_answer: isPlaceholderDetailText(rawStudentAnswer) ? '' : rawStudentAnswer,
      reason: isPlaceholderDetailText(rawReason) ? '' : rawReason,
      judgment_basis: judgmentBasis,
    };
  }, [fullQuestion, card, decodedId, id]);
  const currentVerdict = canonicalQuestion?.verdict || card?.verdict;
  const writingEvaluationComplete =
    canonicalQuestion?.question_type === 'writing' &&
    canonicalQuestion.english_feedback?.evaluation_status === 'complete';

  const hasVisualRisk = useMemo(() => {
    const q = fullQuestion as Record<string, unknown> | null;
    const fromQuestion = Boolean(q?.visual_risk);
    const fromCard = Boolean(card?.visual_risk);
    return fromQuestion || fromCard || canonicalQuestionImages.length > 0;
  }, [fullQuestion, card, canonicalQuestionImages.length]);

  const shouldShowFigureModule = useMemo(() => {
    // Product: only show the figure module when we either already have a slice,
    // or the backend flags this question as "visual risk" (diagram/geometry likely).
    // Canonical English evidence is already rendered in the question component.
    // Science simple questions already inline figure_slice in SimpleQuestionDetail.
    const subject = String(canonicalQuestion?.subject || (fullQuestion as Record<string, unknown> | null)?.subject || '').toLowerCase();
    const scienceInlineFigure = ['math', 'physics', 'chemistry'].includes(subject)
      && hasUsableFigureSlice
      && canonicalQuestion?.display_mode !== 'material_group';
    if (scienceInlineFigure) return false;
    return !hasCanonicalQuestionImage && (Boolean(figureSliceImageUrl) || Boolean(hasVisualRisk));
  }, [canonicalQuestion?.display_mode, canonicalQuestion?.subject, figureSliceImageUrl, fullQuestion, hasCanonicalQuestionImage, hasUsableFigureSlice, hasVisualRisk]);

  const navFilterFromState = isQuestionNavFilter(locationState?.questionNav?.filter)
    ? locationState.questionNav?.filter
    : null;
  const navItemIds = useMemo(
    () => normalizeQuestionNavItemIds(locationState?.questionNav?.itemIds),
    [locationState?.questionNav?.itemIds]
  );

  const activeNavFilter = useMemo<QuestionNavFilter>(() => {
    if (navFilterFromState) return navFilterFromState;
    const verdict = String(currentVerdict || '').toLowerCase();
    if (verdict === 'incorrect') return 'wrong';
    if (verdict === 'correct') return 'correct';
    if (verdict === 'uncertain') return 'uncertain';
    return 'all';
  }, [navFilterFromState, currentVerdict]);

  const navigationCards = useMemo(() => {
    const storedCards = (submission?.question_cards || []) as QuestionCard[];
    const storedCardsByID = new Map(storedCards.map((entry) => [entry.item_id, entry] as const));
    const list = hasCanonicalQuestionPresentation
      ? questionPresentation.questions.map((question) => ({
          ...(storedCardsByID.get(question.item_id) || {}),
          item_id: question.item_id,
          question_number: String(question.question_number || ''),
          page_index: typeof question.page_index === 'number' ? question.page_index : 0,
          verdict: question.verdict,
          question_content: String(question.question_content || question.question_text || ''),
        } as QuestionCard))
      : sortQuestionCardsByOrder(storedCards);
    if (!list.length) return [];

    if (navItemIds.length > 0) {
      const allowedIDs = new Set(navItemIds);
      const ordered = hasCanonicalQuestionPresentation
        ? list.filter((entry) => allowedIDs.has(entry.item_id))
        : navItemIds
            .map((itemID) => storedCardsByID.get(itemID) || null)
            .filter((entry): entry is QuestionCard => Boolean(entry));
      if (ordered.length > 0) return ordered;
    }

    return list.filter((entry) => matchesQuestionNavFilter(entry, activeNavFilter));
  }, [
    submission?.question_cards,
    hasCanonicalQuestionPresentation,
    questionPresentation,
    navItemIds,
    activeNavFilter,
  ]);

  const currentNavigationIndex = useMemo(() => {
    if (!navigationCards.length) return -1;
    const currentId = String(card?.item_id || decodedId || id || '').trim();
    if (currentId) {
      const byId = navigationCards.findIndex((c) => String(c.item_id || '').trim() === currentId);
      if (byId >= 0) return byId;
    }
    const currentQn = String(card?.question_number || extractQuestionNumberFromItemId(currentId) || '').trim();
    if (!currentQn) return -1;
    return navigationCards.findIndex((c) => String(c.question_number || '').trim() === currentQn);
  }, [navigationCards, card, decodedId, id]);

  const prevNavigationCard = currentNavigationIndex > 0 ? navigationCards[currentNavigationIndex - 1] : null;
  const nextNavigationCard =
    currentNavigationIndex >= 0 && currentNavigationIndex < navigationCards.length - 1
      ? navigationCards[currentNavigationIndex + 1]
      : null;

  const handleNavigateQuestionCard = (target: QuestionCard | null) => {
    if (!target?.item_id) return;
    setRebuildPolling(false);
    setRebuildBusy(false);
    setRebuildRunToken(0);
    replaceReloadedImages(null, {}, []);
    const query = submissionId ? `?submissionId=${encodeURIComponent(submissionId)}` : '';
    navigate(`/question/${encodeURIComponent(target.item_id)}${query}`, {
      replace: true,
      state: {
        card: target,
        submissionId,
        ...(gatedSubject ? { subject: gatedSubject } : {}),
        questionNav: {
          filter: activeNavFilter,
          itemIds: navigationCards.map((entry) => String(entry.item_id || '').trim()).filter(Boolean),
        },
      },
    });
  };

  const handleExclude = async () => {
    if (!submissionId || !card?.item_id) return;
    if (verdictBusy) return;
    const sid = String(submissionId || '').trim();
    const currentItemId = String(card.item_id || '').trim();
    const currentQn = String(
      card.question_number || extractQuestionNumberFromItemId(currentItemId) || ''
    ).trim();

    try {
      setVerdictBusy(true);
      await apiClient.post(
        '/mistakes/exclusions',
        {
          submission_id: submissionId,
          item_id: card.item_id,
          reason: '已掌握',
        },
        { headers: requestProfileHeaders }
      );
      try {
        localStorage.setItem(`submission_dirty_${sid}`, String(Date.now()));
      } catch {
        // ignore
      }
      setHasModified(true);
      showToast('已归档到已掌握', 'success');

      let refreshedWrongCards: QuestionCard[] = [];
      try {
        const updated = await refetchSubmission();
        refreshedWrongCards = ((updated?.question_cards || []) as QuestionCard[])
          .filter(
            (c) =>
              String(c.verdict || '').toLowerCase() === 'incorrect' &&
              c.excluded_from_mistakes !== true
          )
          .sort((a, b) => {
            const byQ = compareQuestionNumbers(a.question_number, b.question_number);
            if (byQ !== 0) return byQ;
            return String(a.item_id || '').localeCompare(String(b.item_id || ''));
          });
      } catch (refreshErr) {
        console.error(refreshErr);
      }
      const nextCard =
        refreshedWrongCards.find((c) => {
          const cqn = String(c.question_number || '').trim();
          return currentQn && cqn === currentQn;
        }) ||
        refreshedWrongCards.find((c) => {
          const cqn = String(c.question_number || '').trim();
          return currentQn ? compareQuestionNumbers(cqn, currentQn) > 0 : false;
        }) ||
        refreshedWrongCards[0] ||
        null;
      if (nextCard?.item_id) {
        handleNavigateQuestionCard(nextCard);
        return;
      }
      navigate(-1);
    } catch (err) {
      console.error(err);
      showToast('操作失败，请稍后重试', 'error');
    } finally {
      setVerdictBusy(false);
    }
  };

  const handleAsk = () => {
    if (!card?.item_id) return;
    const subject = String(
      submission?.subject ||
      (fullQuestion as (Record<string, unknown> & { subject?: string }) | null)?.subject ||
      (card as QuestionCard & { subject?: string }).subject ||
      '',
    ).trim().toLowerCase();
    const query = submissionId ? `?submissionId=${encodeURIComponent(submissionId)}` : '';
    navigate(`/ai-tutor/${encodeURIComponent(card.item_id)}${query}`, {
      state: { card, submissionId, ...(subject ? { subject } : {}) },
    });
  };

  const handleRebuildQIndex = async () => {
    if (!submissionId || rebuildBusy || rebuildPolling) return;
    if (!hasVisualRisk) return;
    const qn = String((fullQuestion as Record<string, unknown> | null)?.question_number || card?.question_number || '').trim();
    if (!qn) {
      showToast('未找到题号，无法触发图示切片生成。', 'error');
      return;
    }
    setRebuildBusy(true);
    try {
      await apiClient.post(
        `/submissions/${encodeURIComponent(submissionId)}/qindex/rebuild`,
        {
          question_numbers: [qn],
        },
        { headers: requestProfileHeaders }
      );
      setFailedFigureSliceImageUrl(null);
      setFailedCanonicalImageIDs(new Set());
      replaceReloadedImages(null, {}, []);
      setQuestionImageRetryToken((current) => current + 1);
      setRebuildPolling(true);
      setRebuildRunToken((current) => current + 1);
      showToast('已开始生成图示切片（可先返回，稍后再看）。', 'success');
    } catch (err) {
      console.error(err);
      showToast('触发失败：请确认后端与 qindex worker 正在运行。', 'error');
      setRebuildBusy(false);
    } finally {
      // keep rebuildBusy during polling, so users have a clear state.
    }
  };

  useEffect(() => {
    if (rebuildRunToken === 0) return;
    if (!submissionId) {
      setRebuildPolling(false);
      setRebuildBusy(false);
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const maxMs = 90_000;
    const baseDelayMs = 1500;

    const key = String(decodedId || id || card?.item_id || '').trim();
    const itemIDToWatch = hasCanonicalQuestionPresentation ? key : '';
    const questionNumberToWatch =
      hasCanonicalQuestionPresentation
        ? ''
        : extractQuestionNumberFromItemId(key) ||
          String((fullQuestion as Record<string, unknown> | null)?.question_number || card?.question_number || '').trim();
    if ((!itemIDToWatch && hasCanonicalQuestionPresentation) || (!questionNumberToWatch && !hasCanonicalQuestionPresentation)) {
      setRebuildPolling(false);
      setRebuildBusy(false);
      showToast(
        hasCanonicalQuestionPresentation
          ? '未找到题目标识，无法确认图示切片生成状态。'
          : '未找到题号，无法确认图示切片生成状态。',
        'error',
      );
      return;
    }

    const loop = async (attempt: number) => {
      if (cancelled) return;
      if (Date.now() - startedAt > maxMs) {
        setRebuildPolling(false);
        setRebuildBusy(false);
        showToast('图示切片仍在生成中，可稍后进入本题查看。', 'info');
        return;
      }

      try {
        const nextSubmission = await refetchSubmission();
        const list = nextSubmission?.questions;
        const matched =
          Array.isArray(list)
            ? hasCanonicalQuestionPresentation
              ? list.find(
                  (q: Record<string, unknown>) =>
                    String(q?.item_id || '').trim() === itemIDToWatch,
                )
              : list.find(
                  (q: Record<string, unknown>) =>
                    String(q?.question_number || '').trim() === String(questionNumberToWatch).trim(),
                )
            : null;
        const maybeFigure = String(matched?.figure_slice_image_url || '').trim();
        let ownedCanonicalImages: ReturnType<typeof resolveOwnedQuestionImageEvidence> = [];
        if (hasCanonicalQuestionPresentation && nextSubmission) {
          const nextPresentation = buildQuestionPresentation(nextSubmission);
          const nextQuestion = findQuestionByItemId(nextPresentation, itemIDToWatch);
          if (nextPresentation.source === 'learning_artifacts_v1' && isLearningQuestion(nextQuestion)) {
            ownedCanonicalImages = resolveOwnedQuestionImageEvidence(
              nextPresentation.evidenceRegistry,
              nextQuestion,
            );
          }
        }
        const [figureState, canonicalImageStates] = await Promise.all([
          maybeFigure
            ? hasCanonicalQuestionPresentation
              ? decodeReloadedImage(maybeFigure)
              : canDecodeImage(maybeFigure).then((ready): ReloadedImage => ({
                  ready,
                  ...(ready ? { displayURL: maybeFigure } : {}),
                }))
            : Promise.resolve<ReloadedImage>({ ready: false }),
          Promise.all(ownedCanonicalImages.map(async ({ evidence, url }) => ({
            evidenceID: evidence.evidence_id,
            sourceURL: url,
            image: await decodeReloadedImage(url),
          }))),
        ]);
        const disposableURLs = [
          ...(figureState.disposable && figureState.displayURL ? [figureState.displayURL] : []),
          ...canonicalImageStates.flatMap(({ image }) =>
            image.disposable && image.displayURL ? [image.displayURL] : []),
        ];
        if (cancelled) {
          for (const url of disposableURLs) URL.revokeObjectURL(url);
          return;
        }

        if (maybeFigure) {
          setFailedFigureSliceImageUrl(figureState.ready ? null : maybeFigure);
        }
        if (hasCanonicalQuestionPresentation) {
          setFailedCanonicalImageIDs(new Set(
            canonicalImageStates
              .filter(({ image }) => !image.ready)
              .map(({ evidenceID }) => evidenceID),
          ));
        }
        if (figureState.ready || canonicalImageStates.some(({ image }) => image.ready)) {
          replaceReloadedImages(
            figureState.ready && figureState.displayURL
              ? { sourceURL: maybeFigure, displayURL: figureState.displayURL }
              : null,
            Object.fromEntries(canonicalImageStates.flatMap(({ evidenceID, sourceURL, image }) =>
              image.ready && image.displayURL
                ? [[evidenceID, { sourceURL, displayURL: image.displayURL }] as const]
                : [])),
            disposableURLs,
          );
          setQuestionImageRetryToken((current) => current + 1);
          setRebuildPolling(false);
          setRebuildBusy(false);
          showToast('已生成图示切片', 'success');
          return;
        }
      } catch (err) {
        console.error(err);
      }

      if (cancelled) return;

      const nextDelay = Math.min(baseDelayMs + attempt * 200, 2500);
      window.setTimeout(() => loop(attempt + 1), nextDelay);
    };

    loop(0);
    return () => {
      cancelled = true;
    };
    // A run is intentionally keyed only by the explicit token. State updates made by
    // refetchSubmission must not restart the timer or bypass the polling delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebuildRunToken]);

  const updateVerdict = async (next: 'correct' | 'incorrect' | 'uncertain') => {
    if (!submissionId || !card?.item_id) return;
    if (verdictBusy) return;
    const sid = String(submissionId || '').trim();
    const itemId = String(card.item_id || '').trim();
    if (!sid || !itemId) return;
    try {
      setVerdictBusy(true);
      // Optimistic update so the UI reacts immediately.
      setCard((prev) => (prev ? { ...prev, verdict: next } : prev));
      setSubmission((prev) => (prev ? updateSubmissionVerdict(prev, itemId, next) : prev));
      const res = await apiClient.post<{ verdict?: string; summary?: unknown }>(
        `/submissions/${encodeURIComponent(sid)}/questions/${encodeURIComponent(itemId)}`,
        { verdict: next },
        { headers: requestProfileHeaders }
      );
      const effective = (res.data?.verdict || next) as 'correct' | 'incorrect' | 'uncertain';
      setCard((prev) => (prev ? { ...prev, verdict: effective } : prev));
      setSubmission((prev) =>
        prev ? updateSubmissionVerdict(prev, itemId, effective, res.data?.summary) : prev,
      );

      try {
        localStorage.setItem(`submission_dirty_${sid}`, String(Date.now()));
      } catch {
        // ignore
      }

      if (effective === 'incorrect') showToast('已归类为错题', 'success');
      else if (effective === 'correct') showToast('已标记为对题', 'success');
      else showToast('已标记为待定', 'success');

      // 标记已修改，用于返回时刷新列表
      setHasModified(true);
    } catch (err) {
      console.error(err);
      const status = extractHttpStatus(err);
      const detail = extractHttpDetail(err);
      if (status === 404) {
        showToast('未找到该作业（可能切换到了其他孩子）', 'error');
      } else if (status === 403) {
        showToast('无权限操作该作业（孩子不匹配）', 'error');
      } else if (status === 400 && detail) {
        showToast(`操作失败：${detail}`, 'error');
      } else {
        showToast('操作失败，请稍后重试', 'error');
      }
      // Roll back optimistic update by refetching the card from backend if available.
      try {
        const res = await apiClient.get<SubmissionDetail>(`/submissions/${encodeURIComponent(sid)}`, {
          headers: requestProfileHeaders,
        });
        setSubmission(res.data);
        const found = res.data.question_cards?.find((c) => c.item_id === String(itemId)) || null;
        if (found) setCard(found);
      } catch {
        // ignore
      }
    } finally {
      setVerdictBusy(false);
    }
  };

  if (subjectGatePending || subjectBlocked) return null;

  return (
    <div className="relative flex h-full min-h-screen w-full max-w-md mx-auto flex-col overflow-x-hidden font-display text-[#1E293B] bg-[#EFEEEE] pb-40 max-[360px]:pb-0">
      <header className="sticky top-0 z-30 flex items-center justify-between p-6 bg-[#EFEEEE]/80 backdrop-blur-lg transition-all">
        <BackButton
          onClick={() => {
            // 如果修改过数据，返回时携带刷新标记
            if (hasModified) {
              navigate(-1);
            } else {
              navigate(-1);
            }
          }}
          className="size-10 bg-[#EFEEEE] text-[#64748B]/70 hover:text-[#1E293B] shadow-neu-icon-btn active:shadow-neu-pressed border border-white/40"
        />
        <h2 className="text-[#1E293B] text-xl font-bold tracking-tight opacity-90">
          题目 {canonicalQuestion?.question_number || card?.question_number || id || 'Q'}
        </h2>
        <div className="size-10"></div>
      </header>

	      <main className="flex-1 flex flex-col px-6 gap-6 mt-2">
          {loadError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {loadError}
            </div>
          )}
          {canonicalQuestion && canonicalGroup ? (
            <MaterialGroupDetail
              group={canonicalGroup}
              question={canonicalQuestion}
              groupQuestions={canonicalGroupQuestions}
              evidenceRegistry={questionPresentation.evidenceRegistry}
              contractStatus={questionPresentation.contractStatus}
              imageRetryToken={questionImageRetryToken}
              questionImageOverrides={canonicalQuestionImageOverrides}
              onQuestionImageError={handleCanonicalQuestionImageError}
              onQuestionImageLoad={handleCanonicalQuestionImageLoad}
            />
          ) : (
            <SimpleQuestionDetail
              key={canonicalQuestion?.item_id || legacyQuestion.item_id}
              question={canonicalQuestion || legacyQuestion}
              isCanonical={Boolean(canonicalQuestion)}
              evidenceRegistry={questionPresentation.evidenceRegistry}
              contractStatus={questionPresentation.contractStatus}
              imageRetryToken={questionImageRetryToken}
              questionImageOverrides={canonicalQuestionImageOverrides}
              onQuestionImageError={canonicalQuestion ? handleCanonicalQuestionImageError : undefined}
              onQuestionImageLoad={canonicalQuestion ? handleCanonicalQuestionImageLoad : undefined}
            />
          )}

	        {navigationCards.length > 0 && (
          <div className="grid grid-cols-3 gap-3 items-center rounded-2xl bg-neu-bg shadow-neu-flat p-3 border border-white/40">
            <button
              type="button"
              onClick={() => handleNavigateQuestionCard(prevNavigationCard)}
              disabled={!prevNavigationCard}
              className="py-2.5 rounded-xl bg-[#EFEEEE] shadow-neu-flat border border-white/40 text-[12px] font-bold text-[#64748B] active:shadow-neu-pressed active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              上一题
            </button>
            <div className="text-center text-[11px] font-bold tracking-wider text-[#64748B]/80">
              {writingEvaluationComplete ? '已评价' : questionNavLabel(activeNavFilter)}{' '}
              {currentNavigationIndex >= 0
                ? `${currentNavigationIndex + 1} / ${navigationCards.length}`
                : `共 ${navigationCards.length} 题`}
            </div>
            <button
              type="button"
              onClick={() => handleNavigateQuestionCard(nextNavigationCard)}
              disabled={!nextNavigationCard}
              className="py-2.5 rounded-xl bg-[#EFEEEE] shadow-neu-flat border border-white/40 text-[12px] font-bold text-[#64748B] active:shadow-neu-pressed active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一题
            </button>
          </div>
        )}

        {shouldShowFigureModule ? (
          hasUsableFigureSlice ? (
            <div className="relative flex flex-col items-center justify-center rounded-[32px] bg-neu-bg shadow-neu-flat p-6 border border-white/40">
              <div className="w-full rounded-2xl p-2.5 shadow-neu-pressed bg-neu-bg flex items-center justify-center">
                <div className="relative w-full overflow-hidden rounded-xl border border-white/80 ring-1 ring-white/30">
                  <img
                    key={`${figureSliceImageUrl}:${questionImageRetryToken}`}
                    alt="题目图示"
                    className="w-full h-auto max-h-80 object-contain mix-blend-multiply opacity-95 bg-[#EFEEEE]"
                    src={figureSliceDisplayURL}
                    data-source-url={figureSliceImageUrl}
                    onLoad={() => setFailedFigureSliceImageUrl(null)}
                    onError={() => setFailedFigureSliceImageUrl(figureSliceImageUrl)}
                  />
                </div>
              </div>
            </div>
          ) : submission?.qindex_pending ? (
            // Auto-triggered qindex is pending (not yet completed)
            <div className="rounded-[32px] bg-neu-bg shadow-neu-flat p-6 relative overflow-hidden border border-white/40">
              <div className="rounded-2xl p-4 shadow-neu-pressed bg-neu-bg">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-[#9CA3AF]">hourglass_empty</span>
                  <div className="flex-1">
                    <div className="text-[13px] text-[#64748B] leading-relaxed">
                      该题被识别为带图题，图示切片生成中…
                    </div>
                    <div className="mt-2 text-[11px] text-gray-400">
                      生成完成后刷新页面即可查看
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // No slice yet and not pending: show manual trigger button (fallback)
            <div className="rounded-[32px] bg-neu-bg shadow-neu-flat p-6 relative overflow-hidden border border-white/40">
              <div className="rounded-2xl p-4 shadow-neu-pressed bg-neu-bg">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-[#9CA3AF]">image_not_supported</span>
                  <div className="flex-1">
                    <div className="text-[13px] text-[#64748B] leading-relaxed">
                      {failedFigureSliceImageUrl === figureSliceImageUrl
                        ? '图示切片暂不可用，请刷新或重新生成。'
                        : '该题被识别为带图题，但未获取到图示切片。'}
                    </div>
                    <div className="mt-3 flex gap-3">
                      <button
                        onClick={handleRebuildQIndex}
                        disabled={rebuildBusy}
                        className="px-4 py-2 rounded-2xl bg-[#EFEEEE] shadow-neu-flat border border-white/40 text-[12px] font-bold text-[#64748B] active:shadow-neu-pressed active:scale-[0.98] transition-all disabled:opacity-60"
                      >
                        {rebuildBusy ? '生成中…' : '生成图示切片'}
                      </button>
                      <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 rounded-2xl bg-[#EFEEEE] shadow-neu-flat border border-white/40 text-[12px] font-bold text-[#64748B] active:shadow-neu-pressed active:scale-[0.98] transition-all"
                      >
                        刷新
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        ) : null}

        <div className="relative flex flex-col rounded-[32px] bg-neu-bg shadow-neu-flat-lg overflow-hidden p-6 gap-6">
          <div className="pt-2 flex gap-4">
            {currentVerdict === 'incorrect' && !writingEvaluationComplete && (
              <>
                <button
                  onClick={handleExclude}
                  className="flex-1 py-4 rounded-2xl bg-[#EFEEEE] shadow-neu-flat-lg border border-white/40 flex items-center justify-center gap-2 text-[#64748B] font-bold active:shadow-neu-pressed active:scale-[0.98] transition-all hover:text-[#1E293B]"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  <span className="text-sm tracking-wide">错题排除</span>
                </button>
                <button
                  onClick={handleAsk}
                  className="flex-1 py-4 rounded-2xl bg-[#EFEEEE] shadow-neu-flat-lg border border-white/40 flex items-center justify-center gap-2.5 text-[#334155] font-bold active:shadow-neu-pressed active:scale-[0.98] transition-all group relative overflow-hidden"
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                  <span className="text-sm tracking-wide text-[#1E293B]/80 group-hover:text-[#1E293B] transition-colors">{PRODUCT_IDENTITY.tutor.action}</span>
                </button>
              </>
            )}

		            {currentVerdict === 'uncertain' && !writingEvaluationComplete && (
	              <>
	                <button
	                  onClick={() => {
	                    updateVerdict('incorrect');
	                  }}
	                  disabled={verdictBusy}
	                  className="flex-1 py-4 rounded-2xl bg-[#EFEEEE] shadow-neu-flat-lg border border-white/40 flex items-center justify-center gap-2 text-[#EF4444] font-bold active:shadow-neu-pressed active:scale-[0.98] transition-all"
	                >
                  <span className="material-symbols-outlined text-[18px]">cancel</span>
                  <span className="text-sm tracking-wide">是错题</span>
                </button>
	                <button
	                  onClick={() => {
	                    updateVerdict('correct');
	                  }}
	                  disabled={verdictBusy}
	                  className="flex-1 py-4 rounded-2xl bg-[#EFEEEE] shadow-neu-flat-lg border border-white/40 flex items-center justify-center gap-2 text-[#10B981] font-bold active:shadow-neu-pressed active:scale-[0.98] transition-all"
	                >
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span className="text-sm tracking-wide">是对题</span>
                </button>
                <button
                  onClick={handleAsk}
                  className="flex-1 py-4 rounded-2xl bg-[#EFEEEE] shadow-neu-flat-lg border border-white/40 flex items-center justify-center gap-2.5 text-[#334155] font-bold active:shadow-neu-pressed active:scale-[0.98] transition-all group relative overflow-hidden"
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                  <span className="text-sm tracking-wide text-[#1E293B]/80 group-hover:text-[#1E293B] transition-colors">{PRODUCT_IDENTITY.tutor.action}</span>
                </button>
              </>
            )}

		            {currentVerdict === 'correct' && !writingEvaluationComplete && (
	              <>
	                <button
	                  onClick={() => {
	                    updateVerdict('incorrect');
	                  }}
	                  disabled={verdictBusy}
	                  className="flex-1 py-4 rounded-2xl bg-[#EFEEEE] shadow-neu-flat-lg border border-white/40 flex items-center justify-center gap-2 text-[#EF4444] font-bold active:shadow-neu-pressed active:scale-[0.98] transition-all"
	                >
                  <span className="material-symbols-outlined text-[18px]">cancel</span>
                  <span className="text-sm tracking-wide">这是错题</span>
                </button>
                <button
                  onClick={handleAsk}
                  className="flex-1 py-4 rounded-2xl bg-[#EFEEEE] shadow-neu-flat-lg border border-white/40 flex items-center justify-center gap-2.5 text-[#334155] font-bold active:shadow-neu-pressed active:scale-[0.98] transition-all group relative overflow-hidden"
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                  <span className="text-sm tracking-wide text-[#1E293B]/80 group-hover:text-[#1E293B] transition-colors">{PRODUCT_IDENTITY.tutor.action}</span>
                </button>
              </>
            )}

            {(writingEvaluationComplete || !currentVerdict) && (
              <button
                onClick={handleAsk}
                className="w-full py-4 rounded-2xl bg-[#EFEEEE] shadow-neu-flat-lg border border-white/40 flex items-center justify-center gap-2.5 text-[#334155] font-bold active:shadow-neu-pressed active:scale-[0.98] transition-all group relative overflow-hidden"
              >
                <span className="material-symbols-outlined text-[18px]">chat</span>
                <span className="text-sm tracking-wide text-[#1E293B]/80 group-hover:text-[#1E293B] transition-colors">{PRODUCT_IDENTITY.tutor.action}</span>
              </button>
            )}
          </div>
        </div>
      </main>

      <HomeFab to="/" containerClassName="z-40" avoidContentOverlap />
    </div>
  );
};

export default QuestionDetail;
