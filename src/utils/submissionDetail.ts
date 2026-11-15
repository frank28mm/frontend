import { apiClient } from '@/services/api';
import type { SubmissionDetail } from '@/services/types';

type ProfileLike = {
  profile_id?: string | null;
};

type FetchSubmissionOptions = {
  activeProfileId?: string | null;
  knownProfileId?: string | null;
  profiles?: ProfileLike[];
};

const extractHttpStatus = (err: unknown): number | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  if (!('response' in err)) return undefined;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  if (!('status' in response)) return undefined;
  const status = (response as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

const normalizeProfileId = (value: unknown): string | null => {
  const cleaned = String(value || '').trim();
  return cleaned || null;
};

const buildProfileCandidates = ({
  activeProfileId,
  knownProfileId,
  profiles = [],
}: FetchSubmissionOptions): Array<string | null> => {
  const seen = new Set<string>();
  const out: Array<string | null> = [];
  const push = (value: unknown) => {
    const normalized = normalizeProfileId(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  push(knownProfileId);
  push(activeProfileId);
  profiles.forEach((profile) => push(profile?.profile_id));
  out.push(null);
  return out;
};

export async function fetchSubmissionDetailWithProfiles(
  submissionId: string,
  options: FetchSubmissionOptions = {}
) {
  const sid = String(submissionId || '').trim();
  if (!sid) {
    throw new Error('submissionId is required');
  }

  const candidates = buildProfileCandidates(options);
  let lastError: unknown;

  for (const profileId of candidates) {
    try {
      const headers = profileId ? { 'X-Profile-Id': profileId } : undefined;
      return await apiClient.get<SubmissionDetail>(`/submissions/${encodeURIComponent(sid)}`, headers ? { headers } : undefined);
    } catch (err) {
      lastError = err;
      const status = extractHttpStatus(err);
      if (status !== 404 && status !== 403) {
        break;
      }
    }
  }

  throw lastError;
}
