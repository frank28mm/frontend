import { Link } from 'react-router-dom';
import { MathText } from '@/components/ui/MathText';
import { subjectOption } from '@/config/subjects';
import type { ParentCounts, ParentConclusion, ParentKnowledge, ParentReport } from './parentReportTypes';
import { ParentReportMath, ParentReportEnglish, ParentReportPhysics, ParentReportChemistry } from './ParentReportSubjects';

const Counts = ({ value }: { value: ParentCounts }) => <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm tabular-nums">
  <span>题目 {value.total}</span><span>正确 {value.correct}</span><span>错误 {value.incorrect}</span><span>其中空答 {value.blank}</span><span>待定 {value.uncertain}</span>
  <span>正确率 {value.accuracy === null ? '暂无样本' : `${Math.round(value.accuracy * 100)}%`} · 样本 {value.accuracy_sample_size}</span>
</div>;
export function ParentReportView({ report, back }: { report: ParentReport; back: string }) {
  const refs = new Map(report.evidence_refs.map(ref => [ref.id, ref]));
  const evidence = (ids: string[]) => ids.length ? <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{ids.map(id => {
    const ref = refs.get(id)!;
    return <Link key={id} title={ref.reason} className="text-red-600 underline underline-offset-2 break-all" to={`/question/${encodeURIComponent(ref.item_id)}?submissionId=${encodeURIComponent(ref.submission_id)}&back=${encodeURIComponent(back)}`} state={{ subject: report.meta.subject, submissionId: ref.submission_id, backTo: back }}>原题 {ref.question_no || ref.item_id}</Link>;
  })}</div> : null;
  const knowledge = (node: ParentKnowledge): React.ReactNode => <details key={node.id} className="border-l border-black/10 pl-3 py-2">
    <summary className="cursor-pointer text-sm font-bold break-words">{node.name} · {node.total}题</summary>
    <div className="space-y-2 pt-2"><Counts value={node} />{evidence(node.evidence_ids)}{node.children.map(knowledge)}</div>
  </details>;
  const conclusion = (value: ParentConclusion, index: number) => <div key={index} className="space-y-2"><MathText text={value.text} className="text-sm leading-relaxed break-words" />{value.evidence_ids.length ? evidence(value.evidence_ids) : <p className="text-xs text-neu-text-secondary">缺少可靠原题引用，仅可作为汇总观察。</p>}</div>;
  const Subject = { math: ParentReportMath, english: ParentReportEnglish, physics: ParentReportPhysics, chemistry: ParentReportChemistry }[report.meta.subject];
  const q = report.data_quality;
  return <article data-testid="parent-report" className="min-w-0 space-y-8 pb-10 [overflow-wrap:anywhere]">
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{subjectOption(report.meta.subject).label}学情报告</h2>
      <p className="text-xs text-neu-text-secondary">{report.meta.from_date} 至 {report.meta.through_date} · 上海时间 · {report.meta.assignment_count}份作业</p>
      <Counts value={report.overall} />
    </section>
    <section className="space-y-4"><h2 className="text-base font-bold">家长摘要</h2>
      <h3 className="text-sm font-bold">已有表现</h3>{report.parent_summary.strengths.map(conclusion)}
      <h3 className="text-sm font-bold">值得关注</h3>{report.parent_summary.concerns.map(conclusion)}
      {report.parent_summary.limits.map((limit, index) => <MathText key={index} text={limit} className="text-xs text-neu-text-secondary leading-relaxed" />)}
    </section>
    <section className="space-y-4"><h2 className="text-base font-bold">作业分布</h2>
      {q.observation_only && <p className="text-xs text-neu-text-secondary">可分析作业不足三份，仅呈现已有观察。</p>}
      {report.assignment_distribution.map(row => <div key={row.submission_id} className="space-y-2">
        <p className="text-xs text-neu-text-secondary">{row.date}</p>
        <div role="img" aria-label={`${row.date}：正确${row.correct}，错误${row.incorrect}，待定${row.uncertain}`} className="h-3 w-full flex overflow-hidden bg-black/5">
          {([{ count: row.correct, color: 'bg-emerald-600' }, { count: row.incorrect, color: 'bg-red-500' }, { count: row.uncertain, color: 'bg-gray-400' }]).map((part, index) => <span key={index} className={part.color} style={{ width: `${row.total ? part.count / row.total * 100 : 0}%` }} />)}
        </div><Counts value={row} />{evidence(row.evidence_ids)}
      </div>)}
    </section>
    <section className="space-y-3"><h2 className="text-base font-bold">知识结构</h2>{report.knowledge_structure.length ? report.knowledge_structure.map(knowledge) : <p className="text-sm text-neu-text-secondary">暂无可映射知识标签</p>}</section>
    <section data-testid="parent-errors" className="space-y-4"><h2 className="text-base font-bold">已观察错误机制</h2>
      {report.error_mechanisms.length ? report.error_mechanisms.map(error => <div key={error.id} className="space-y-2">
        <div className="flex justify-between gap-3 text-sm"><MathText text={error.label} /><span className="tabular-nums">{error.count}</span></div>
        {error.knowledge_paths.map(path => <MathText key={path} text={path} className="text-xs text-neu-text-secondary" />)}{error.evidence_ids.length ? evidence(error.evidence_ids) : <p className="text-xs text-neu-text-secondary">缺少可靠原题引用，仅可作为汇总观察。</p>}
      </div>) : <p className="text-sm text-neu-text-secondary">暂无已存储错误机制</p>}
    </section>
    <Subject report={report} evidence={evidence} />
    <section data-testid="parent-quality" className="space-y-3"><h2 className="text-base font-bold">数据质量与观察边界</h2>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {[['选定作业', q.selected_assignments], ['可分析作业', q.analyzable_assignments], ['缺少题目明细', q.missing_details], ['无效明细', q.invalid_details], ['未评分题目', q.unscored_questions], ['已排除题目', q.excluded_questions], ['已标记知识题目', q.tagged_questions], ['图像风险', q.visual_risk_questions], ['复核题目', q.review_questions]].map(([label, value]) => <p key={label}>{label} {value}</p>)}
        <p>知识标签覆盖 {Math.round(q.tag_coverage_rate * 100)}%</p>
      </div>
      {q.notes.map((note, index) => <MathText key={index} text={note} className="text-xs leading-relaxed text-neu-text-secondary" />)}
      <p className="text-xs text-neu-text-secondary">生成于 {report.meta.generated_at} · 统计口径 {report.meta.metric_version}</p>
    </section>
    <section className="space-y-3"><h2 className="text-base font-bold">可选建议</h2>{conclusion(report.primary_suggestion, 0)}</section>
  </article>;
}
