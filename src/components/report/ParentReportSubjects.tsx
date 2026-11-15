import { MathText } from '@/components/ui/MathText';
import type { ParentDimension, ParentReport } from './parentReportTypes';

interface Props { report: ParentReport; evidence: (ids: string[]) => React.ReactNode }
const Dimensions = ({ label, sections, evidence }: { label: string; sections: ParentDimension[]; evidence: Props['evidence'] }) => <section className="space-y-5 min-w-0">
  <h2 className="text-base font-bold">{label}学科观察</h2>
  {sections.map(section => <div key={section.id} className="space-y-2 border-b border-black/5 pb-4">
    <h3 className="text-sm font-bold"><MathText as="span" text={section.title} /></h3>
    <p className="text-xs text-neu-text-secondary">观察覆盖 {section.observed} / {section.total}</p>
    <MathText text={section.note} className="text-sm leading-relaxed break-words" />
    {section.rows.map(row => <div key={row.id} className="space-y-1 text-sm">
      <div className="flex items-start justify-between gap-3"><MathText text={row.label} className="min-w-0 break-words" /><span className="shrink-0 tabular-nums">{row.count}</span></div>
      {evidence(row.evidence_ids)}
    </div>)}
  </div>)}
</section>;
export const ParentReportMath = (props: Props) => <Dimensions label="数学" sections={props.report.subject_detail.sections} evidence={props.evidence} />;
export const ParentReportEnglish = (props: Props) => <Dimensions label="英语" sections={props.report.subject_detail.sections} evidence={props.evidence} />;
export const ParentReportPhysics = (props: Props) => <Dimensions label="物理" sections={props.report.subject_detail.sections} evidence={props.evidence} />;
export const ParentReportChemistry = (props: Props) => <Dimensions label="化学" sections={props.report.subject_detail.sections} evidence={props.evidence} />;
