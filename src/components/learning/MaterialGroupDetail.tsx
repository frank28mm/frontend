import type { EvidenceRecord, LearningQuestion, MaterialGroup } from '@/services/types';
import type { PresentationQuestion } from '@/utils/questionPresentation';
import { MaterialText } from '@/components/learning/MaterialText';
import { SimpleQuestionDetail } from '@/components/learning/SimpleQuestionDetail';

export interface MaterialGroupDetailProps {
  group: MaterialGroup;
  question: LearningQuestion;
  groupQuestions: readonly PresentationQuestion[];
  evidenceRegistry: readonly EvidenceRecord[];
  contractStatus: 'complete' | 'degraded';
  imageRetryToken?: number;
  questionImageOverrides?: Readonly<Record<string, string>>;
  onQuestionImageError?: (evidenceID: string) => void;
  onQuestionImageLoad?: (evidenceID: string) => void;
}

export const MaterialGroupDetail = ({
  group,
  question,
  evidenceRegistry,
  contractStatus,
  imageRetryToken,
  questionImageOverrides,
  onQuestionImageError,
  onQuestionImageLoad,
}: MaterialGroupDetailProps) => {
  const currentIndex = group.item_ids.indexOf(question.item_id);
  const position = currentIndex >= 0 ? currentIndex + 1 : question.group_position;
  const degraded = group.status === 'degraded';
  const materials = [...group.materials].sort(
    (left, right) => left.display_order - right.display_order,
  );

  return (
    <div className="min-w-0 max-w-full space-y-6 [overflow-wrap:anywhere]">
      <section className="min-w-0 max-w-full rounded-[32px] bg-neu-bg shadow-neu-flat border border-white/40 p-6">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase text-[#64748B] opacity-80">材料题组</div>
            <h3 className="mt-1 min-w-0 text-lg font-bold text-[#1E293B] [overflow-wrap:anywhere]">
              {group.title || '综合材料题'}
            </h3>
          </div>
          <span className="shrink-0 rounded-full bg-neu-bg px-3 py-1.5 text-xs font-bold text-[#64748B] shadow-neu-pressed">
            第 {position} / {group.item_ids.length} 小题
          </span>
        </div>
        {degraded && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-neu-bg p-3 text-xs leading-5 text-[#F59E0B] shadow-neu-pressed" role="status">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">warning</span>
            <span>材料信息不完整</span>
          </div>
        )}
      </section>

      {materials.map((material) => (
        <MaterialText
          key={material.material_id}
          material={material}
          evidenceRegistry={evidenceRegistry}
          renderMath={question.subject !== 'english'}
        />
      ))}

      <SimpleQuestionDetail
        key={question.item_id}
        question={question}
        evidenceRegistry={evidenceRegistry}
        contractStatus={contractStatus}
        imageRetryToken={imageRetryToken}
        questionImageOverrides={questionImageOverrides}
        onQuestionImageError={onQuestionImageError}
        onQuestionImageLoad={onQuestionImageLoad}
      />
    </div>
  );
};
