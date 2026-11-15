import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { describe, it, expect } from 'vitest';

const TestComponent = () => {
    const { showToast } = useToast();
    return (
        <button onClick={() => showToast('Hello World', 'success')}>
            Trigger Toast
        </button>
    );
};

describe('Toast Component', () => {
    it('should show toast message when triggered', async () => {
        const user = userEvent.setup();
        render(
            <ToastProvider>
                <TestComponent />
            </ToastProvider>
        );

        const button = screen.getByText('Trigger Toast');
        await user.click(button);

        // Toast should appear
        expect(await screen.findByText('Hello World')).toBeInTheDocument();
    });
});
