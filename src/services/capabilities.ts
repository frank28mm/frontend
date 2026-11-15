import {
  FEATURE_CHEMISTRY_RENDER_ENABLED,
  FEATURE_CHEMISTRY_SUBMISSION_ENABLED,
  FEATURE_ENGLISH_RENDER_ENABLED,
  FEATURE_ENGLISH_SUBMISSION_ENABLED,
  FEATURE_PHYSICS_RENDER_ENABLED,
  FEATURE_PHYSICS_SUBMISSION_ENABLED,
} from '@/config/features';
import { apiClient } from '@/services/api';
import type {
  CapabilitiesResponse,
  CapabilitySubject,
  CapabilitySubjects,
  SubjectCapability,
} from '@/services/types';

export const CAPABILITIES_CACHE_TTL_MS = 60_000;

export interface CapabilitiesSnapshot {
  trusted: boolean;
  subjects: CapabilitySubjects;
  fetchedAt: number | null;
}

interface SuccessfulCacheEntry {
  snapshot: CapabilitiesSnapshot;
  expiresAt: number;
}

let successfulCache: SuccessfulCacheEntry | null = null;
let cacheGeneration = 0;

const cloneSnapshot = (snapshot: CapabilitiesSnapshot): CapabilitiesSnapshot => ({
  trusted: snapshot.trusted,
  subjects: {
    math: { ...snapshot.subjects.math },
    english: { ...snapshot.subjects.english },
    physics: { ...snapshot.subjects.physics },
    chemistry: { ...snapshot.subjects.chemistry },
  },
  fetchedAt: snapshot.fetchedAt,
});

const enabledMathCapability = (): SubjectCapability => ({
  read_enabled: true,
  submission_enabled: true,
});

const disabledCapability = (): SubjectCapability => ({
  read_enabled: false,
  submission_enabled: false,
});

const failClosedSnapshot = (): CapabilitiesSnapshot => ({
  trusted: false,
  subjects: {
    math: enabledMathCapability(),
    english: { read_enabled: true, submission_enabled: false },
    physics: disabledCapability(),
    chemistry: disabledCapability(),
  },
  fetchedAt: null,
});

export const getFallbackCapabilitiesSnapshot = (): CapabilitiesSnapshot =>
  cloneSnapshot(failClosedSnapshot());

const isSubjectCapability = (value: unknown): value is SubjectCapability => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.read_enabled === 'boolean' && typeof candidate.submission_enabled === 'boolean';
};

const normalizedSubjects = (value: unknown): CapabilitySubjects | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.capability_contract_version !== 'capabilities_v1') return null;
  if (!candidate.subjects || typeof candidate.subjects !== 'object') return null;
  const subjects = candidate.subjects as Record<string, unknown>;
  if (!isSubjectCapability(subjects.math) || !isSubjectCapability(subjects.english)) return null;
  return {
    math: { ...subjects.math },
    english: { ...subjects.english },
    physics: isSubjectCapability(subjects.physics) ? { ...subjects.physics } : disabledCapability(),
    chemistry: isSubjectCapability(subjects.chemistry) ? { ...subjects.chemistry } : disabledCapability(),
  };
};

const renderBuildCeiling: Record<CapabilitySubject, boolean> = {
  math: true,
  english: FEATURE_ENGLISH_RENDER_ENABLED,
  physics: FEATURE_PHYSICS_RENDER_ENABLED,
  chemistry: FEATURE_CHEMISTRY_RENDER_ENABLED,
};

const submissionBuildCeiling: Record<CapabilitySubject, boolean> = {
  math: true,
  english: FEATURE_ENGLISH_SUBMISSION_ENABLED,
  physics: FEATURE_PHYSICS_SUBMISSION_ENABLED,
  chemistry: FEATURE_CHEMISTRY_SUBMISSION_ENABLED,
};

export const clearCapabilitiesCache = (): void => {
  successfulCache = null;
  cacheGeneration += 1;
};

if (typeof window !== 'undefined') {
  window.addEventListener('auth:changed', clearCapabilitiesCache);
}

export async function getCapabilities(options: { force?: boolean } = {}): Promise<CapabilitiesSnapshot> {
  const now = Date.now();
  if (!options.force && successfulCache && now < successfulCache.expiresAt) {
    return cloneSnapshot(successfulCache.snapshot);
  }

  if (options.force) clearCapabilitiesCache();
  const requestGeneration = cacheGeneration;

  try {
    const response = await apiClient.get<CapabilitiesResponse>('/capabilities');
    if (requestGeneration !== cacheGeneration) return failClosedSnapshot();
    const subjects = normalizedSubjects(response.data);
    if (!subjects) {
      clearCapabilitiesCache();
      return failClosedSnapshot();
    }

    const fetchedAt = Date.now();
    const snapshot: CapabilitiesSnapshot = {
      trusted: true,
      subjects,
      fetchedAt,
    };
    successfulCache = {
      snapshot,
      expiresAt: fetchedAt + CAPABILITIES_CACHE_TTL_MS,
    };
    return cloneSnapshot(snapshot);
  } catch {
    if (requestGeneration === cacheGeneration) clearCapabilitiesCache();
    return failClosedSnapshot();
  }
}

export async function forceCapabilitiesRevalidation(): Promise<CapabilitiesSnapshot> {
  return getCapabilities({ force: true });
}

export async function isSubjectReadEnabled(subject: CapabilitySubject): Promise<boolean> {
  if (subject === 'math') return true;
  if (!renderBuildCeiling[subject]) return false;
  const snapshot = await getCapabilities();
  return subjectReadEnabledFromSnapshot(snapshot, subject);
}

export function subjectReadEnabledFromSnapshot(
  snapshot: CapabilitiesSnapshot,
  subject: CapabilitySubject,
): boolean {
  if (subject === 'math') return true;
  if (!renderBuildCeiling[subject]) return false;
  if (subject === 'english') return !snapshot.trusted || snapshot.subjects.english.read_enabled;
  return snapshot.trusted && snapshot.subjects[subject].read_enabled;
}

export async function isSubjectSubmissionEnabled(subject: CapabilitySubject): Promise<boolean> {
  if (subject === 'math') return true;
  if (!submissionBuildCeiling[subject]) return false;
  const snapshot = await getCapabilities();
  return subjectSubmissionEnabledFromSnapshot(snapshot, subject);
}

export function subjectSubmissionEnabledFromSnapshot(
  snapshot: CapabilitiesSnapshot,
  subject: CapabilitySubject,
): boolean {
  if (subject === 'math') return true;
  if (!submissionBuildCeiling[subject]) return false;
  return snapshot.trusted && snapshot.subjects[subject].submission_enabled;
}

export async function revalidateSubjectSubmission(subject: CapabilitySubject): Promise<boolean> {
  if (subject === 'math') return true;
  if (!submissionBuildCeiling[subject]) return false;
  const snapshot = await forceCapabilitiesRevalidation();
  return snapshot.trusted && snapshot.subjects[subject].submission_enabled;
}

export const canSubmitSubject = isSubjectSubmissionEnabled;
export const canSubmitEnglish = (): Promise<boolean> => isSubjectSubmissionEnabled('english');
export const revalidateEnglishSubmissionCapability = (): Promise<boolean> =>
  revalidateSubjectSubmission('english');
