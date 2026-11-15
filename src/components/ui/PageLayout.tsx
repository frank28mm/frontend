import React from 'react';
import { cn } from '@/lib/utils';

interface PageLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const PageLayout: React.FC<PageLayoutProps> = ({ children, className, ...props }) => {
    return (
        <div className="min-h-[100dvh] w-full bg-neu-bg flex justify-center selection:bg-primary/20">
            <div
                className={cn(
                    "w-full max-w-md min-h-[100dvh] bg-neu-bg text-neu-text relative shadow-2xl overflow-x-hidden",
                    className
                )}
                {...props}
            >
                {children}
            </div>
        </div>
    );
};
