import { PRODUCT_IDENTITY } from "@/content/productIdentity";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '@/services/api';
import { cn } from '@/lib/utils';
import { Header } from '@/components/ui/Header';
import { MathText } from '@/components/ui/MathText';
import { QuestionText } from '@/components/ui/QuestionText';
import { MaterialText } from '@/components/learning/MaterialText';
import { useToast } from '@/components/ui/Toast';
import { FEATURE_ENGLISH_RENDER_ENABLED } from '@/config/features';
import { isCapabilitySubject, isScienceSubject, subjectOption } from '@/config/subjects';
import { useSubjectCapabilities } from '@/hooks/useSubjectCapabilities';
import type {
  CapabilitySubject,
  LearningQuestion,
  QuestionCard,
  SubmissionDetail,
  TutorChatEventPayload,
  TutorLearningContextIdentity,
} from '@/services/types';
import {
  buildQuestionPresentation,
  findMaterialGroupForItem,
  findQuestionByItemId,
} from '@/utils/questionPresentation';
import { resolveOwnedQuestionImageEvidence } from '@/utils/ownedEvidence';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

type ServerMessage = { role?: string; content?: string };

const toClientMessages = (serverMessages: ServerMessage[]): Message[] => {
  const now = new Date().toISOString();
  const normalized = serverMessages
    .map((message) => ({
      role: (String(message?.role || '').toLowerCase() === 'assistant' ? 'assistant' : 'user') as Message['role'],
      content: String(message?.content || ''),
    }))
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .reduce<Array<{ role: Message['role']; content: string }>>((acc, message) => {
      const last = acc[acc.length - 1];
      if (last && last.role === message.role && last.content === message.content) return acc;
      return [...acc, message];
    }, []);

  return normalized.map((message, index) => ({
    id: `${message.role}-${index}-${message.content.length}`,
    role: message.role,
    content: message.content,
    timestamp: now,
  }));
};

const learningContextForItem = (
  value: TutorLearningContextIdentity | undefined,
  itemID: string,
): TutorLearningContextIdentity | null => {
  if (!value || value.contract_version !== 'learning_artifacts_v1') return null;
  if (String(value.item_id || '').trim() !== itemID) return null;
  if (!Array.isArray(value.evidence_ids)) return null;
  return value;
};

interface LocationState {
  submissionId?: string;
  card?: QuestionCard;
  subject?: string;
}

interface QuestionDetail {
  item_id?: string;
  question_number?: string;
  question_text?: string;
  question_content?: string;
  question_slice_image_url?: string;
  figure_slice_image_url?: string;
}

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

const pickFirstNonEmptyUrl = (candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return null;
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];

const isCanonicalTutorSubject = (value: unknown): boolean =>
  value === 'english' || value === 'physics' || value === 'chemistry';

const isExactCanonicalTutorFocus = ({
  focusImageURL,
  focusImageSource,
  itemID,
  learningContext,
  submission,
}: {
  focusImageURL: string | null;
  focusImageSource: string | null;
  itemID: string;
  learningContext: TutorLearningContextIdentity | null;
  submission: SubmissionDetail | null;
}): boolean => {
  if (!focusImageURL || !learningContext || !submission) return false;
  if (learningContext.item_id !== itemID) return false;
  const question = (submission.questions || []).find(
    (entry) => String((entry as Record<string, unknown>).item_id || '').trim() === itemID,
  ) as unknown as Record<string, unknown> | undefined;
  if (!question) return false;

  if (focusImageSource === 'slice_question') {
    return String(question.question_slice_image_url || '').trim() === focusImageURL;
  }
  if (focusImageSource === 'slice_figure') {
    return String(question.figure_slice_image_url || '').trim() === focusImageURL;
  }
  if (focusImageSource !== 'learning_evidence') return false;

  const contextEvidenceIDs = new Set(stringList(learningContext.evidence_ids));
  const questionRefs = new Set(stringList(question.evidence_refs));
  const optionRefs = new Set(
    Array.isArray(question.options)
      ? question.options.flatMap((option) => {
          if (!option || typeof option !== 'object' || Array.isArray(option)) return [];
          return stringList((option as Record<string, unknown>).evidence_refs);
        })
      : [],
  );
  return (submission.evidence_registry || []).some((evidence) => {
    if (!contextEvidenceIDs.has(evidence.evidence_id)) return false;
    if (evidence.owner_type !== 'question' || evidence.owner_id !== itemID) return false;
    if (String(evidence.image_url || '').trim() !== focusImageURL) return false;
    return (
      (evidence.role === 'question' && questionRefs.has(evidence.evidence_id)) ||
      (evidence.role === 'options' && optionRefs.has(evidence.evidence_id))
    );
  });
};

const AITutor: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const { showToast } = useToast();
  const itemId = useMemo(() => {
    if (!id) return '';
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  }, [id]);
  const submissionId = useMemo(() => {
    const fromState = (location.state as LocationState | null)?.submissionId;
    if (fromState) return String(fromState);
    const fromQuery = new URLSearchParams(location.search).get('submissionId');
    return fromQuery ? String(fromQuery) : '';
  }, [location.search, location.state]);
  const requestedSubject = useMemo<CapabilitySubject | null>(() => {
    const state = location.state as LocationState | null;
    const value = String(
      state?.subject ||
      (state?.card as (QuestionCard & { subject?: string }) | undefined)?.subject ||
      '',
    ).trim().toLowerCase();
    return isCapabilitySubject(value) ? value : null;
  }, [location.state]);
  const requestedCard = (location.state as LocationState | null)?.card || null;
  const [card, setCard] = useState<QuestionCard | null>(requestedCard);
  const [subject, setSubject] = useState<CapabilitySubject | null>(requestedSubject);
  const [subjectConfirmed, setSubjectConfirmed] = useState(false);
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [fullQuestion, setFullQuestion] = useState<QuestionDetail | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [focusImageUrlFromChat, setFocusImageUrlFromChat] = useState<string | null>(null);
  const [focusImageSource, setFocusImageSource] = useState<string | null>(null);
  const [failedFocusImageURL, setFailedFocusImageURL] = useState<string | null>(null);
  const [learningContext, setLearningContext] = useState<TutorLearningContextIdentity | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const { loading: capabilitiesLoading, isReadEnabled } = useSubjectCapabilities();
  const scienceSubject = isScienceSubject(subject) ? subject : null;
  const subjectGatePending = Boolean(scienceSubject && capabilitiesLoading);
  const subjectBlocked = Boolean(
    scienceSubject && !capabilitiesLoading && !isReadEnabled(scienceSubject),
  );
  const tutorAccessReady = Boolean(
    subjectConfirmed && subject && !subjectGatePending && !subjectBlocked,
  );

  const buildChatHeaders = useCallback(
    (extra: Record<string, string> = {}) => {
      const activeProfileId = (localStorage.getItem('active_profile_id') || '').trim();
      const token = (localStorage.getItem('access_token') || '').trim();
      const userId = (localStorage.getItem('user_id') || '').trim();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : { 'X-User-Id': userId || 'dev_user' }),
        ...(activeProfileId ? { 'X-Profile-Id': activeProfileId } : {}),
        ...extra,
      };
      return headers;
    },
    []
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    if (FEATURE_ENGLISH_RENDER_ENABLED) return;
    if ((location.state as LocationState | null)?.subject !== 'english') return;
    showToast('当前仅支持数学作业，英语入口已暂时关闭', 'info');
  }, [location.state, showToast]);

  useEffect(() => {
    if (!subjectBlocked || !scienceSubject) return;
    abortRef.current?.abort();
    showToast(`${subjectOption(scienceSubject).label}入口已暂时关闭`, 'info');
    navigate('/', { replace: true });
  }, [navigate, scienceSubject, showToast, subjectBlocked]);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    messagesRef.current = [];
    setSessionId(null);
    setMessages([]);
    setInput('');
    setIsStreaming(false);
    setErrorText(null);
    setFocusImageUrlFromChat(null);
    setFocusImageSource(null);
    setFailedFocusImageURL(null);
    setLearningContext(null);
    setSubmission(null);
    setFullQuestion(null);
    setCard(requestedCard);
    setSubject(requestedSubject);
    setSubjectConfirmed(false);
  }, [submissionId, itemId, requestedSubject, requestedCard]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!submissionId || !itemId) return;
      if (submission) return;
      if (subjectGatePending || subjectBlocked) return;
      try {
        const res = await apiClient.get<SubmissionDetail>(`/submissions/${submissionId}`);
        if (!active) return;
        setSubmission(res.data);
        const loadedSubjectValue = String(res.data?.subject || '').trim().toLowerCase();
        const loadedSubject = isCapabilitySubject(loadedSubjectValue) ? loadedSubjectValue : subject;
        if (!loadedSubject) return;
        setSubject(loadedSubject);
        setSubjectConfirmed(true);
        const itemKey = String(itemId || '').trim();
        const qn = extractQuestionNumberFromItemId(itemKey) || String(card?.question_number || '').trim();
        const presentation = buildQuestionPresentation(res.data);
        const canonical = findQuestionByItemId(presentation, itemKey);
        const allowNumberFallback = !isCanonicalTutorSubject(loadedSubject);
        const q =
          canonical ||
          (res.data.questions || []).find((x: QuestionDetail) => String(x?.item_id || '').trim() === itemKey) ||
          (allowNumberFallback && qn
            ? (res.data.questions || []).find(
                (x: QuestionDetail) => String(x?.question_number || '').trim() === String(qn).trim()
              )
            : null) ||
          null;
        setFullQuestion(q);
        const c =
          res.data.question_cards?.find((x) => x.item_id === String(itemId)) ||
          (allowNumberFallback && qn
            ? res.data.question_cards?.find(
                (x) => String(x.question_number || '').trim() === String(qn).trim()
              )
            : null) ||
          null;
        if (c) setCard(c);
      } catch (err) {
        if (!active) return;
        console.error(err);
      }
    };
    load();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, itemId, submission, subjectGatePending, subjectBlocked]);

  const presentation = useMemo(
    () => buildQuestionPresentation(submission),
    [submission],
  );
  const canonicalQuestion = useMemo(() => {
    const question = findQuestionByItemId(presentation, itemId);
    if (!question || !isCanonicalTutorSubject(question.subject)) return null;
    if (question.display_mode !== 'simple_question' && question.display_mode !== 'material_group') return null;
    return question as LearningQuestion;
  }, [itemId, presentation]);
  const canonicalGroup = useMemo(
    () => canonicalQuestion ? findMaterialGroupForItem(presentation, canonicalQuestion.item_id) || null : null,
    [canonicalQuestion, presentation],
  );

  const displayQuestionText = useMemo(() => {
    if (canonicalQuestion) return String(canonicalQuestion.question_text || canonicalQuestion.question_content || '');
    return (
      String(fullQuestion?.question_text || '').trim() ||
      String(fullQuestion?.question_content || '').trim() ||
      String(card?.question_content || '').trim()
    );
  }, [canonicalQuestion, fullQuestion, card]);

  const canonicalQuestionImages = useMemo(() => {
    if (!canonicalQuestion) return [];
    return resolveOwnedQuestionImageEvidence(presentation.evidenceRegistry, canonicalQuestion)
      .map(({ evidence, url }) => ({ evidenceID: evidence.evidence_id, url }));
  }, [canonicalQuestion, presentation.evidenceRegistry]);

  const isStaticVisualQuestion = useMemo(() => {
    if (canonicalQuestion) return canonicalQuestionImages.length > 0;
    const fullQuestionRecord = (fullQuestion || {}) as Record<string, unknown>;
    const questionVisualRisk =
      Boolean((fullQuestionRecord.visual_risk as boolean | undefined) || false) ||
      Boolean((card as unknown as Record<string, unknown> | null)?.visual_risk || false);
    const figureSlice = pickFirstNonEmptyUrl([
      card?.figure_slice_image_url,
      fullQuestion?.figure_slice_image_url,
      fullQuestionRecord.figure_slice_image_url,
    ]);
    return Boolean(questionVisualRisk || figureSlice);
  }, [canonicalQuestion, canonicalQuestionImages.length, card, fullQuestion]);

  const staticFocusImageUrl = useMemo(() => {
    if (canonicalQuestion) return canonicalQuestionImages[0]?.url || null;
    if (!isStaticVisualQuestion) return null;
    const fullQuestionRecord = (fullQuestion || {}) as Record<string, unknown>;
    return pickFirstNonEmptyUrl([
      card?.figure_slice_image_url,
      fullQuestion?.figure_slice_image_url,
      card?.question_slice_image_url,
      fullQuestion?.question_slice_image_url,
      fullQuestionRecord.figure_slice_image_url,
      fullQuestionRecord.question_slice_image_url,
    ]);
  }, [canonicalQuestion, canonicalQuestionImages, card, fullQuestion, isStaticVisualQuestion]);

  const allowedChatFocusImageURL = useMemo(() => {
    if (!focusImageUrlFromChat || canonicalQuestion) return null;
    if (!isCanonicalTutorSubject(subject)) return focusImageUrlFromChat;
    return isExactCanonicalTutorFocus({
      focusImageURL: focusImageUrlFromChat,
      focusImageSource,
      itemID: itemId,
      learningContext,
      submission,
    }) ? focusImageUrlFromChat : null;
  }, [canonicalQuestion, focusImageSource, focusImageUrlFromChat, itemId, learningContext, subject, submission]);
  const displayFocusImageUrl = staticFocusImageUrl || allowedChatFocusImageURL;
  const visibleFocusImageURL = displayFocusImageUrl === failedFocusImageURL
    ? null
    : displayFocusImageUrl;

  const focusImageCaption = useMemo(() => {
    if (canonicalQuestion) return '题目图示';
    if (staticFocusImageUrl) {
      const fullQuestionRecord = (fullQuestion || {}) as Record<string, unknown>;
      const hasFigureSlice = Boolean(
        pickFirstNonEmptyUrl([
          card?.figure_slice_image_url,
          fullQuestion?.figure_slice_image_url,
          fullQuestionRecord.figure_slice_image_url,
        ])
      );
      const hasQuestionSlice = Boolean(
        pickFirstNonEmptyUrl([
          card?.question_slice_image_url,
          fullQuestion?.question_slice_image_url,
          fullQuestionRecord.question_slice_image_url,
        ])
      );
      if (hasFigureSlice) return '图示切片';
      if (hasQuestionSlice) return '题干切片';
    }
    if (focusImageSource === 'slice_figure') return '图示切片';
    if (focusImageSource === 'slice_question') return '题干切片';
    if (focusImageSource === 'page') return '原页截图';
    return '题图参考';
  }, [canonicalQuestion, card, focusImageSource, fullQuestion, staticFocusImageUrl]);

  const sendMessage = async () => {
    if (!tutorAccessReady || !subject || !input.trim() || isStreaming) return;
    setErrorText(null);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);

    const history = [...messagesRef.current, userMsg].map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }));

    const payload = {
      history,
      question: userMsg.content,
      subject,
      session_id: sessionId || undefined,
      submission_id: submissionId || undefined,
      mode: 'strict',
      context_item_ids: itemId ? [itemId] : undefined,
    };

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const runOnce = async (p: typeof payload) => {
        const res = await fetch(`${apiClient.defaults.baseURL}/chat`, {
          method: 'POST',
          headers: buildChatHeaders(),
          body: JSON.stringify(p),
          signal: controller.signal,
        });

        if (controller.signal.aborted || abortRef.current !== controller) return { shouldRetry: false };

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          if (controller.signal.aborted || abortRef.current !== controller) return { shouldRetry: false };
          setErrorText(`AI 服务返回异常（${res.status}）${text ? `：${text.slice(0, 200)}` : ''}`);
          return { shouldRetry: false as const };
        }
        if (!res.body) {
          setErrorText('AI 服务未返回可读的响应流');
          return { shouldRetry: false as const };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sessionErrorCode: string | null = null;
        let sessionErrorMessage: string | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (controller.signal.aborted || abortRef.current !== controller) return { shouldRetry: false };
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            let eventType = 'message';
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.replace('event:', '').trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.replace('data:', '').trim());
              }
            }
            const dataText = dataLines.join('\n');
            if (!dataText) continue;

            if (eventType === 'heartbeat') {
              try {
                const hb = JSON.parse(dataText);
                if (hb?.session_id) setSessionId(String(hb.session_id));
              } catch (err) {
                console.error(err);
              }
            }

            if (eventType === 'error') {
              try {
                const errPayload = JSON.parse(dataText) as { code?: string; message?: string };
                sessionErrorCode = String(errPayload?.code || '');
                sessionErrorMessage = String(errPayload?.message || '');
              } catch (err) {
                console.error(err);
              }
            }

            if (eventType === 'chat') {
              try {
                const payload = JSON.parse(dataText) as TutorChatEventPayload;
                if (payload.session_id) setSessionId(String(payload.session_id));
                if (Array.isArray(payload.messages)) {
                  setMessages(toClientMessages(payload.messages));
                }
                const nextLearningContext = learningContextForItem(
                  payload.focus_review_context?.learning_context,
                  itemId,
                );
                setLearningContext(nextLearningContext);
                const firstFocus = pickFirstNonEmptyUrl(payload.focus_image_urls || []);
                const nextFocusSource = payload.focus_image_source
                  ? String(payload.focus_image_source)
                  : null;
                if (isCanonicalTutorSubject(subject)) {
                  setFocusImageUrlFromChat(firstFocus);
                  setFocusImageSource(nextFocusSource);
                } else {
                  if (firstFocus) setFocusImageUrlFromChat(firstFocus);
                  if (nextFocusSource) setFocusImageSource(nextFocusSource);
                }
              } catch (err) {
                console.error(err);
              }
            }

            if (eventType === 'done') {
              try {
                const donePayload = JSON.parse(dataText) as { session_id?: string | null };
                if (donePayload?.session_id) setSessionId(String(donePayload.session_id));
              } catch {
                // ignore
              }
              break;
            }
          }
        }

        if (sessionErrorCode) {
          const isSessionError =
            sessionErrorCode === 'SESSION_EXPIRED' || sessionErrorCode === 'SESSION_NOT_FOUND';
          if (isSessionError) {
            setSessionId(null);
          }
          setErrorText(
            sessionErrorMessage ? `AI 暂时不可用：${sessionErrorMessage}` : `AI 暂时不可用（${sessionErrorCode}）`
          );
          return { shouldRetry: isSessionError };
        }

        return { shouldRetry: false };
      };

      const first = await runOnce(payload);
      if (first.shouldRetry) {
        setErrorText(null);
        setMessages([userMsg]);
        messagesRef.current = [userMsg];
        await runOnce({
          ...payload,
          session_id: undefined,
          history: [{ role: 'user', content: userMsg.content }],
        });
      }
    } catch (err) {
      if (controller.signal.aborted || abortRef.current !== controller) return;
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorText(`请求失败：${msg}`);
    } finally {
      if (abortRef.current === controller) setIsStreaming(false);
    }
  };

  if (!tutorAccessReady) return null;

  return (
    <div className="min-h-[100dvh] w-full max-w-md mx-auto bg-neu-bg text-neu-text flex flex-col overflow-hidden selection:bg-primary/20">
      <Header title={PRODUCT_IDENTITY.tutor.name} onBack={() => navigate(-1)} className="bg-neu-bg/90 backdrop-blur-sm sticky top-0 z-20" />
      <div className="flex items-center gap-3 px-4 pt-3 text-xs text-neu-text-secondary" aria-label="是知 AI 讲题助手">
        <div className="w-9 h-9 rounded-full bg-neu-bg shadow-neu-icon flex items-center justify-center shrink-0">
          <img src="/tint-logo-hd-neu.png" alt="是知头像" className="rizhi-avatar-float w-7 h-7 object-contain" />
        </div>
        <span>是知 · AI 讲题助手</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto w-full no-scrollbar">
        <div className="w-full px-4 py-6 space-y-6 pb-[calc(10rem+env(safe-area-inset-bottom))]">
          {canonicalGroup && canonicalGroup.materials
            .slice()
            .sort((left, right) => left.display_order - right.display_order)
            .map((material) => (
              <MaterialText
                key={material.material_id}
                material={material}
                evidenceRegistry={presentation.evidenceRegistry}
                renderMath={subject !== 'english'}
              />
            ))}

          {displayQuestionText && (
            <div className="w-full rounded-2xl bg-neu-bg shadow-neu-flat p-4 text-xs text-neu-text-secondary border border-white/40">
              <span className="font-bold">题目：</span>
              {subject === 'english' ? (
                <div
                  data-testid="english-question-text"
                  className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neu-text-secondary [overflow-wrap:anywhere]"
                >
                  {displayQuestionText}
                </div>
              ) : (
                <QuestionText
                  as="div"
                  className="mt-2 text-xs text-neu-text-secondary clamp-4"
                  text={displayQuestionText}
                />
              )}
            </div>
          )}

          {learningContext && (
            <div
              data-item-id={learningContext.item_id}
              data-material-group-id={learningContext.material_group_id || ''}
              className="w-fit rounded-full bg-neu-bg px-3 py-1.5 text-[11px] font-semibold text-neu-text-secondary shadow-neu-pressed"
            >
              学习上下文已同步
            </div>
          )}

          {visibleFocusImageURL && (
            <div className="w-full rounded-2xl bg-neu-bg shadow-neu-flat p-3 border border-white/40">
              <div className="px-1 text-[11px] text-neu-text-secondary font-semibold">{focusImageCaption}</div>
              <div className="mt-2 w-full rounded-xl p-2 bg-neu-bg shadow-neu-pressed border border-white/50">
                <img
                  alt={focusImageCaption}
                  className="w-full max-h-72 object-contain rounded-lg bg-[#EFEEEE]"
                  src={visibleFocusImageURL}
                  onError={() => setFailedFocusImageURL(visibleFocusImageURL)}
                />
              </div>
            </div>
          )}

          {displayFocusImageUrl && !visibleFocusImageURL && (
            <div
              role="status"
              className="w-full rounded-2xl bg-neu-bg p-4 text-xs text-neu-text-secondary shadow-neu-pressed border border-white/40"
            >
              题目图片暂不可用
            </div>
          )}

          {errorText && (
            <div className="w-full rounded-2xl bg-neu-bg shadow-neu-pressed p-4 text-xs text-red-500 border border-white/40">
              {errorText}
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn('flex w-full', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[86%] sm:max-w-[70%] p-4 rounded-2xl text-sm leading-relaxed border border-white/40 overflow-x-auto break-words',
                  msg.role === 'user'
                    ? 'bg-neu-bg shadow-neu-pressed text-neu-text rounded-br-none'
                    : 'bg-neu-bg shadow-neu-flat text-neu-text rounded-bl-none'
                )}
              >
                {subject === 'english' ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-neu-text [overflow-wrap:anywhere]">
                    {msg.content}
                  </div>
                ) : (
                  <MathText as="div" className="text-sm leading-relaxed text-neu-text break-words" text={msg.content} />
                )}
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="flex justify-start w-full">
              <div className="bg-neu-bg shadow-neu-flat px-4 py-3 rounded-2xl rounded-bl-none flex items-center gap-1.5 border border-white/40">
                <div className="w-2 h-2 rounded-full bg-neu-text-secondary/40 animate-bounce"></div>
                <div className="w-2 h-2 rounded-full bg-neu-text-secondary/40 animate-bounce delay-100"></div>
                <div className="w-2 h-2 rounded-full bg-neu-text-secondary/40 animate-bounce delay-200"></div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Fixed input bar (always pinned to bottom of viewport) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center pointer-events-none w-full max-w-md mx-auto">
        <div
          className={cn(
            'pointer-events-auto w-full bg-neu-bg/95 backdrop-blur-sm',
            'shadow-[0_-12px_28px_rgba(0,0,0,0.06)]',
            'border-t border-white/50',
            'rounded-t-[28px] border-x border-white/40 border-b-0'
          )}
        >
          <div className="px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <div className="flex items-end gap-3">
            <div className="flex-1 bg-neu-bg rounded-[1.5rem] shadow-neu-input transition-all flex items-center min-h-[52px] border border-transparent focus-within:border-transparent">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={PRODUCT_IDENTITY.tutor.placeholder}
                rows={1}
                className="w-full bg-transparent border-none focus:ring-0 outline-none focus:outline-none text-sm px-5 py-3 placeholder:text-neu-text-secondary/50 text-neu-text leading-relaxed resize-none max-h-32"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
            </div>
            <button
              type="button"
              aria-label={isStreaming ? '停止回答' : '发送'}
              title={isStreaming ? '停止回答' : '发送'}
              onClick={() => {
                if (isStreaming) {
                  stopStreaming();
                  return;
                }
                sendMessage();
              }}
              disabled={!isStreaming && !input.trim()}
              className={cn(
                'size-12 rounded-full bg-neu-bg shadow-neu-flat active:shadow-neu-pressed transition-all shrink-0 flex items-center justify-center border border-white/50 text-neu-text',
                !isStreaming && !input.trim() && 'opacity-50 grayscale pointer-events-none'
              )}
            >
              <span className={cn('material-symbols-outlined text-[24px] ml-0.5 text-neu-text', isStreaming && 'ml-0')}>
                {isStreaming ? 'stop' : 'send'}
              </span>
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITutor;
