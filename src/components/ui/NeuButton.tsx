import React from 'react';
import { cn } from '@/lib/utils';

interface NeuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'icon' | 'ghost';
    selected?: boolean; // For toggle/segmented buttons
}

export const NeuButton: React.FC<NeuButtonProps> = ({
    children,
    className,
    variant = 'primary',
    selected = false,
    ...props
}) => {
    const baseStyles = "transition-all duration-300 active:scale-95 flex items-center justify-center";

    const variants = {
        primary: `bg-neu-bg text-primary font-bold text-lg shadow-neu-btn active:shadow-neu-pressed rounded-2xl px-8 py-4 w-full`,

        // For segmented controls or secondary actions
        secondary: cn(
            "px-4 py-2 rounded-xl text-sm font-medium shadow-neu-flat text-neu-text-secondary hover:text-primary active:shadow-neu-pressed",
            selected && "shadow-neu-pressed text-primary"
        ),

        // Circular icon button
        icon: "w-10 h-10 rounded-full text-neu-text-secondary shadow-neu-icon active:shadow-neu-icon-pressed active:text-primary",

        ghost: "text-neu-text-secondary hover:text-primary active:scale-95",
    };

    return (
        <button
            className={cn(baseStyles, variants[variant], className)}
            {...props}
        >
            {children}
        </button>
    );
};
