import { useMemo, useState } from 'react';

import { MathText } from '@/components/ui/MathText';
import type { EvidenceRecord, Material } from '@/services/types';

export interface MaterialTextProps {
  material: Material;
  evidenceRegistry: readonly EvidenceRecord[];
  renderMath?: boolean;
}

const MATERIAL_LABELS: Record<Material['kind'], string> = {
  passage: '阅读材料',
  dialogue: '对话材料',
  instructions: '作答要求',
  word_bank: '词汇库',
  table: '表格材料',
  diagram: '图示材料',
  image: '图片材料',
  mixed: '综合材料',
  unknown: '题目材料',
};

const evidenceImageURL = (evidence: EvidenceRecord): string => {
  if (evidence.kind !== 'page' && evidence.kind !== 'bbox' && evidence.kind !== 'answer_fragment') {
    return '';
  }
  return String(evidence.slice_image_url || evidence.image_url || '').trim();
};

export const MaterialText = ({ material, evidenceRegistry, renderMath = false }: MaterialTextProps) => {
  const evidenceImages = useMemo(() => {
    const refs = new Set(material.evidence_refs);
    return evidenceRegistry
      .filter(
        (evidence) =>
          refs.has(evidence.evidence_id) &&
          evidence.owner_type === 'material' &&
          evidence.owner_id === material.material_id &&
          (evidence.role === 'material' || evidence.role === 'instructions'),
      )
      .map((evidence) => ({ evidence, url: evidenceImageURL(evidence) }))
      .filter((entry) => entry.url.length > 0);
  }, [evidenceRegistry, material.evidence_refs, material.material_id]);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());

  const visibleImages = evidenceImages.filter(
    ({ evidence }) => !failedImages.has(evidence.evidence_id),
  );
  const hasFailedImage = failedImages.size > 0;

  return (
    <section className="min-w-0 max-w-full rounded-[32px] bg-neu-bg shadow-neu-flat border border-white/40 p-6">
      <div className="mb-4 flex min-w-0 items-center gap-2 text-sm font-bold text-[#64748B]">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">menu_book</span>
        <span>{MATERIAL_LABELS[material.kind]}</span>
      </div>

      {material.text !== undefined && material.text.length > 0 && (
        <div
          data-testid="material-text"
          className="min-w-0 max-w-full whitespace-pre-wrap text-[15px] leading-7 text-[#1E293B] [overflow-wrap:anywhere]"
        >
          {renderMath ? (
            <MathText
              as="div"
              className="min-w-0 max-w-full whitespace-pre-wrap [overflow-wrap:anywhere]"
              text={material.text}
            />
          ) : material.text}
        </div>
      )}

      {visibleImages.length > 0 && (
        <div className={`${material.text ? 'mt-5' : ''} grid min-w-0 gap-3`}>
          {visibleImages.map(({ evidence, url }) => (
            <div
              key={evidence.evidence_id}
              className="flex min-h-40 w-full min-w-0 items-center justify-center overflow-hidden rounded-2xl bg-neu-bg p-2 shadow-neu-pressed border border-white/40"
            >
              <img
                alt="材料证据"
                src={url}
                className="h-auto max-h-80 w-full max-w-full object-contain"
                onError={() => {
                  setFailedImages((current) => {
                    const next = new Set(current);
                    next.add(evidence.evidence_id);
                    return next;
                  });
                }}
              />
            </div>
          ))}
        </div>
      )}

      {hasFailedImage && (
        <div className={`${material.text ? 'mt-4' : ''} text-xs text-[#9CA3AF]`} role="status">
          图片证据暂不可用
        </div>
      )}
    </section>
  );
};
