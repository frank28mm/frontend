import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/services/api';
import type { EnglishReportStats, ReportContent, ReportJob } from '@/services/types';
import { HomeFab } from '@/components/ui/HomeButton';
import { BackButton } from '@/components/ui/BackButton';
import { MathText } from '@/components/ui/MathText';
import { useToast } from '@/components/ui/Toast';
import { isCapabilitySubject, isScienceSubject, subjectOption } from '@/config/subjects';
import { useSubjectCapabilities } from '@/hooks/useSubjectCapabilities';
import type { CapabilitySubject } from '@/services/types';
import { useProfile } from '@/contexts/ProfileContext';
import { CanceledError, getAdapter, type AxiosRequestConfig } from 'axios';
import { ParentReportView } from '@/components/report/ParentReportView';
import { routeParentReport } from '@/components/report/parentReportValidation';
import { reportNavigationScope } from '@/services/reportNavigationScope';

// Type definitions for report stats
interface KnowledgeRow {
  tag?: string | unknown;
  wrong_count?: number;
  incorrect?: number;
  uncertain?: number;
  error_count?: number;
  count?: number;
  total?: number;
  error_rate?: number;
  sample_size?: number;
}

interface CauseDefinition {
  display_name_cn?: string;
  standard?: string;
}

interface TrendPoint {
  knowledge_top5?: Record<string, number>;
  cause_top3?: Record<string, number>;
}

interface Trends {
  points?: TrendPoint[];
  selected_knowledge_tags?: string[];
  selected_causes?: string[];
}

interface Stats {
  [key: string]: unknown;
  overall?: {
    accuracy?: number;
    sample_size?: number;
    correct?: number;
    incorrect?: number;
    uncertain?: number;
    error_rate?: number;
  };
  knowledge_mastery?: {
    rows?: KnowledgeRow[];
  };
  meta?: {
    cause_definitions?: Record<string, CauseDefinition>;
  };
  cause_distribution?: {
    severity_counts?: Record<string, number>;
  };
  process_diagnosis?: {
    severity_counts?: Record<string, number>;
  };
  trends?: Trends;
  coverage?: Record<string, unknown>;
  english?: EnglishReportStats;
}

interface ExclusionsSnapshot {
  key_takeaway?: string;
}

interface ExtendedReportContent extends ReportContent {
  stats?: Stats;
  exclusions_snapshot?: ExclusionsSnapshot;
  period_from?: string;
  period_to?: string;
}

interface TopKnowledgeItem {
  tag: string;
  __count: number;
}

const ENGLISH_PROVENANCE_LABELS: Record<string, string> = {
  native_v1: '原生结构',
  mixed: '混合结构',
  legacy_fallback: '兼容回退',
};

const ENGLISH_QUESTION_TYPE_LABELS: Record<string, string> = {
  phonetics_spelling: '语音与拼写',
  vocabulary_word_form: '词汇与词形',
  grammar_usage: '语法运用',
  sentence_transform: '句型转换',
  cloze_banked: '选词填空',
  cloze_open: '开放填空',
  reading_choice: '阅读选择',
  reading_true_false: '阅读判断',
  reading_matching: '阅读匹配',
  reading_summary: '阅读概括',
  translation: '翻译',
  short_answer: '简答',
  writing: '写作',
  unknown: '其他题型',
};

const ENGLISH_ANSWER_MODE_LABELS: Record<string, string> = {
  choice_single: '单选',
  choice_multiple: '多选',
  true_false: '判断',
  matching: '匹配',
  fill_text: '文本填空',
  fill_from_bank: '选词填空',
  sentence_transform: '句型转换',
  translation: '翻译',
  short_answer: '简答',
  writing: '写作',
  unknown: '其他作答',
};

const ENGLISH_ERROR_TYPE_LABELS: Record<string, string> = {
  missing_answer: '未作答',
  recognition_uncertain: '识别待定',
  spelling: '拼写',
  word_form: '词形',
  vocabulary: '词汇',
  grammar: '语法',
  meaning: '语义',
  evidence: '证据定位',
  task_fulfillment: '任务完成',
  coherence: '连贯',
  expression: '表达',
  format: '格式',
  other: '其他',
  unknown: '未分类',
};

const reportCountEntries = (
  counts: Record<string, number | undefined> | undefined,
  labels: Record<string, string>,
) => Object.entries(counts || {})
  .map(([key, count]) => ({ key, label: labels[key] || key, count: Number(count) || 0 }))
  .filter((item) => item.count > 0)
  .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'));

const EnglishCountGroup = ({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; label: string; count: number }>;
}) => (
  <div className="min-w-0">
    <div className="mb-2 text-[11px] font-bold text-neu-text-secondary">{title}</div>
    <div className="flex min-w-0 flex-wrap gap-2">
      {items.length > 0 ? items.map((item) => (
        <div
          key={item.key}
          className="inline-flex min-w-0 items-center gap-2 rounded-xl bg-neu-bg px-3 py-2 text-xs shadow-neu-pressed"
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">{item.label}</span>
          <span className="shrink-0 font-bold text-neu-text">{item.count}</span>
        </div>
      )) : <span className="text-xs text-neu-text-secondary">暂无数据</span>}
    </div>
  </div>
);

const EnglishReportDimensions = ({ stats }: { stats: EnglishReportStats }) => {
  const coverage = reportCountEntries(stats.contract_coverage, ENGLISH_PROVENANCE_LABELS);
  const questionTypes = reportCountEntries(stats.by_question_type, ENGLISH_QUESTION_TYPE_LABELS);
  const answerModes = reportCountEntries(stats.by_answer_mode, ENGLISH_ANSWER_MODE_LABELS);
  const errorTypes = reportCountEntries(stats.by_error_type, ENGLISH_ERROR_TYPE_LABELS);
  const knowledgeTags = Object.entries(stats.by_knowledge_tag || {})
    .map(([key, aggregate]) => ({
      key,
      label: String(aggregate.canonical_path || aggregate.canonical_paths?.[0] || aggregate.tag_id || key),
      count: Number(aggregate.item_count) || 0,
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'));
  const excludedUncertain = Number(stats.accuracy?.excluded_uncertain) || 0;

  return (
    <section data-testid="english-report-stats" className="min-w-0 space-y-5">
      <div className="text-sm font-bold text-neu-text">英语结构与题型</div>
      <div className="flex min-w-0 flex-wrap gap-2 text-xs text-neu-text-secondary">
        <span>题目 {Number(stats.item_count) || 0}</span>
        <span>材料题组 {Number(stats.material_group_count) || 0}</span>
        <span>空答 {Number(stats.blank_count) || 0}</span>
      </div>
      <EnglishCountGroup title="结构覆盖" items={coverage} />
      <EnglishCountGroup title="题型" items={questionTypes} />
      <EnglishCountGroup title="作答形式" items={answerModes} />
      <EnglishCountGroup title="错误类型" items={errorTypes} />
      <EnglishCountGroup title="知识标签" items={knowledgeTags} />
      <div className="text-xs leading-relaxed text-neu-text-secondary">
        待定 {excludedUncertain} 题未计入正确率
      </div>
    </section>
  );
};

const toPercentText = (value?: number | null) => {
  if (value === undefined || value === null) return '--%';
  return `${Math.round(value * 100)}%`;
};

const isNoiseKnowledgeTag = (tag: unknown) => {
  const s = String(tag ?? '').trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  if (s === '数学' || s === '英语') return true;
  if (lower === 'math' || lower === 'mathematics' || lower === 'english') return true;
  // Knowledge tags are expected to be Chinese concept phrases; ASCII-only often indicates noise/subject labels.
  if (/^[A-Za-z0-9_\\-\\s]+$/.test(s)) return true;
  return false;
};

const normalizeKnowledgeTagLabel = (tag: unknown) => {
  const s = String(tag ?? '').trim();
  if (!s) return '';
  // Unify common synonym/ambiguous labels into one canonical phrase for stable reporting.
  if (s === '幂运算' || s === '指数运算') return '幂的运算';
  return s;
};

const buildSparklinePath = (
  values: Array<number | null | undefined>,
  domain?: { min: number; max: number }
) => {
  const width = 100;
  const height = 40;
  const padding = 4;
  if (!values || values.length < 2) return null;

  const defined = values
    .map((v, idx) => ({ v: typeof v === 'number' && Number.isFinite(v) ? v : null, idx }))
    .filter((p) => p.v !== null) as Array<{ v: number; idx: number }>;
  if (defined.length < 2) return null;

  const min = typeof domain?.min === 'number' ? domain.min : Math.min(...defined.map((p) => p.v));
  const max = typeof domain?.max === 'number' ? domain.max : Math.max(...defined.map((p) => p.v));
  const span = Math.max(1e-9, max - min);

  const xStep = (width - padding * 2) / (values.length - 1);
  const toX = (idx: number) => padding + idx * xStep;
  const toY = (v: number) => {
    const t = (v - min) / span;
    return padding + (1 - t) * (height - padding * 2);
  };

  const points = defined.map((p) => ({ x: toX(p.idx), y: toY(p.v) }));
  if (points.length < 2) return null;

  const d: string[] = [];
  d.push(`M ${points[0].x} ${points[0].y}`);

  // Catmull-Rom to cubic Bezier for smooth curves
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }
  return d.join(' ');
};

type NarrativeBlock =
  | { type: 'h'; text: string; level: number }
  | { type: 'p'; text: string }
  | { type: 'li'; text: string };

const stripLeadingIcons = (input: string) => {
  return String(input || '')
    .replace(/^(?:🐾|🧾|📌|✅|⚠️|🎯|📊|📝\s*)+/gu, '')
    .trim();
};

const normalizeDiagnosisTitle = (input: string) => {
  const s = String(input || '').trim();
  if (!s) return s;
  // Rename "改进建议" -> "提升建议" while preserving possible numbering prefix.
  if (s.includes('改进建议')) {
    const replaced = s.replaceAll('改进建议', '提升建议').trim();
    // If the title is only the bare phrase, add an ordinal to align with other numbered sections.
    if (replaced === '提升建议') return '3. 提升建议';
    return replaced;
  }
  return s;
};

const stripTrailingParen = (input: string) => {
  // Remove trailing "(...)" or "（...）" for clean headings.
  return String(input || '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s*（[^）]*）\s*$/g, '')
    .trim();
};

const parseNarrativeBlocks = (content: string): NarrativeBlock[] => {
  const raw = String(content || '').replaceAll('\r\n', '\n').trim();
  if (!raw) return [];
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const out: NarrativeBlock[] = [];
  const looksLikeSentence = (t: string) => {
    const s = String(t || '').trim();
    if (!s) return false;
    if (s.length < 14) return false;
    return /[，。；：:]/.test(s);
  };

  const tryPushNumberedAsBody = (tail: string) => {
    const t = String(tail || '').trim();
    if (!t) return false;
    // If the numbered line is actually an advice sentence or "短标题：内容", treat it as body instead of a heading.
    const colonPair = t.match(/^([^:：]{2,12})[:：]\s*(.+)$/);
    if (colonPair) {
      const left = String(colonPair[1] || '').trim();
      const right = String(colonPair[2] || '').trim();
      if (left && right) out.push({ type: 'li', text: `${left}：${right}` });
      return true;
    }
    if (looksLikeSentence(t)) {
      out.push({ type: 'p', text: t });
      return true;
    }
    return false;
  };

  for (const line of lines) {
    const normalized = stripLeadingIcons(line)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();

    if (!normalized || normalized === '学情诊断报告') continue;

    const heading = normalized.match(/^(#{1,6})\s*(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const rawHeading = stripTrailingParen(stripLeadingIcons(String(heading[2] || '')).trim());
      if (!rawHeading) continue;

      // Handle cases like "##1.整体表现" (no space after hashes) or "## 2.1 知识掌握".
      const numbered = rawHeading.match(/^(\d+(?:\.\d+)*)\s*[\\.、\\)）]?\s*(.+)$/);
      if (numbered) {
        const num = String(numbered[1] || '').trim();
        const tail = String(numbered[2] || '').trim();
        if (tryPushNumberedAsBody(tail)) continue;
        const text = normalizeDiagnosisTitle(stripTrailingParen(tail));
        const titled = num && text ? (num.includes('.') ? `${num} ${text}` : `${num}. ${text}`) : text;
        if (titled && titled !== '学情诊断报告') out.push({ type: 'h', level: 3, text: titled });
        continue;
      }

      const text = normalizeDiagnosisTitle(rawHeading);
      if (text && text !== '学情诊断报告') out.push({ type: 'h', level, text });
      continue;
    }

    const section = normalized.match(/^(\d+)[.)]\s+(.*)$/);
    if (section) {
      const num = String(section[1] || '').trim();
      const tail = String(section[2] || '').trim();
      if (tryPushNumberedAsBody(tail)) continue;
      const text = normalizeDiagnosisTitle(stripTrailingParen(tail));
      const titled = num && text ? `${num}. ${text}` : text;
      if (titled) out.push({ type: 'h', level: 3, text: titled });
      continue;
    }

    const sectionAlt = normalized.match(/^(\d+)\s*[\\.、\\)）]\s*(.*)$/);
    if (sectionAlt) {
      const num = String(sectionAlt[1] || '').trim();
      const tail = String(sectionAlt[2] || '').trim();
      if (tryPushNumberedAsBody(tail)) continue;
      const text = normalizeDiagnosisTitle(stripTrailingParen(tail));
      const titled = num && text ? `${num}. ${text}` : text;
      if (titled) out.push({ type: 'h', level: 3, text: titled });
      continue;
    }

    const sectionParen = normalized.match(/^(?:\((\d+)\)|（(\d+)）)\s*(.*)$/);
    if (sectionParen) {
      const num = String(sectionParen[1] || sectionParen[2] || '').trim();
      const tail = String(sectionParen[3] || '').trim();
      if (tryPushNumberedAsBody(tail)) continue;
      const text = normalizeDiagnosisTitle(stripTrailingParen(tail));
      const titled = num && text ? `${num}. ${text}` : text;
      if (titled) out.push({ type: 'h', level: 3, text: titled });
      continue;
    }

    const bullet = normalized.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      const text = String(bullet[1] || '').trim();
      if (text) out.push({ type: 'li', text });
      continue;
    }

    // Treat "短标题：内容" as a list item (common in action advice sections)
    const colonPair = normalized.match(/^([^:：]{2,12})[:：]\s*(.+)$/);
    if (colonPair) {
      const left = String(colonPair[1] || '').trim();
      const right = String(colonPair[2] || '').trim();
      if (left && right) out.push({ type: 'li', text: `${left}：${right}` });
      continue;
    }
    out.push({ type: 'p', text: normalized });
  }
  return out;
};

const pickKeyTakeaway = (report: ExtendedReportContent | null): string | null => {
  const kt = String(report?.exclusions_snapshot?.key_takeaway || '').trim();
  if (kt) return kt;
  const content = String(report?.content || '').trim();
  if (!content) return null;
  // Backend may fall back to dumping JSON features into `content` when narrative fails/disabled.
  // Don't show that blob as "AI 评价与建议".
  if (content.startsWith('{') || content.startsWith('[')) return null;
  const lines = content.split('\n').map((x) => x.trim());
  // Prefer the first list item or paragraph line (ignore markdown headings).
  for (const ln of lines) {
    if (!ln || ln.startsWith('#')) continue;
    if (ln.startsWith('- ')) return ln.replace(/^-+\s*/, '').trim() || null;
    return ln;
  }
  return null;
};

const reportRouteIdentity = (pathname: string, fallback: string): string => {
    const match = pathname.match(/^\/report\/([^/]+)\/?$/);
    if (!match) return fallback;
    // Router params reinterpret literal %2F; decode the original segment exactly once.
    try { return decodeURIComponent(match[1]); }
    catch { return ''; }
};

interface DetailIdentity { account: string; token: string; profile: string; explicitProfile: boolean }
const readDetailAuth = () => {
    try { return { account: localStorage.getItem('user_id') || '', token: localStorage.getItem('access_token') || '' }; }
    catch { return { account: '', token: '' }; }
};

const ReportDetail: React.FC = () => {
    const location = useLocation();
    const { activeProfileId, loading } = useProfile();
    const [auth, setAuth] = useState(readDetailAuth);
    useEffect(() => {
      const sync = () => setAuth(readDetailAuth());
      window.addEventListener('auth:changed', sync);
      window.addEventListener('storage', sync);
      return () => { window.removeEventListener('auth:changed', sync); window.removeEventListener('storage', sync); };
    }, []);
    const selection = reportNavigationScope(location.search);
    const identity = { ...auth, profile: selection.explicit ? selection.profile : activeProfileId || '', explicitProfile: selection.explicit };
    // Remount before rendering new identity/route state; old reports never flash in the new scope.
    const waiting = !selection.explicit && loading;
    const key = JSON.stringify([identity, waiting, location.pathname, location.search]);
    if (!selection.valid) return <main className="min-h-screen max-w-md mx-auto bg-neu-bg px-6 pt-12 pb-32 text-neu-text">
      <p role="alert">报告链接中的孩子信息无效</p><HomeFab />
    </main>;
    return selection.valid && !waiting && auth.account && auth.token ? <ReportDetailContent key={key} identity={identity} /> : null;
};

const ReportDetailContent: React.FC<{ identity: DetailIdentity }> = ({ identity }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const jobId = searchParams.get('jobId') || '';
    const paramId = reportRouteIdentity(location.pathname, params.id || '');
    const [reportId, setReportId] = useState<string>(searchParams.get('reportId') || (jobId ? '' : paramId));
    const [report, setReport] = useState<ExtendedReportContent | null>(null);
    const [loading, setLoading] = useState(true);
    const [infoKey, setInfoKey] = useState<'top3' | 'cause' | 'trend' | 'legend-knowledge' | 'legend-cause' | null>(null);
    const [infoPos, setInfoPos] = useState<{ top: number; left: number } | null>(null);
    const [showDiagnosis, setShowDiagnosis] = useState(false);
    const { showToast } = useToast();
    const { loading: capabilitiesLoading, isReadEnabled } = useSubjectCapabilities();
    const parentRouting = routeParentReport(report?.stats, report?.params, (report as (ExtendedReportContent & { subject?: unknown }) | null)?.subject);
    const routeSubjectValue = String(
      (location.state as { subject?: unknown } | null)?.subject || '',
    ).trim().toLowerCase();
    const routeSubject: CapabilitySubject | null = isCapabilitySubject(routeSubjectValue)
      ? routeSubjectValue
      : null;
    const reportSubjectValue = String(
      (report as (ExtendedReportContent & { subject?: unknown }) | null)?.subject ||
      report?.params?.subject ||
      (parentRouting.kind === 'parent' ? parentRouting.report.meta.subject : '') ||
      '',
    ).trim().toLowerCase();
    const loadedSubject: CapabilitySubject | null = isCapabilitySubject(reportSubjectValue)
      ? reportSubjectValue
      : null;
    const gatedSubject = loadedSubject || routeSubject;
    const scienceSubject = isScienceSubject(gatedSubject) ? gatedSubject : null;
    const subjectGatePending = Boolean(scienceSubject && capabilitiesLoading);
    const subjectBlocked = Boolean(
      gatedSubject && !capabilitiesLoading && !isReadEnabled(gatedSubject),
    );

    const identityLive = useCallback(() => {
      try {
        return localStorage.getItem('user_id') === identity.account && localStorage.getItem('access_token') === identity.token &&
          (identity.explicitProfile || !localStorage.getItem('active_profile_id') || localStorage.getItem('active_profile_id') === identity.profile);
      } catch { return false; }
    }, [identity.account, identity.token, identity.profile, identity.explicitProfile]);
    const requestConfig = useCallback((signal: AbortSignal, live: () => boolean): AxiosRequestConfig => ({
      signal, headers: { Authorization: `Bearer ${identity.token}`, ...(identity.profile ? { 'X-Profile-Id': identity.profile } : {}) },
      adapter: async config => {
        if (!live()) throw new CanceledError('Report scope changed');
        config.headers.set('Authorization', `Bearer ${identity.token}`);
        if (identity.profile) config.headers.set('X-Profile-Id', identity.profile);
        else config.headers.delete('X-Profile-Id');
        try {
          const result = await getAdapter(apiClient.defaults.adapter)(config);
          if (!live()) throw new CanceledError('Report scope changed');
          return result;
        } catch (error) {
          if (!live()) throw new CanceledError('Report scope changed');
          throw error;
        }
      },
    }), [identity.token, identity.profile]);

    useEffect(() => {
      if (!subjectBlocked || !gatedSubject) return;
      showToast(`${subjectOption(gatedSubject).label}入口已暂时关闭`, 'info');
      navigate('/analysis', { replace: true });
    }, [gatedSubject, navigate, showToast, subjectBlocked]);

    const openInfo = (key: NonNullable<typeof infoKey>, e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const width = 320;
      const padding = 12;
      const left = Math.max(padding, Math.min(window.innerWidth - width - padding, rect.left + rect.width - width));
      const top = Math.max(padding, rect.bottom + 10);
      setInfoKey(key);
      setInfoPos({ top, left });
    };

    useEffect(() => {
      let timer: number | null = null;
      let active = true;
      const controller = new AbortController();
      const live = () => active && !controller.signal.aborted && identityLive();

      const pollJob = async () => {
        try {
          const res = await apiClient.get<ReportJob>(`/reports/jobs/${encodeURIComponent(jobId)}`, requestConfig(controller.signal, live));
          if (!live()) return;
          if (res.data.status === 'done' && res.data.report_id) {
            setReportId(res.data.report_id);
            return;
          }
          if (res.data.status === 'failed') {
            setLoading(false);
          } else {
            timer = window.setTimeout(pollJob, 3000);
          }
        } catch (err) {
          if (!live()) return;
          console.error(err);
          timer = window.setTimeout(pollJob, 5000);
        }
      };

      if (jobId && !subjectGatePending && !subjectBlocked) {
        pollJob();
      }

      return () => {
        active = false;
        controller.abort();
        if (timer) window.clearTimeout(timer);
      };
    }, [jobId, subjectGatePending, subjectBlocked, identityLive, requestConfig]);

    useEffect(() => {
      let active = true;
      const controller = new AbortController();
      const live = () => active && !controller.signal.aborted && identityLive();
      const loadReport = async () => {
        if (subjectGatePending || subjectBlocked) return;
        if (!reportId) {
          if (!jobId) setLoading(false);
          return;
        }
        try {
          const res = await apiClient.get<ExtendedReportContent>(`/reports/${encodeURIComponent(reportId)}`, requestConfig(controller.signal, live));
          if (live()) setReport(res.data);
        } catch (err) {
          if (live()) console.error(err);
        } finally {
          if (live()) setLoading(false);
        }
      };
      loadReport();
      return () => { active = false; controller.abort(); };
    }, [reportId, jobId, subjectGatePending, subjectBlocked, identityLive, requestConfig]);

    const stats = useMemo<Stats>(() => parentRouting.kind === 'legacy' ? (report?.stats as Stats) || {} : {}, [report?.stats, parentRouting.kind]);
    const englishStats = stats.english;
    const isEnglishReport = Boolean(englishStats) || String(report?.params?.subject || '').toLowerCase() === 'english';
    const overall = useMemo<NonNullable<Stats['overall']>>(() => stats.overall || {}, [stats]);
    const knowledgeRows = useMemo<KnowledgeRow[]>(
      () => (stats.knowledge_mastery?.rows || []) as KnowledgeRow[],
      [stats]
    );
    const causeMeta = useMemo<Record<string, CauseDefinition>>(
      () => (stats.meta?.cause_definitions || {}) as Record<string, CauseDefinition>,
      [stats]
    );
    const causeCounts = useMemo<Record<string, number>>(
      () =>
        (stats.cause_distribution?.severity_counts ||
          stats.process_diagnosis?.severity_counts ||
          {}) as Record<string, number>,
      [stats]
    );

	    const topKnowledge = useMemo(() => {
	      const normalizeCount = (row: KnowledgeRow) => {
	        if (typeof row?.wrong_count === 'number' && Number.isFinite(row.wrong_count)) return row.wrong_count;
	        const incorrect = Number(row?.incorrect ?? 0) || 0;
        const uncertain = Number(row?.uncertain ?? 0) || 0;
        if (incorrect + uncertain > 0) return incorrect + uncertain;
        if (typeof row?.error_count === 'number' && Number.isFinite(row.error_count)) return row.error_count;
        if (typeof row?.count === 'number' && Number.isFinite(row.count)) return row.count;
        if (typeof row?.total === 'number' && Number.isFinite(row.total)) return row.total;
        const rate = typeof row?.error_rate === 'number' ? row.error_rate : null;
        const sampleSize = Number(row?.sample_size ?? 0) || 0;
        if (typeof rate === 'number' && Number.isFinite(rate) && sampleSize > 0) return Math.round(rate * sampleSize);
        return 0;
      };
        const merged = new Map<string, number>();
        for (const r of knowledgeRows) {
          const tag = normalizeKnowledgeTagLabel(r?.tag);
          if (!tag || isNoiseKnowledgeTag(tag)) continue;
          const count = normalizeCount(r);
          if (!count) continue;
          merged.set(tag, (merged.get(tag) ?? 0) + count);
        }
        return Array.from(merged.entries())
          .map(([tag, __count]) => ({ tag, __count }))
	        .sort((a, b) => Number(b.__count || 0) - Number(a.__count || 0))
	        .slice(0, 3);
	    }, [knowledgeRows]);

    const accuracy = useMemo(() => {
      if (typeof overall.accuracy === 'number' && Number.isFinite(overall.accuracy)) return overall.accuracy;
      const total = Number(overall.sample_size ?? 0);
      const correct = Number(overall.correct ?? 0);
      if (Number.isFinite(total) && total > 0) return correct / total;
      return null;
    }, [overall.accuracy, overall.sample_size, overall.correct]);

	    const causeBars = useMemo(() => {
	      const keys = Object.keys(causeMeta || {});
	      const preferredOrder = ['calculation', 'concept', 'format', 'unknown'];
	      const ordered = preferredOrder.filter((k) => keys.includes(k)).concat(keys.filter((k) => !preferredOrder.includes(k)));
	      const items = ordered.map((key) => {
        const label = String(causeMeta?.[key]?.display_name_cn || key);
        const value = Number(causeCounts?.[key] ?? 0) || 0;
        return { key, label, value };
      });
      const max = Math.max(1, ...items.map((x) => x.value));
	      const topKey = items.slice().sort((a, b) => b.value - a.value)[0]?.key;
	      return { items, max, topKey };
	    }, [causeCounts, causeMeta]);

	    const trends = stats?.trends || null;
	    const trendPoints = useMemo(() => (Array.isArray(trends?.points) ? trends.points : []) as TrendPoint[], [trends?.points]);
	    const selectedKnowledgeTags = useMemo(() => (Array.isArray(trends?.selected_knowledge_tags) ? trends.selected_knowledge_tags : []) as string[], [trends?.selected_knowledge_tags]);
	    const selectedCauses = useMemo(() => (Array.isArray(trends?.selected_causes) ? trends.selected_causes : []) as string[], [trends?.selected_causes]);
      const wrongishTotal = (Number(overall.incorrect ?? 0) || 0) + (Number(overall.uncertain ?? 0) || 0);

	    const knowledgeSeriesList = useMemo(() => {
        const tags = selectedKnowledgeTags
          .map((t) => String(t ?? '').trim())
          .filter((t) => t && !isNoiseKnowledgeTag(t));

        const groups = new Map<string, string[]>();
        for (const t of tags) {
          const label = normalizeKnowledgeTagLabel(t);
          if (!label || isNoiseKnowledgeTag(label)) continue;
          const list = groups.get(label) ?? [];
          list.push(t);
          groups.set(label, list);
        }

        return Array.from(groups.entries())
          .slice(0, 5)
          .map(([label, groupTags]) => ({
            key: label,
            label,
            values: trendPoints.map((p) =>
              groupTags.reduce((acc, tag) => acc + (Number(p?.knowledge_top5?.[tag] ?? 0) || 0), 0)
            ),
          }));
	    }, [trendPoints, selectedKnowledgeTags]);

	    const causeSeriesList = useMemo(() => {
	      const causes = selectedCauses.slice(0, 3);
	      return causes.map((causeKey) => ({
	        key: causeKey,
	        label: String(causeMeta?.[causeKey]?.display_name_cn || causeKey),
	        values: trendPoints.map((p) => Number(p?.cause_top3?.[causeKey] ?? 0) || 0),
	      }));
	    }, [trendPoints, selectedCauses, causeMeta]);

	    const knowledgeDomain = useMemo(() => {
	      const all = knowledgeSeriesList.flatMap((s) => s.values);
	      const max = Math.max(0, ...all.map((v) => Number(v) || 0));
	      return { min: 0, max: Math.max(1, max) };
	    }, [knowledgeSeriesList]);

	    const causeDomain = useMemo(() => {
	      const all = causeSeriesList.flatMap((s) => s.values);
	      const max = Math.max(0, ...all.map((v) => Number(v) || 0));
	      return { min: 0, max: Math.max(1, max) };
	    }, [causeSeriesList]);

	    const knowledgePalette = useMemo(() => ['#FBBF24', '#3B82F6', '#A855F7', '#10B981', '#EF4444'], []);
	    const causePalette = useMemo(() => ['#EF4444', '#FBBF24', '#3B82F6'], []);

	    const knowledgePaths = useMemo(() => {
	      return knowledgeSeriesList.map((s, idx) => ({
	        ...s,
	        color: knowledgePalette[idx] || '#3B82F6',
	        path: buildSparklinePath(s.values, knowledgeDomain),
	      }));
	    }, [knowledgeSeriesList, knowledgeDomain, knowledgePalette]);

	    const causePaths = useMemo(() => {
	      return causeSeriesList.map((s, idx) => ({
	        ...s,
	        color: causePalette[idx] || '#EF4444',
	        path: buildSparklinePath(s.values, causeDomain),
	      }));
	    }, [causeSeriesList, causeDomain, causePalette]);

	    const takeaway = useMemo(() => pickKeyTakeaway(report), [report]);

	    const narrativeBullets = useMemo(() => {
	      const sampleSize = Number(overall?.sample_size ?? 0) || 0;
	      const correct = Number(overall?.correct ?? 0) || 0;
	      const incorrect = Number(overall?.incorrect ?? 0) || 0;
	      const uncertain = Number(overall?.uncertain ?? 0) || 0;
	      const acc = typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null;
	      const errRate =
	        typeof overall?.error_rate === 'number' && Number.isFinite(overall.error_rate)
	          ? overall.error_rate
	          : sampleSize > 0
	            ? (incorrect + uncertain) / sampleSize
	            : null;

	      const periodFrom = String(report?.period_from || '').trim();
	      const periodTo = String(report?.period_to || '').trim();
	      const scopeText =
	        periodFrom && periodTo ? `${periodFrom.replaceAll('-', '.')} ~ ${periodTo.replaceAll('-', '.')}` : null;

	      const coverage = (stats?.coverage || {}) as Record<string, unknown>;
        void coverage;

	      const bullets: string[] = [];
	      if (scopeText) bullets.push(`统计范围：${scopeText}`);
	      if (sampleSize > 0) {
	        bullets.push(
	          `样本量：${sampleSize} 题（正确 ${correct} / 错误 ${incorrect} / 待定 ${uncertain}）`
	        );
	        if (acc !== null) bullets.push(`总体正确率：${Math.round(acc * 100)}%`);
	        if (errRate !== null) bullets.push(`错误率（错+待定）：${Math.round(errRate * 100)}%`);
	      } else {
	        bullets.push('当前报告无有效题目样本（可能未提交作业或数据尚未生成）。');
	      }

	      return bullets;
	    }, [overall, accuracy, report, stats]);

      const actionSuggestions = useMemo(() => {
        const sampleSize = Number(overall?.sample_size ?? 0) || 0;
        const weakTag = String(topKnowledge?.[0]?.tag || '').trim();
        const topCause = (causeBars.items || [])
          .filter((c) => (Number(c.value) || 0) > 0)
          .slice()
          .sort((a, b) => Number(b.value) - Number(a.value))[0];

        const causeKey = String(topCause?.key || '').trim();
        void String(topCause?.label || '').trim();

        const actions: Array<{ title: string; detail: string }> = [];
        if (isEnglishReport) {
          if (weakTag && !isNoiseKnowledgeTag(weakTag)) {
            actions.push({
              title: `专项突破：${weakTag}`,
              detail: '每天 15 分钟回看同类题，按“题目要求 -> 语言依据 -> 修改后表达”完成复盘。',
            });
          }

          const topEnglishError = reportCountEntries(
            englishStats?.by_error_type,
            ENGLISH_ERROR_TYPE_LABELS,
          )[0];
          if (topEnglishError) {
            actions.push({
              title: `优先修正：${topEnglishError.label}`,
              detail: '重做最近 3 道同类错题，保留原文依据、学生作答和修改后表达，再逐题核对。',
            });
          }
          actions.push({
            title: '错题复盘（每周 2 次）',
            detail: '按“知识点 + 错误类型”归类；每类选择 3 题二刷，并记录可复用的语言规则。',
          });
          return actions.slice(0, 3);
        }

        if (weakTag && !isNoiseKnowledgeTag(weakTag)) {
          actions.push({
            title: `专项突破：${weakTag}`,
            detail: '每天 15 分钟，做 10~15 题同类专项；每题写出关键公式/等式并做一步一检。',
          });
        }

        if (causeKey === 'concept') {
          actions.push({
            title: '概念补强',
            detail: '把用到的定义/定理写成“条件-结论-反例”三行卡片；每天复习 5 分钟并刷 5 题检验。',
          });
        } else if (causeKey === 'calculation') {
          actions.push({
            title: '计算稳健',
            detail: '慢算 + 验算：每题最后 10 秒检查符号/移项/约分；错误处建立“易错点清单”。',
          });
        } else if (causeKey === 'format') {
          actions.push({
            title: '书写规范',
            detail: '答案按题目要求写单位/步骤/符号；避免因表达不清被判错或判待定。',
          });
        } else if (causeKey === 'unknown' && sampleSize > 0) {
          actions.push({
            title: '减少“未分类”',
            detail: '尽量写清步骤、补拍清晰作业图；否则系统很难给出稳定的错因统计与针对性建议。',
          });
        }

        actions.push({
          title: '错题复盘（每周 2 次）',
          detail: '把错题按“知识点 + 错因”归类；每类选 3 题二刷，直到连续 2 次做对。',
        });

        return actions.slice(0, 3);
      }, [overall, topKnowledge, causeBars.items, englishStats, isEnglishReport]);

	    const narrativeText = useMemo(() => {
	      const content = String((report as ExtendedReportContent | null)?.content || '').trim();
	      if (!content) return null;
	      if (content.startsWith('{') || content.startsWith('[')) return null;
	      // Avoid duplicating the quote-only takeaway.
	      if (takeaway && content.length <= takeaway.length + 20) return null;
	      return content.length > 2000 ? `${content.slice(0, 2000)}…` : content;
	    }, [report, takeaway]);

	    const narrativeBlocks = useMemo(() => (narrativeText ? parseNarrativeBlocks(narrativeText) : []), [narrativeText]);

      const infoModal = useMemo(() => {
        if (!infoKey) return null;
        if (infoKey === 'legend-knowledge') {
          return {
            title: '知识点趋势 · 图例',
            body: (
              <div className="space-y-3">
                <div className="text-xs text-neu-text-secondary leading-relaxed">
                  本图展示“错+待定”最多的 Top5 知识点。每条曲线代表一个知识点；每个时间点的数值=该时间点该知识点的（错误+待定）题数。
                </div>
                <div className="space-y-2">
                  {knowledgePaths
                    .filter((s) => s && s.label)
                    .slice(0, 5)
                    .map((s) => (
                      <div key={s.key} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-sm font-medium text-neu-text">{s.label}</span>
                      </div>
                    ))}
                </div>
              </div>
            ),
          };
        }
        if (infoKey === 'legend-cause') {
          return {
            title: '错因趋势 · 图例',
            body: (
              <div className="space-y-3">
                <div className="text-xs text-neu-text-secondary leading-relaxed">
                  本图展示“错+待定”最多的 Top3 错因类型。每条曲线代表一种错因类型；每个时间点的数值=该时间点该错因的（错误+待定）题数。
                </div>
                <div className="space-y-2">
                  {causePaths
                    .filter((s) => s && s.label)
                    .map((s) => (
                      <div key={s.key} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-sm font-medium text-neu-text">{s.label}</span>
                      </div>
                    ))}
                </div>
              </div>
            ),
          };
        }
        if (infoKey === 'top3') {
          return {
            title: '薄弱知识点 TOP 3',
            body: (
              <div className="space-y-2 text-sm text-neu-text leading-relaxed">
                <p>统计口径：在本报告时间范围内，按知识点累计（错误+待定）题数，取最高的 3 个。</p>
              </div>
            ),
          };
        }
        if (infoKey === 'cause') {
          const defs = causeMeta || {};
          const ordered = ['concept', 'calculation', 'format', 'unknown'] as const;
          const items = ordered
            .map((k) => ({
              key: k,
              title: String(defs?.[k]?.display_name_cn || ''),
              desc: String(defs?.[k]?.standard || ''),
            }))
            .filter((x) => x.title || x.desc);
          return {
            title: '错因统计',
            body: (
              <div className="space-y-2 text-sm text-neu-text leading-relaxed">
                <p>统计口径：仅统计“错误/待定”题目的错因分类（计算/概念/格式/未分类）。</p>
                {items.length ? (
                  <div className="mt-2 space-y-2">
                    {items.map((it) => (
                      <div key={it.key} className="text-xs leading-relaxed">
                        <div className="font-bold text-neu-text">{it.title || it.key}</div>
                        {it.desc ? <div className="mt-0.5 text-neu-text-secondary">{it.desc}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                <p className="text-neu-text-secondary text-xs">
                  提示：如果多数题目被归到“未分类”，常见原因是未作答/图片不清，或这份作业的历史批改没产出错因/步骤信息。
                </p>
              </div>
            ),
          };
        }
        return {
          title: '错题趋势',
          body: (
            <div className="space-y-2 text-sm text-neu-text leading-relaxed">
              <p>统计口径：按时间顺序（或 3 天分桶）汇总每个时间点的（错误+待定）题数。</p>
              <p className="text-neu-text-secondary text-xs">曲线越高代表该知识点/错因在该时间点问题越集中。</p>
            </div>
          ),
        };
      }, [infoKey, knowledgePaths, causePaths, causeMeta]);

        if (subjectGatePending || subjectBlocked) return null;

	    return (
	        <div className="relative flex min-h-screen w-full flex-col max-w-md mx-auto bg-neu-bg pb-32 overflow-x-visible font-display text-neu-text antialiased">
	          <header className="flex items-center justify-between px-6 pt-12 pb-8 sticky top-0 bg-neu-bg/80 backdrop-blur-sm z-30">
            <BackButton
              onClick={() => navigate(-1)}
              ariaLabel="Back"
              className="w-10 h-10 bg-neu-bg shadow-neu-flat active:shadow-neu-pressed transition-all duration-200"
              iconClassName="text-lg text-neu-text"
            />
            <h1 className="text-lg font-bold tracking-wider text-neu-text">{(report as ExtendedReportContent | null)?.title ? 'AI评测报告' : 'AI评测报告'}</h1>
            <div className="w-10" />
          </header>

	          <main className="space-y-12 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pb-32 px-6">
            {loading && <div className="text-sm text-neu-text-secondary text-center mt-6">报告生成中...</div>}
            {!loading && !report && <div className="text-sm text-neu-text-secondary text-center mt-6">暂无报告数据</div>}

            {report && parentRouting.kind === 'unsupported' && <p role="alert" className="text-sm text-neu-text-secondary">暂不支持此报告数据</p>}
            {report && parentRouting.kind === 'parent' && <ParentReportView report={parentRouting.report} back={`${location.pathname}${location.search}`} />}
            {report && parentRouting.kind === 'legacy' ? (
              <>
                <section className="flex flex-col items-center">
                  <div className="w-64 h-64 rounded-full bg-neu-bg shadow-neu-pressed flex flex-col items-center justify-center relative mb-10 border border-white/40">
                    <div className="text-[52px] font-bold text-neu-text leading-none">{toPercentText(accuracy)}</div>
                    <div className="text-xs font-bold text-red-500 mt-2 tracking-widest">正确率</div>
                  </div>
                  <div className="flex w-full items-center justify-center px-4">
                    <div className="flex-1 flex flex-col items-center justify-center py-2">
                      <span className="text-2xl font-bold text-neu-text">{Number(overall.correct ?? 0) || 0}</span>
                      <span className="text-[11px] text-neu-text-secondary font-bold mt-1">正确</span>
                    </div>
                    <div className="w-[1px] h-8 bg-black/5 mx-2" />
                    <div className="flex-1 flex flex-col items-center justify-center py-2">
                      <span className="text-2xl font-bold text-neu-text">{Number(overall.incorrect ?? 0) || 0}</span>
                      <span className="text-[11px] text-neu-text-secondary font-bold mt-1">错误</span>
                    </div>
                    <div className="w-[1px] h-8 bg-black/5 mx-2" />
                    <div className="flex-1 flex flex-col items-center justify-center py-2">
                      <span className="text-2xl font-bold text-neu-text">{Number(overall.uncertain ?? 0) || 0}</span>
                      <span className="text-[11px] text-neu-text-secondary font-bold mt-1">待定</span>
                    </div>
                  </div>
                </section>

                {englishStats ? <EnglishReportDimensions stats={englishStats} /> : null}

	                <section>
	                  <div className="flex items-center gap-1 text-sm font-bold text-neu-text mb-4">
	                    薄弱知识点 TOP 3
                      <button
                        type="button"
                        onClick={(e) => openInfo('top3', e)}
                        className="inline-flex items-center justify-center rounded-full text-neu-text-secondary hover:text-neu-text transition-colors"
                        aria-label="薄弱知识点统计说明"
                      >
	                      <span className="material-symbols-outlined text-neu-text-secondary text-[14px]">info</span>
                      </button>
	                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {(topKnowledge.length ? topKnowledge : [{ tag: '—', __count: 0 }, { tag: '—', __count: 0 }, { tag: '—', __count: 0 }]).map(
                      (k: TopKnowledgeItem, idx: number) => (
                        <div
                          key={`${String(k.tag || idx)}-${idx}`}
                          className="aspect-square bg-neu-bg shadow-neu-flat rounded-2xl flex flex-col items-center justify-center p-3 text-center border border-white/40"
                        >
                          <span className="text-[11px] font-bold text-neu-text mb-4 leading-tight clamp-2">
                            {String(k.tag || '—')}
                          </span>
                          <span className="text-2xl font-bold text-neu-text">{Number(k.__count ?? 0) || 0}</span>
                        </div>
                      )
                    )}
                  </div>
                </section>

	                <section>
	                  <div className="flex items-center gap-1 text-sm font-bold text-neu-text mb-4">
	                    错因统计
                      <button
                        type="button"
                        onClick={(e) => openInfo('cause', e)}
                        className="inline-flex items-center justify-center rounded-full text-neu-text-secondary hover:text-neu-text transition-colors"
                        aria-label="错因统计说明"
                      >
	                      <span className="material-symbols-outlined text-neu-text-secondary text-[14px]">info</span>
                      </button>
	                  </div>
                  <div className="bg-neu-bg shadow-neu-flat rounded-[32px] p-8 pb-10 flex h-64 border border-white/40 relative">
                    <div className="absolute left-6 top-8 bottom-16 flex flex-col justify-between text-[9px] text-red-500 font-bold h-[calc(100%-6rem)]">
                      <span>100</span>
                      <span>75</span>
                      <span>50</span>
                      <span>25</span>
                      <span>0</span>
                    </div>
                    <div className="flex justify-between items-end h-full w-full pl-8 gap-2">
                      {causeBars.items.slice(0, 4).map((c) => {
                        const pct = Math.max(0.12, Math.min(0.9, c.value / causeBars.max));
                        const height = `${Math.round(pct * 100)}%`;
                        const isTop = c.key === causeBars.topKey && c.value > 0;
                        return (
                          <div key={c.key} className="flex flex-col items-center gap-4 h-full justify-end flex-1">
                            <div
                              className="w-10 rounded-full shadow-neu-flat bg-neu-bg relative flex items-end border border-white/30"
                              style={{ height }}
                            >
                              {isTop ? <div className="absolute inset-0 rounded-full bg-red-500/80" /> : null}
                            </div>
                            <span className="text-[10px] font-bold text-neu-text-secondary whitespace-nowrap -rotate-45 mb-1">
                              {c.label || c.key}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

	                <section>
	                  <div className="flex items-center gap-1 text-sm font-bold text-neu-text mb-4">
	                    错题趋势
                      <button
                        type="button"
                        onClick={(e) => openInfo('trend', e)}
                        className="inline-flex items-center justify-center rounded-full text-neu-text-secondary hover:text-neu-text transition-colors"
                        aria-label="错题趋势说明"
                      >
	                      <span className="material-symbols-outlined text-neu-text-secondary text-[14px]">info</span>
                      </button>
	                  </div>
                    <div className="space-y-6">
                      <div>
                        <div className="h-56 bg-neu-bg shadow-neu-pressed rounded-2xl p-5 flex flex-col overflow-hidden border border-white/30">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neu-text-secondary tracking-widest">知识点</span>
                            <span className="text-[10px] text-neu-text-secondary">Top5</span>
                          </div>
                          <div className="flex-1 flex items-end">
                            <svg className="w-full h-[140px]" preserveAspectRatio="none" viewBox="0 0 100 40">
                              <pattern height="10" id="dots-knowledge" patternUnits="userSpaceOnUse" width="10">
                                <circle cx="2" cy="2" fill="#D1D5DB" r="1"></circle>
                              </pattern>
                              <rect fill="url(#dots-knowledge)" height="40" opacity="0.5" width="100"></rect>
                              {knowledgePaths.some((x) => x.path) ? (
                                knowledgePaths.map((s) =>
                                  s.path ? (
                                    <path
                                      key={s.key}
                                      d={s.path}
                                      fill="none"
                                      stroke={s.color}
                                      strokeLinecap="round"
                                      strokeWidth="0.9"
                                    />
                                  ) : null
                                )
                              ) : (
                                <path d="M0 30 L 100 30" fill="none" stroke="#CBD5E1" strokeLinecap="round" strokeWidth="2" />
                              )}
                            </svg>
                          </div>
                          {wrongishTotal <= 0 ? (
                            <div className="mt-2 text-[11px] text-neu-text-secondary leading-relaxed">
                              当前统计范围内暂无“错误/待定”题目，趋势图不展示。
                            </div>
                          ) : trendPoints.length < 2 ? (
                            <div className="mt-2 text-[11px] text-neu-text-secondary leading-relaxed">
                              当前统计范围内仅 {trendPoints.length} 次作业数据，趋势需要至少 2 个时间点才能绘制曲线。
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 flex items-center justify-end px-1">
                          <button
                            type="button"
                            onClick={(e) => openInfo('legend-knowledge', e)}
                            className="h-8 rounded-full bg-neu-bg shadow-neu-flat active:shadow-neu-pressed inline-flex items-center justify-center gap-2 px-3 text-neu-text-secondary hover:text-neu-text transition-colors"
                            aria-label="查看知识点趋势图例"
                          >
                            <span className="material-symbols-outlined text-[18px]">info</span>
                            <span className="text-[10px] font-bold tracking-widest">图例</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="h-56 bg-neu-bg shadow-neu-pressed rounded-2xl p-5 flex flex-col overflow-hidden border border-white/30">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neu-text-secondary tracking-widest">错因</span>
                            <span className="text-[10px] text-neu-text-secondary">Top3</span>
                          </div>
                          <div className="flex-1 flex items-end">
                            <svg className="w-full h-[140px]" preserveAspectRatio="none" viewBox="0 0 100 40">
                              <pattern height="10" id="dots-cause" patternUnits="userSpaceOnUse" width="10">
                                <circle cx="2" cy="2" fill="#D1D5DB" r="1"></circle>
                              </pattern>
                              <rect fill="url(#dots-cause)" height="40" opacity="0.5" width="100"></rect>
                              {causePaths.some((x) => x.path) ? (
                                causePaths.map((s) =>
                                  s.path ? (
                                    <path
                                      key={s.key}
                                      d={s.path}
                                      fill="none"
                                      stroke={s.color}
                                      strokeLinecap="round"
                                      strokeWidth="0.9"
                                    />
                                  ) : null
                                )
                              ) : (
                                <path d="M0 30 L 100 30" fill="none" stroke="#CBD5E1" strokeLinecap="round" strokeWidth="2" />
                              )}
                            </svg>
                          </div>
                          {wrongishTotal <= 0 ? (
                            <div className="mt-2 text-[11px] text-neu-text-secondary leading-relaxed">
                              当前统计范围内暂无“错误/待定”题目，趋势图不展示。
                            </div>
                          ) : trendPoints.length < 2 ? (
                            <div className="mt-2 text-[11px] text-neu-text-secondary leading-relaxed">
                              当前统计范围内仅 {trendPoints.length} 次作业数据，趋势需要至少 2 个时间点才能绘制曲线。
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 flex items-center justify-end px-1">
                          <button
                            type="button"
                            onClick={(e) => openInfo('legend-cause', e)}
                            className="h-8 rounded-full bg-neu-bg shadow-neu-flat active:shadow-neu-pressed inline-flex items-center justify-center gap-2 px-3 text-neu-text-secondary hover:text-neu-text transition-colors"
                            aria-label="查看错因趋势图例"
                          >
                            <span className="material-symbols-outlined text-[18px]">info</span>
                            <span className="text-[10px] font-bold tracking-widest">图例</span>
                          </button>
                        </div>
                      </div>
                    </div>
	                </section>

                <section className="pb-16">
                  <div className="flex items-center gap-1 text-sm font-bold text-neu-text mb-4">
                    AI 评价与建议
                  </div>
                  <div className="w-full bg-neu-bg shadow-neu-pressed rounded-[32px] p-8 border border-white/20">
                    {takeaway ? (
                      <p className="text-sm leading-relaxed text-neu-text font-medium italic mb-4">“{takeaway}”</p>
                    ) : null}
                    <ul className="space-y-2 text-sm text-neu-text-secondary leading-relaxed">
                      {narrativeBullets.map((b, idx) => (
                        <li key={`${idx}-${b}`} className="flex gap-2">
                          <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-red-500/70 shrink-0" />
                          <span className="text-neu-text">{b}</span>
                        </li>
                      ))}
                    </ul>
                    {actionSuggestions.length ? (
                      <div className="mt-6 pt-6 border-t border-black/5">
                        <div className="text-xs font-bold text-neu-text tracking-widest mb-3">行动建议</div>
                        <div className="grid grid-cols-1 gap-3">
                          {actionSuggestions.map((a) => (
                            <div
                              key={a.title}
                              className="rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-4"
                            >
                              <div className="text-sm font-bold text-neu-text">{a.title}</div>
                              <div className="mt-1 text-xs text-neu-text-secondary leading-relaxed">{a.detail}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {narrativeBlocks.length ? (
                      <div className="mt-6 pt-6 border-t border-black/5">
                        <button
                          type="button"
                          onClick={() => setShowDiagnosis((v) => !v)}
                          className="w-full flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-red-500/70" />
                            <div className="text-xs font-bold text-neu-text tracking-widest">学情诊断报告</div>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-neu-text-secondary">
                            {showDiagnosis ? '收起' : '展开'}
                            <span className="material-symbols-outlined text-[16px]">
                              {showDiagnosis ? 'expand_less' : 'expand_more'}
                            </span>
                          </div>
                        </button>

                        {showDiagnosis ? (
                          <div className="space-y-2 mt-4 font-light text-neu-text-secondary">
                            {(() => {
                              const rendered: React.ReactNode[] = [];
                              let pendingList: string[] = [];
                              const flush = (key: string) => {
                                if (!pendingList.length) return;
                                rendered.push(
                                  <ul key={key} className="space-y-1 text-xs text-neu-text-secondary leading-relaxed font-light">
                                    {pendingList.map((t, idx) => (
                                      <li key={`${key}-${idx}`} className="flex gap-2">
                                        <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-neu-text-secondary/70 shrink-0" />
                                        <span className="font-light">
                                          <MathText text={t} as="span" />
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                );
                                pendingList = [];
                              };

                              narrativeBlocks.forEach((b, idx) => {
                                if (b.type === 'li') {
                                  pendingList.push(b.text);
                                  return;
                                }
                                flush(`list-${idx}`);
                                if (b.type === 'h') {
                                  rendered.push(
                                    <div key={`h-${idx}`} className="text-xs font-bold text-neu-text mt-3">
                                      {b.text}
                                    </div>
                                  );
                                  return;
                                }
                                rendered.push(
                                  <p key={`p-${idx}`} className="text-xs text-neu-text-secondary leading-relaxed font-light">
                                    <MathText text={b.text} as="span" />
                                  </p>
                                );
                              });
                              flush('list-final');
                              return rendered;
                            })()}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}
	          </main>

	          <HomeFab to="/" />

            {infoModal && infoPos ? (
              <div
                className="fixed z-50 w-[320px] rounded-[24px] bg-neu-popup shadow-popup-base border border-white/40 p-5"
                style={{ top: infoPos.top, left: infoPos.left }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-bold text-neu-text">{infoModal.title}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setInfoKey(null);
                      setInfoPos(null);
                    }}
                    className="w-9 h-9 rounded-full bg-neu-popup shadow-popup-flat flex items-center justify-center text-neu-text-secondary active:shadow-popup-pressed transition-all"
                    aria-label="关闭说明"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
                <div className="mt-3 max-h-[45vh] overflow-y-auto no-scrollbar">{infoModal.body}</div>
              </div>
            ) : null}
	        </div>
	    );
};

export default ReportDetail;
