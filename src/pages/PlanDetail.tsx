import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSavedPlans } from '@/hooks/useSavedPlans';
import { useProfile } from '@/contexts/ProfileContext';
import { BackButton } from '@/components/ui/BackButton';
import { HomeFab } from '@/components/ui/HomeButton';
import { subjectOption } from '@/config/subjects';
import type { ParentKnowledge } from '@/components/report/parentReportTypes';
import { MessageCircle } from 'lucide-react';
import { NeuButton } from '@/components/ui/NeuButton';
import { openPlanDiscussion } from '@/services/assistant';

const knowledge = (node: ParentKnowledge): React.ReactNode => <li key={node.id} className="space-y-1 py-1">
  <p>{node.name} · {node.total}题 · 错误 {node.incorrect} · 待定 {node.uncertain}</p>
  {node.children.length > 0 && <ul className="pl-3 border-l border-black/10">{node.children.map(knowledge)}</ul>}
</li>;

export default function PlanDetail() {
  const { id = '' } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const { profiles } = useProfile();
  const { detail: plan, loading, error, retry, profileId, knownVersion } = useSavedPlans('detail', search, id);
  const accountId = localStorage.getItem('user_id') || '';
  const token = localStorage.getItem('access_token') || '';
  const backQuery = profileId ? `?${new URLSearchParams({ profileId })}` : '';
  const back = `/plans${backQuery}`;
  const child = plan && (profiles?.find(profile => profile.profile_id === plan.profile_id)?.display_name || `孩子 ${plan.profile_id}`);
  // Retain observed newer versions without fetching latest behind a pinned deep link.
  const versions = plan ? Array.from({ length: Math.min(knownVersion, 20) }, (_, index) => knownVersion - index) : [];
  if (plan && !versions.includes(plan.version)) versions.push(plan.version);
  return <div className="relative flex h-[100dvh] w-full max-w-md mx-auto flex-col bg-neu-bg pb-24 text-neu-text antialiased overflow-hidden">
    <header className="relative shrink-0 flex items-center justify-center px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 bg-neu-bg/90">
      <div className="absolute left-6"><BackButton onClick={() => navigate(back)} /></div>
      <h1 className="text-xl font-bold text-neu-text-secondary">方案详情</h1>
    </header>
    <main className="flex-1 min-h-0 px-6 overflow-y-auto overflow-x-hidden no-scrollbar pb-10 [overflow-wrap:anywhere]">
      {loading && <p role="status" className="text-sm text-center text-neu-text-secondary py-6">加载中...</p>}
      {error && <div className="space-y-3 text-center py-6"><p role="alert" className="text-sm text-neu-text-secondary">{error}</p>{error.startsWith('无法读取') && <button onClick={retry} className="px-4 py-2 rounded-xl shadow-neu-flat text-sm">重试</button>}</div>}
      {plan && <article className="space-y-7 text-sm leading-relaxed whitespace-pre-wrap">
        <section className="space-y-3">
          <h2 className="text-lg font-bold">{plan.content.title}</h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-neu-text-secondary"><span>{child}</span><span>{subjectOption(plan.subject).label}</span>
            <select aria-label="方案版本" value={String(plan.version)} onChange={event => {
              const query = new URLSearchParams(search);
              if (event.target.value === 'latest') query.delete('version');
              else query.set('version', event.target.value);
              navigate(`/plan/${encodeURIComponent(id)}${query.size ? `?${query}` : ''}`);
            }} className="max-w-full bg-neu-bg rounded-lg px-2 py-2 shadow-neu-pressed">
              <option value="latest">最新版本</option>{versions.map(version => <option key={version} value={String(version)}>版本 {version}</option>)}
            </select>
          </div>
          <p className="text-xs text-neu-text-secondary">{plan.from_date} 至 {plan.through_date} · 上海时间</p>
          <p className="text-xs text-neu-text-secondary">数据采集于 {plan.captured_at}</p>
          <p className="text-xs text-neu-text-secondary">保存于 {plan.created_at}</p>
          {import.meta.env.VITE_ASSISTANT_ENABLED === 'true' && accountId && token && Number.isSafeInteger(plan.version) && plan.version > 0 && <NeuButton variant="ghost" className="gap-2 py-2 text-sm" onClick={() => openPlanDiscussion({ plan_id: plan.plan_id, version: plan.version }, accountId, token)}><MessageCircle size={16} aria-hidden="true" />与知之讨论</NeuButton>}
          <h3 className="font-bold">复习目标</h3><p>{plan.goal}</p>
          <p>{plan.content.overview}</p>
        </section>
        <section className="space-y-4"><h2 className="text-base font-bold">数据支持的重点</h2>
          {plan.content.priorities.length === 0 && <p className="text-neu-text-secondary">暂无数据支持的重点</p>}
          {plan.content.priorities.map((priority, index) => <div key={index} className="space-y-2 border-l border-black/10 pl-3">
            <h3 className="font-bold">{priority.topic}</h3><p>{priority.observation}</p><p>{priority.suggestion}</p>
            <div className="text-xs text-neu-text-secondary">{priority.evidence_ids.map(id => {
              const ref = plan.facts.evidence_refs.find(ref => ref.id === id);
              return ref && <p key={id}>依据：题目 {ref.question_no || ref.item_id} · {ref.reason}</p>;
            })}</div>
          </div>)}
        </section>
        <section className="space-y-3"><h2 className="text-base font-bold">一般建议</h2>{plan.content.suggestions.length ? <ul className="list-disc pl-5 space-y-2">{plan.content.suggestions.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="text-neu-text-secondary">暂无一般建议</p>}</section>
        <section className="space-y-3"><h2 className="text-base font-bold">适用边界</h2>{plan.content.limitations.length ? <ul className="list-disc pl-5 space-y-2">{plan.content.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p className="text-neu-text-secondary">暂无补充边界</p>}</section>
        <details className="border-t border-black/10 pt-4">
          <summary className="cursor-pointer font-bold">数据依据</summary>
          <div className="space-y-4 pt-4 text-xs">
            <p>选定作业 {plan.facts.meta.assignment_count}份 · 题目 {plan.facts.overall.total} · 正确 {plan.facts.overall.correct} · 错误 {plan.facts.overall.incorrect} · 待定 {plan.facts.overall.uncertain}</p>
            <p>正确率 {plan.facts.overall.accuracy === null ? '暂无样本' : `${Math.round(plan.facts.overall.accuracy * 100)}%`} · 样本 {plan.facts.overall.accuracy_sample_size}</p>
            <h3 className="font-bold">知识观察</h3><ul>{plan.facts.knowledge_structure.map(knowledge)}</ul>
            <h3 className="font-bold">数据质量</h3>
            <p>可分析作业 {plan.facts.data_quality.analyzable_assignments} · 缺少明细 {plan.facts.data_quality.missing_details} · 无效明细 {plan.facts.data_quality.invalid_details} · 未评分 {plan.facts.data_quality.unscored_questions} · 已排除 {plan.facts.data_quality.excluded_questions}</p>
            {plan.facts.data_quality.observation_only && <p>样本有限，仅呈现已有观察。</p>}
            {plan.facts.data_quality.notes.map((text, index) => <p key={index}>{text}</p>)}
            <p>统计口径 {plan.facts.meta.metric_version}</p>
          </div>
        </details>
        <section className="space-y-2 text-xs text-neu-text-secondary border-t border-black/10 pt-4">
          <h2 className="font-bold">方案来源</h2><p>模型 {plan.provenance.model} · 提示版本 {plan.provenance.prompt_version}</p>
          {plan.source_conversation_id && <p>来源对话 {plan.source_conversation_id}</p>}
        </section>
      </article>}
    </main>
    <HomeFab to="/" />
  </div>;
}
