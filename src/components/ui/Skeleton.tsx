import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'text' | 'circular' | 'rectangular';
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, variant = 'rectangular', ...props }) => {
    return (
        <div
            className={cn(
                "animate-pulse bg-gray-200/80 shadow-inner",
                variant === 'circular' ? "rounded-full" : "rounded-xl",
                className
            )}
            {...props}
        />
    );
};
