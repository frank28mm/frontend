import React from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/utils';

type HomeButtonProps = {
  to?: string;
  className?: string;
  iconClassName?: string;
  ariaLabel?: string;
};

export const HomeButton: React.FC<HomeButtonProps> = ({
  to = '/',
  className,
  iconClassName,
  ariaLabel = 'Home',
}) => {
  const navigate = useNavigate();

  return (
    <button
      aria-label={ariaLabel}
      onClick={() => navigate(to)}
      className={cn(
        'h-[4.5rem] w-[4.5rem] rounded-full bg-neu-bg shadow-neu-plate flex items-center justify-center text-gray-400 hover:text-neu-text active:text-primary active:shadow-neu-pressed active:scale-95 transition-all duration-300 border border-white/40',
        className
      )}
    >
      <span className={cn('material-symbols-outlined text-3xl', iconClassName)}>home</span>
    </button>
  );
};

type HomeFabProps = {
  to?: string;
  className?: string;
  containerClassName?: string;
  avoidContentOverlap?: boolean;
};

export const HomeFab: React.FC<HomeFabProps> = ({
  to = '/',
  className,
  containerClassName,
  avoidContentOverlap = false,
}) => {
  return (
    <div
      className={cn(
        'fixed bottom-[calc(2rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 flex justify-center pointer-events-none',
        avoidContentOverlap &&
          'max-[360px]:static max-[360px]:shrink-0 max-[360px]:pt-4 max-[360px]:pb-[calc(1rem+env(safe-area-inset-bottom))]',
        containerClassName
      )}
    >
      <div className="pointer-events-auto">
        <HomeButton to={to} className={className} />
      </div>
    </div>
  );
};
