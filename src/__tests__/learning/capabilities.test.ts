import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/services/api', () => ({
  apiClient: { get: apiGet },
}));

const response = (
  englishSubmissionEnabled: boolean,
  physicsSubmissionEnabled = true,
  chemistrySubmissionEnabled = true,
) => ({
  data: {
    capability_contract_version: 'capabilities_v1',
    subjects: {
      math: { read_enabled: true, submission_enabled: true },
      english: { read_enabled: true, submission_enabled: englishSubmissionEnabled },
      physics: { read_enabled: true, submission_enabled: physicsSubmissionEnabled },
      chemistry: { read_enabled: true, submission_enabled: chemistrySubmissionEnabled },
    },
  },
});

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const loadClient = async (
  submissionCeiling = true,
  renderCeiling = true,
  physicsSubmissionCeiling = true,
  physicsRenderCeiling = true,
  chemistrySubmissionCeiling = true,
  chemistryRenderCeiling = true,
) => {
  vi.resetModules();
  vi.stubEnv('VITE_FEATURE_ENGLISH_RENDER_ENABLED', String(renderCeiling));
  vi.stubEnv('VITE_FEATURE_ENGLISH_SUBMISSION_ENABLED', String(submissionCeiling));
  vi.stubEnv('VITE_FEATURE_PHYSICS_RENDER_ENABLED', String(physicsRenderCeiling));
  vi.stubEnv('VITE_FEATURE_PHYSICS_SUBMISSION_ENABLED', String(physicsSubmissionCeiling));
  vi.stubEnv('VITE_FEATURE_CHEMISTRY_RENDER_ENABLED', String(chemistryRenderCeiling));
  vi.stubEnv('VITE_FEATURE_CHEMISTRY_SUBMISSION_ENABLED', String(chemistrySubmissionCeiling));
  return import('@/services/capabilities');
};

describe('capabilities', () => {
  beforeEach(() => {
    apiGet.mockReset();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('requires both the build ceiling and trusted server capability for English submission', async () => {
    apiGet.mockResolvedValue(response(true));
    const enabledClient = await loadClient(true);

    expect(await enabledClient.isSubjectSubmissionEnabled('english')).toBe(true);
    expect(await enabledClient.isSubjectSubmissionEnabled('math')).toBe(true);

    apiGet.mockResolvedValue(response(true));
    const buildDisabledClient = await loadClient(false);

    expect(await buildDisabledClient.isSubjectSubmissionEnabled('english')).toBe(false);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('honors a trusted server capability that disables English', async () => {
    apiGet.mockResolvedValue(response(false));
    const client = await loadClient(true);

    expect(await client.isSubjectSubmissionEnabled('english')).toBe(false);
  });

  it('keeps Physics and Chemistry capabilities independent', async () => {
    apiGet.mockResolvedValue(response(true, true, false));
    const client = await loadClient();

    expect(await client.isSubjectReadEnabled('physics')).toBe(true);
    expect(await client.isSubjectReadEnabled('chemistry')).toBe(true);
    expect(await client.isSubjectSubmissionEnabled('physics')).toBe(true);
    expect(await client.isSubjectSubmissionEnabled('chemistry')).toBe(false);
  });

  it('applies independent build ceilings to Physics and Chemistry', async () => {
    apiGet.mockResolvedValue(response(true, true, true));
    const client = await loadClient(true, true, false, true, true, false);

    expect(await client.isSubjectReadEnabled('physics')).toBe(true);
    expect(await client.isSubjectSubmissionEnabled('physics')).toBe(false);
    expect(await client.isSubjectReadEnabled('chemistry')).toBe(false);
    expect(await client.isSubjectSubmissionEnabled('chemistry')).toBe(true);
  });

  it('preserves Math and English behavior when an older server omits Science capabilities', async () => {
    const legacyResponse = response(true);
    delete (legacyResponse.data.subjects as Partial<typeof legacyResponse.data.subjects>).physics;
    delete (legacyResponse.data.subjects as Partial<typeof legacyResponse.data.subjects>).chemistry;
    apiGet.mockResolvedValue(legacyResponse);
    const client = await loadClient();

    const snapshot = await client.getCapabilities();
    expect(snapshot.trusted).toBe(true);
    expect(await client.isSubjectSubmissionEnabled('english')).toBe(true);
    expect(await client.isSubjectReadEnabled('physics')).toBe(false);
    expect(await client.isSubjectSubmissionEnabled('chemistry')).toBe(false);
  });

  it('keeps render and submission build ceilings independent', async () => {
    apiGet.mockRejectedValue(new Error('old backend'));
    const renderOnlyClient = await loadClient(false, true);

    expect(await renderOnlyClient.isSubjectReadEnabled('english')).toBe(true);
    expect(await renderOnlyClient.isSubjectSubmissionEnabled('english')).toBe(false);

    const fullyDisabledClient = await loadClient(false, false);
    expect(await fullyDisabledClient.isSubjectReadEnabled('english')).toBe(false);
  });

  it('does not let callers mutate a cached trusted capability into permission', async () => {
    apiGet.mockResolvedValue(response(false));
    const client = await loadClient(true);

    const snapshot = await client.getCapabilities();
    snapshot.subjects.english.submission_enabled = true;

    expect(await client.isSubjectSubmissionEnabled('english')).toBe(false);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('caches successful GETs for no more than 60 seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T00:00:00Z'));
    apiGet.mockResolvedValue(response(true));
    const client = await loadClient(true);

    await client.getCapabilities();
    vi.setSystemTime(new Date('2026-09-02T00:00:59.999Z'));
    await client.getCapabilities();
    expect(apiGet).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-02T00:01:00Z'));
    await client.getCapabilities();
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(client.CAPABILITIES_CACHE_TTL_MS).toBeLessThanOrEqual(60_000);
  });

  it('forces server revalidation immediately before an English submission POST', async () => {
    apiGet.mockResolvedValueOnce(response(true)).mockResolvedValueOnce(response(false));
    const client = await loadClient(true);

    expect(await client.isSubjectSubmissionEnabled('english')).toBe(true);
    expect(await client.revalidateSubjectSubmission('english')).toBe(false);
    expect(apiGet).toHaveBeenNthCalledWith(1, '/capabilities');
    expect(apiGet).toHaveBeenNthCalledWith(2, '/capabilities');
  });

  it.each([
    ['404', Object.assign(new Error('not found'), { response: { status: 404 } })],
    ['network failure', new Error('offline')],
  ])('fails closed for English on %s while preserving Math', async (_name, error) => {
    apiGet.mockRejectedValue(error);
    const client = await loadClient(true);

    expect(await client.isSubjectSubmissionEnabled('english')).toBe(false);
    expect(await client.isSubjectSubmissionEnabled('math')).toBe(true);
  });

  it.each([
    ['unknown version', { ...response(true).data, capability_contract_version: 'capabilities_v2' }],
    ['malformed response', { capability_contract_version: 'capabilities_v1', subjects: { english: {} } }],
  ])('fails closed for English on %s', async (_name, data) => {
    apiGet.mockResolvedValue({ data });
    const client = await loadClient(true);

    const snapshot = await client.getCapabilities();
    expect(snapshot.trusted).toBe(false);
    expect(await client.isSubjectSubmissionEnabled('english')).toBe(false);
    expect(await client.isSubjectSubmissionEnabled('math')).toBe(true);
  });

  it('does not reuse a successful cache entry when forced revalidation fails', async () => {
    apiGet.mockResolvedValueOnce(response(true)).mockRejectedValueOnce(new Error('offline'));
    const client = await loadClient(true);

    expect(await client.isSubjectSubmissionEnabled('english')).toBe(true);
    expect(await client.revalidateSubjectSubmission('english')).toBe(false);
    expect((await client.getCapabilities()).trusted).toBe(false);
  });

  it('does not reuse an allowlisted capability after the authenticated account changes', async () => {
    apiGet.mockResolvedValueOnce(response(true)).mockResolvedValueOnce(response(false));
    const client = await loadClient(true);

    expect(await client.isSubjectSubmissionEnabled('english')).toBe(true);

    window.dispatchEvent(new Event('auth:changed'));

    expect(await client.isSubjectSubmissionEnabled('english')).toBe(false);
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('does not let an older request overwrite a completed forced revalidation', async () => {
    const staleRequest = deferred<ReturnType<typeof response>>();
    const forcedRequest = deferred<ReturnType<typeof response>>();
    apiGet
      .mockImplementationOnce(() => staleRequest.promise)
      .mockImplementationOnce(() => forcedRequest.promise);
    const client = await loadClient(true);

    const staleResult = client.getCapabilities();
    const forcedResult = client.forceCapabilitiesRevalidation();

    forcedRequest.resolve(response(false));
    expect((await forcedResult).subjects.english.submission_enabled).toBe(false);

    staleRequest.resolve(response(true));
    expect((await staleResult).trusted).toBe(false);
    expect(await client.isSubjectSubmissionEnabled('english')).toBe(false);
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
