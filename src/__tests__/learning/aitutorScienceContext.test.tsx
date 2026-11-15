import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGetMock, capabilityState, navigateMock, route } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  capabilityState: {
    loading: false,
    readEnabled: true,
  },
  navigateMock: vi.fn(),
  route: {
    itemId: 'target-item',
    submissionId: 'science-submission',
    subject: 'physics',
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: encodeURIComponent(route.itemId) }),
    useLocation: () => ({
      search: `?submissionId=${encodeURIComponent(route.submissionId)}`,
      state: {
        submissionId: route.submissionId,
        subject: route.subject,
      },
    }),
  };
});

vi.mock('@/services/api', () => ({
  apiClient: {
    defaults: { baseURL: '/api' },
    get: apiGetMock,
  },
}));

vi.mock('@/config/features', () => ({
  FEATURE_ENGLISH_RENDER_ENABLED: true,
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    loading: capabilityState.loading,
    isReadEnabled: () => capabilityState.readEnabled,
    isSubmissionEnabled: () => true,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/components/ui/Header', () => ({
  Header: ({ title }: { title: string }) => <header>{title}</header>,
}));

vi.mock('@/components/ui/QuestionText', () => ({
  QuestionText: ({ text }: { text: string }) => <div data-testid="question-text">{text}</div>,
}));

const HASH = `sha256:${'a'.repeat(64)}`;

const createStorageMock = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  } as Storage;
};

const scienceTag = (subject: 'physics' | 'chemistry') => ({
  id: `${subject}:mechanics:experiment:observation`,
  tag_id: `${subject}:mechanics:experiment:observation`,
  taxonomy_version: `${subject}_cn_secondary_v1`,
  name: '实验观察',
  canonical_path: '实验/观察/实验观察',
  primary_domain: '实验',
  category_id: 'experiment/observation',
  category_name: '观察',
  leaf_name: '实验观察',
});

const scienceQuestion = (
  subject: 'physics' | 'chemistry',
  itemId: string,
  materialGroupId: string,
  text: string,
  evidenceRefs: string[],
) => ({
  item_id: itemId,
  question_number: '7',
  page_index: 0,
  subject,
  display_mode: 'material_group',
  material_group_id: materialGroupId,
  group_position: 1,
  answer_mode: 'unknown',
  question_type: 'experiment',
  question_text: text,
  question_content: text,
  options: [],
  student_answer: 'student answer',
  answer_state: 'has_answer',
  verdict: 'incorrect',
  verdict_source: 'model',
  reason: 'reason',
  judgment_basis: [],
  knowledge_tags: ['实验/观察/实验观察'],
  knowledge_tag_items: [scienceTag(subject)],
  evidence_refs: evidenceRefs,
  accepted_answer_payloads: [],
  contract_provenance: 'native_v1',
  degradation_reasons: [],
});

const imageEvidence = (
  evidenceId: string,
  ownerType: 'question' | 'material',
  ownerId: string,
  role: 'question' | 'material',
  imageUrl: string,
) => ({
  evidence_id: evidenceId,
  owner_type: ownerType,
  owner_id: ownerId,
  role,
  kind: 'bbox',
  canonicalization_version: 'evidence_v1',
  content_hash: HASH,
  page_index: 0,
  storage_ref: `/files/${evidenceId}.png`,
  image_url: imageUrl,
  bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, unit: 'normalized' },
});

const scienceSubmission = (subject: 'physics' | 'chemistry') => {
  const targetQuestion = scienceQuestion(
    subject,
    'target-item',
    'target-group',
    `${subject} exact target question`,
    ['target-question-evidence'],
  );
  const decoyQuestion = scienceQuestion(
    subject,
    'decoy-item',
    'decoy-group',
    `${subject} duplicate-number decoy`,
    ['decoy-question-evidence'],
  );

  return {
    submission_id: 'science-submission',
    subject,
    artifact_contract_version: 'learning_artifacts_v1',
    artifact_contract_revision: 1,
    artifact_contract_provenance: 'native_v1',
    artifact_contract_status: 'complete',
    artifact_contract_warnings: [],
    material_groups: [
      {
        group_id: 'target-group',
        title: 'Target group',
        material_type: 'diagram',
        display_order: 1,
        page_indices: [0],
        status: 'complete',
        warnings: [],
        materials: [{
          material_id: 'target-material',
          kind: 'diagram',
          display_order: 1,
          text: `${subject} exact target material`,
          evidence_refs: ['target-material-evidence'],
        }],
        item_ids: ['target-item'],
      },
      {
        group_id: 'decoy-group',
        title: 'Decoy group',
        material_type: 'diagram',
        display_order: 2,
        page_indices: [0],
        status: 'complete',
        warnings: [],
        materials: [{
          material_id: 'decoy-material',
          kind: 'diagram',
          display_order: 1,
          text: `${subject} decoy material`,
          evidence_refs: ['decoy-material-evidence'],
        }],
        item_ids: ['decoy-item'],
      },
    ],
    evidence_registry: [
      imageEvidence('target-question-evidence', 'question', 'target-item', 'question', '/target-question.png'),
      imageEvidence('decoy-question-evidence', 'question', 'decoy-item', 'question', '/decoy-question.png'),
      imageEvidence('target-material-evidence', 'material', 'target-material', 'material', '/target-material.png'),
      imageEvidence('decoy-material-evidence', 'material', 'decoy-material', 'material', '/decoy-material.png'),
    ],
    presentation_nodes: [
      { node_id: 'target-node', kind: 'material_group', ref_id: 'target-group', display_order: 1 },
      { node_id: 'decoy-node', kind: 'material_group', ref_id: 'decoy-group', display_order: 2 },
    ],
    questions: [decoyQuestion, targetQuestion],
    question_cards: [{
      item_id: 'decoy-item',
      question_number: '7',
      page_index: 0,
      verdict: 'incorrect',
      visual_risk: true,
      question_content: `${subject} card selected by duplicate number`,
      figure_slice_image_url: '/decoy-card.png',
    }],
  };
};

describe('AITutor science canonical context', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
    });
    apiGetMock.mockReset();
    navigateMock.mockReset();
    capabilityState.loading = false;
    capabilityState.readEnabled = true;
    route.itemId = 'target-item';
    route.submissionId = 'science-submission';
    route.subject = 'physics';
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
  });

  it('never restores saved tutoring messages after subject confirmation', async () => {
    localStorage.setItem('chat_session_science-submission_target-item', 'old-session');
    localStorage.setItem('chat_history_science-submission_target-item', JSON.stringify([
      { id: 'old', role: 'assistant', content: 'OLD PRIVATE CHAT', timestamp: '' },
    ]));
    apiGetMock.mockResolvedValue({ data: scienceSubmission('physics') });
    const { default: AITutor } = await import('@/pages/AITutor');
    render(<AITutor />);
    await screen.findByTestId('question-text');
    expect(screen.queryByText('OLD PRIVATE CHAT')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps follow-up context in memory without writing tutor storage', async () => {
    apiGetMock.mockResolvedValue({ data: scienceSubmission('physics') });
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      return new Response(`event: chat\ndata: ${JSON.stringify({
        session_id: 'short-session',
        messages: [...request.history, { role: 'assistant', content: 'Current reply' }],
      })}\n\nevent: done\ndata: {}\n\n`);
    });
    const { default: AITutor } = await import('@/pages/AITutor');
    const view = render(<AITutor />);
    await screen.findByTestId('question-text');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First question' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await screen.findByText('Current reply');
    await waitFor(() => expect(screen.getByRole('button', { name: '发送' })).toBeDisabled());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Follow up' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const second = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(second.session_id).toBe('short-session');
    expect(second.history).toContainEqual({ role: 'assistant', content: 'Current reply' });
    expect(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)))
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/^chat_(history|session)_/)]));
    view.unmount();
    render(<AITutor />);
    await screen.findByTestId('question-text');
    expect(screen.queryByText('First question')).not.toBeInTheDocument();
    expect(screen.queryByText('Current reply')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['SESSION_EXPIRED', 'SESSION_NOT_FOUND'])('restarts %s with only the current question', async (code) => {
    apiGetMock.mockResolvedValue({ data: scienceSubmission('physics') });
    let calls = 0;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      calls += 1;
      if (calls === 2) return new Response(`event: error\ndata: ${JSON.stringify({ code, message: 'expired' })}\n\nevent: done\ndata: {}\n\n`);
      const request = JSON.parse(String(init?.body));
      return new Response(`event: chat\ndata: ${JSON.stringify({
        session_id: calls === 1 ? 'initial-session' : 'fresh-session',
        messages: [...request.history, { role: 'assistant', content: calls === 1 ? 'Old reply' : 'Fresh reply' }],
      })}\n\nevent: done\ndata: {}\n\n`);
    });
    const { default: AITutor } = await import('@/pages/AITutor');
    render(<AITutor />);
    await screen.findByTestId('question-text');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Old question' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await screen.findByText('Old reply');
    await waitFor(() => expect(screen.getByRole('button', { name: '发送' })).toBeDisabled());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New question' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await screen.findByText('Fresh reply');
    const retry = JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body));
    expect(retry.session_id).toBeUndefined();
    expect(retry.history).toEqual([{ role: 'user', content: 'New question' }]);
    expect(retry.context_item_ids).toEqual(['target-item']);
    expect(screen.queryByText('Old reply')).not.toBeInTheDocument();
    expect(screen.queryByText(/expired/)).not.toBeInTheDocument();
  });

  it('does not let a late submission response replace a new question scope', async () => {
    let resolveOld: ((value: { data: ReturnType<typeof scienceSubmission> }) => void) | undefined;
    apiGetMock.mockImplementation((url: string) => url === '/submissions/science-submission'
      ? new Promise((resolve) => { resolveOld = resolve; })
      : Promise.resolve({ data: scienceSubmission('chemistry') }));
    const { default: AITutor } = await import('@/pages/AITutor');
    const view = render(<AITutor />);
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());
    route.submissionId = 'second-submission';
    route.subject = 'chemistry';
    view.rerender(<AITutor />);
    await screen.findByText('chemistry exact target question');
    await act(async () => {
      resolveOld?.({ data: scienceSubmission('physics') });
    });
    expect(screen.getByText('chemistry exact target question')).toBeInTheDocument();
    expect(screen.queryByText('physics exact target question')).not.toBeInTheDocument();
  });

  it('ignores a delayed HTTP error body after the answer is stopped', async () => {
    apiGetMock.mockResolvedValue({ data: scienceSubmission('physics') });
    let resolveBody: ((text: string) => void) | undefined;
    const text = vi.fn(() => new Promise<string>((resolve) => { resolveBody = resolve; }));
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503, text } as unknown as Response);
    const { default: AITutor } = await import('@/pages/AITutor');
    render(<AITutor />);
    await screen.findByTestId('question-text');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Question' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => expect(text).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '停止回答' }));
    await act(async () => { resolveBody?.('OLD ERROR BODY'); });
    expect(screen.queryByText(/OLD ERROR BODY|503/)).not.toBeInTheDocument();
  });

  it('does not restore cached chat before the submission confirms the subject', async () => {
    route.subject = 'math';
    window.localStorage.setItem(
      'chat_session_science-submission_target-item',
      'saved-session',
    );
    window.localStorage.setItem(
      'chat_history_science-submission_target-item',
      JSON.stringify([{
        id: 'cached-message',
        role: 'assistant',
        content: 'Cached chat must stay hidden until subject confirmation.',
        timestamp: '2026-09-15T00:00:00.000Z',
      }]),
    );
    apiGetMock.mockReturnValue(new Promise(() => undefined));
    const { default: AITutor } = await import('@/pages/AITutor');

    render(<AITutor />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(apiGetMock).toHaveBeenCalledWith('/submissions/science-submission');
    expect(screen.queryByText('Cached chat must stay hidden until subject confirmation.')).not.toBeInTheDocument();
  });

  it('does not call chat before the submission confirms the subject', async () => {
    route.subject = 'math';
    window.localStorage.setItem(
      'chat_session_science-submission_target-item',
      'saved-session',
    );
    apiGetMock.mockReturnValue(new Promise(() => undefined));
    const { default: AITutor } = await import('@/pages/AITutor');

    render(<AITutor />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(apiGetMock).toHaveBeenCalledWith('/submissions/science-submission');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not restore a known Science chat while runtime capability is pending', async () => {
    capabilityState.loading = true;
    capabilityState.readEnabled = false;
    window.localStorage.setItem(
      'chat_session_science-submission_target-item',
      'saved-science-session',
    );
    apiGetMock.mockResolvedValue({ data: scienceSubmission('physics') });
    const { default: AITutor } = await import('@/pages/AITutor');

    render(<AITutor />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(apiGetMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('physics exact target question')).not.toBeInTheDocument();
  });

  it('blocks a known Science chat before requests when runtime capability is disabled', async () => {
    capabilityState.readEnabled = false;
    apiGetMock.mockResolvedValue({ data: scienceSubmission('physics') });
    const { default: AITutor } = await import('@/pages/AITutor');

    render(<AITutor />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    expect(apiGetMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['physics', 'chemistry'] as const)(
    'uses exact item, material group, and owned evidence for %s',
    async (subject) => {
      route.subject = subject;
      apiGetMock.mockResolvedValue({ data: scienceSubmission(subject) });
      const { default: AITutor } = await import('@/pages/AITutor');

      render(<AITutor />);

      expect(await screen.findByTestId('question-text')).toHaveTextContent(`${subject} exact target question`);
      expect(screen.getByText(`${subject} exact target material`)).toBeInTheDocument();
      expect(screen.queryByText(`${subject} decoy material`)).not.toBeInTheDocument();

      const questionImage = screen.getByAltText('题目图示');
      expect(questionImage).toHaveAttribute('src', '/target-question.png');
      const material = screen.getByText(`${subject} exact target material`).closest('section');
      expect(material).not.toBeNull();
      expect(within(material!).getByAltText('材料证据')).toHaveAttribute('src', '/target-material.png');
      expect(document.querySelector('img[src="/decoy-question.png"]')).toBeNull();
      expect(document.querySelector('img[src="/decoy-material.png"]')).toBeNull();
      expect(document.querySelector('img[src="/decoy-card.png"]')).toBeNull();
    },
  );

  it('preserves Math question-number fallback for legacy submissions', async () => {
    route.itemId = 'p1:q:7';
    route.submissionId = 'math-submission';
    route.subject = 'math';
    apiGetMock.mockResolvedValue({
      data: {
        submission_id: 'math-submission',
        subject: 'math',
        questions: [{
          item_id: 'legacy-math-item',
          question_number: '7',
          question_text: 'Legacy Math fallback question',
        }],
        question_cards: [],
      },
    });
    const { default: AITutor } = await import('@/pages/AITutor');

    render(<AITutor />);

    expect(await screen.findByTestId('question-text')).toHaveTextContent('Legacy Math fallback question');
  });
});
