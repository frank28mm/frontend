import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Link, MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { QuestionDetailRoute } from '@/components/QuestionDetailRoute';

vi.mock('@/pages/QuestionDetail', () => ({ default: function Detail() {
  const [params] = useSearchParams();
  const [loadedSubmission] = useState(params.get('submissionId'));
  return <p>Loaded evidence: {loadedSubmission}</p>;
} }));
it('reloads evidence when question identity is reused in a different submission', async () => {
  render(<MemoryRouter initialEntries={['/question/q1?submissionId=S1']}><Link to="/question/q1?submissionId=S2">Other submission</Link><Routes><Route path="/question/:id" element={<QuestionDetailRoute />} /></Routes></MemoryRouter>);
  expect(screen.getByText('Loaded evidence: S1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Other submission' }));
  expect(await screen.findByText('Loaded evidence: S2')).toBeInTheDocument();
});
