import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { HomeFab } from '@/components/ui/HomeButton';

describe('HomeFab', () => {
  it('reserves flow space on narrow screens and respects the bottom safe area', () => {
    render(
      <MemoryRouter>
        <HomeFab avoidContentOverlap />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Home' });
    const container = button.parentElement?.parentElement;

    expect(container).toHaveClass('bottom-[calc(2rem+env(safe-area-inset-bottom))]');
    expect(container).toHaveClass('max-[360px]:static');
    expect(container).toHaveClass('max-[360px]:shrink-0');
    expect(container).toHaveClass('max-[360px]:pb-[calc(1rem+env(safe-area-inset-bottom))]');
  });
});
