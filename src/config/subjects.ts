import {
  FEATURE_CHEMISTRY_RENDER_ENABLED,
  FEATURE_ENGLISH_RENDER_ENABLED,
  FEATURE_PHYSICS_RENDER_ENABLED,
} from '@/config/features';
import type { CapabilitySubject } from '@/services/types';

export interface SubjectOption {
  id: CapabilitySubject;
  label: string;
  icon: string;
}

export const SUBJECT_OPTIONS: readonly SubjectOption[] = [
  { id: 'math', label: '数学', icon: 'calculate' },
  { id: 'english', label: '英语', icon: 'menu_book' },
  { id: 'physics', label: '物理', icon: 'bolt' },
  { id: 'chemistry', label: '化学', icon: 'science' },
];

const SUBJECT_IDS = new Set<CapabilitySubject>(SUBJECT_OPTIONS.map(({ id }) => id));

export const isCapabilitySubject = (value: unknown): value is CapabilitySubject =>
  SUBJECT_IDS.has(String(value || '').trim().toLowerCase() as CapabilitySubject);

export const isScienceSubject = (value: unknown): value is 'physics' | 'chemistry' =>
  value === 'physics' || value === 'chemistry';

export const subjectOption = (value: unknown): SubjectOption => {
  const normalized = String(value || '').trim().toLowerCase();
  return SUBJECT_OPTIONS.find(({ id }) => id === normalized) || SUBJECT_OPTIONS[0];
};

export const isSubjectRenderEnabled = (subject: CapabilitySubject): boolean => {
  if (subject === 'math') return true;
  if (subject === 'english') return FEATURE_ENGLISH_RENDER_ENABLED;
  if (subject === 'physics') return FEATURE_PHYSICS_RENDER_ENABLED;
  return FEATURE_CHEMISTRY_RENDER_ENABLED;
};

export const usesCanonicalQuestionDetail = (subject: unknown): boolean => {
  if (!isCapabilitySubject(subject) || subject === 'math') return false;
  return isSubjectRenderEnabled(subject);
};
