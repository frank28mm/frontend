import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('utils: cn', () => {
    it('should merge class names correctly', () => {
        const result = cn('c1', 'c2');
        expect(result).toBe('c1 c2');
    });

    it('should handle conditional classes', () => {
        const condition1 = true;
        const condition2 = false;
        const result = cn('c1', condition1 && 'c2', condition2 && 'c3');
        expect(result).toBe('c1 c2');
    });

    it('should merge tailwind classes properly', () => {
        // tailwind-merge should resolve conflicts, e.g., p-4 overrides p-2
        const result = cn('p-2', 'p-4');
        expect(result).toBe('p-4');
    });

    it('should handle objects', () => {
        const result = cn('c1', { c2: true, c3: false });
        expect(result).toBe('c1 c2');
    });
});
