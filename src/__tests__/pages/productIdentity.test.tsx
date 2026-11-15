import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Login from '@/pages/Login';
import MineAbout from '@/pages/MineAbout';
import { AGREEMENT_SECTIONS, AGREEMENT_SUMMARY } from '@/content/userAgreement';
import { PRIVACY_SECTIONS, PRIVACY_SUMMARY } from '@/content/privacyPolicy';

vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'zh' }) }));
vi.mock('@/services/auth', () => ({ authService: { isLoggedIn: () => false } }));

describe('public product identity', () => {
  it('identifies the product on login without changing the login form', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: '日知AI' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '日知AI 标志' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('手机号码')).toBeInTheDocument();
  });

  it('identifies the product and current Go backend on the about page', () => {
    render(<MemoryRouter><MineAbout /></MemoryRouter>);
    expect(screen.getByText('日知AI')).toBeInTheDocument();
    expect(screen.getByText('后端：Go')).toBeInTheDocument();
    expect(screen.queryByText(/FastAPI/)).not.toBeInTheDocument();
  });

  it('updates legal product names without changing the operator', () => {
    expect(AGREEMENT_SUMMARY.zh).toContain('日知AI');
    expect(PRIVACY_SUMMARY.zh).toContain('日知AI');
    const agreement = JSON.stringify(AGREEMENT_SECTIONS);
    const privacy = JSON.stringify(PRIVACY_SECTIONS);
    expect(agreement).toContain('卢丹（个体经营者）');
    expect(agreement).toContain('Lu Dan');
    expect(agreement + privacy + JSON.stringify([AGREEMENT_SUMMARY, PRIVACY_SUMMARY])).not.toContain('TINT');
  });
});
