import type {
  EvidenceOwnerType,
  EvidenceRecord,
  EvidenceRole,
  LearningQuestion,
} from '@/services/types';

export interface OwnedEvidenceClaim {
  evidenceRefs: readonly string[];
  ownerType: EvidenceOwnerType;
  ownerId: string;
  allowedRoles: readonly EvidenceRole[];
}

export interface OwnedImageEvidence {
  evidence: EvidenceRecord;
  url: string;
}

const imageURL = (evidence: EvidenceRecord): string => {
  if (
    evidence.kind !== 'page' &&
    evidence.kind !== 'bbox' &&
    evidence.kind !== 'answer_fragment'
  ) {
    return '';
  }
  return String(evidence.slice_image_url || evidence.image_url || '').trim();
};

export const resolveOwnedImageEvidence = (
  evidenceRegistry: readonly EvidenceRecord[],
  claims: readonly OwnedEvidenceClaim[],
): OwnedImageEvidence[] => {
  const resolved: OwnedImageEvidence[] = [];
  const seen = new Set<string>();

  for (const claim of claims) {
    const ownerId = String(claim.ownerId || '').trim();
    if (!ownerId) continue;
    const allowedRoles = new Set(claim.allowedRoles);

    for (const rawRef of claim.evidenceRefs) {
      const ref = String(rawRef || '').trim();
      if (!ref || seen.has(ref)) continue;

      const evidence = evidenceRegistry.find(
        (entry) =>
          entry.evidence_id === ref &&
          entry.owner_type === claim.ownerType &&
          entry.owner_id === ownerId &&
          allowedRoles.has(entry.role),
      );
      if (!evidence) continue;

      const url = imageURL(evidence);
      if (!url) continue;
      seen.add(ref);
      resolved.push({ evidence, url });
    }
  }

  return resolved;
};

export const resolveOwnedQuestionImageEvidence = (
  evidenceRegistry: readonly EvidenceRecord[],
  question: Pick<LearningQuestion, 'item_id' | 'evidence_refs' | 'options'>,
): OwnedImageEvidence[] => resolveOwnedImageEvidence(evidenceRegistry, [
  {
    evidenceRefs: question.evidence_refs,
    ownerType: 'question',
    ownerId: question.item_id,
    allowedRoles: ['question'],
  },
  {
    evidenceRefs: question.options.flatMap((option) => option.evidence_refs),
    ownerType: 'question',
    ownerId: question.item_id,
    allowedRoles: ['options'],
  },
]);
