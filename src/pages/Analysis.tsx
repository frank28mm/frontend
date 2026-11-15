import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { CapabilitySubject } from '@/services/types';
import { HomeButton } from '@/components/ui/HomeButton';
import { useToast } from '@/components/ui/Toast';
import { SUBJECT_OPTIONS } from '@/config/subjects';
import { useSubjectCapabilities } from '@/hooks/useSubjectCapabilities';
import { useReportSubmission } from '@/hooks/useReportSubmission';

const SUBJECT_LABELS = SUBJECT_OPTIONS.map(({ label }) => label);

const Knob = ({
  label,
  testId,
  options,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  options: string[];
  value: string;
  onChange: (val: string) => void;
}) => {
  const currentIndex = Math.max(0, options.indexOf(value));
  const count = options.length;
  const anglesDeg = useMemo(() => {
    return Array.from({ length: count }, (_, i) => (360 / count) * i);
  }, [count]);
  const stepDeg = 360 / count;
  const previousIndexRef = useRef(currentIndex);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);
  const [rotation, setRotation] = useState(currentIndex * stepDeg);

  useEffect(() => {
    const previousIndex = previousIndexRef.current;
    if (previousIndex === currentIndex) return;

    const forwardSteps = (currentIndex - previousIndex + count) % count;
    setRotation((currentRotation) => currentRotation + forwardSteps * stepDeg);
    previousIndexRef.current = currentIndex;
  }, [count, currentIndex, stepDeg]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    pointerMovedRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
      pointerMovedRef.current = true;
    }
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
    pointerMovedRef.current = false;
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const wasDrag = event.detail !== 0 && pointerMovedRef.current;
    pointerStartRef.current = null;
    pointerMovedRef.current = false;
    if (wasDrag) return;

    const nextIndex = (currentIndex + 1) % options.length;
    onChange(options[nextIndex]);
  };

  return (
    <div className="flex w-full items-center justify-center">
      <button
        type="button"
        aria-label={`${label}：${options[currentIndex] || value || ''}`}
        className="relative w-full max-w-[10.5rem] aspect-square rounded-full bg-neu-bg shadow-neu-flat active:shadow-neu-pressed flex items-center justify-center select-none touch-manipulation cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
      >
        <div className="absolute inset-0 rounded-full border border-white/50 opacity-60 pointer-events-none"></div>

        <div
          data-testid={`${testId}-knob-pointer`}
          className="pointer-events-none z-10 w-[48%] h-[48%] rounded-full bg-gradient-to-br from-white to-[#f2f4f6] shadow-md flex items-center justify-center relative transition-transform duration-500 ease-out"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className="absolute top-2 w-[3px] h-3.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(255,75,75,0.6)] left-1/2 -translate-x-1/2"></div>
          <div className="w-3 h-3 rounded-full bg-neu-bg shadow-neu-pressed"></div>
        </div>

        {options.map((opt, idx) => {
          const deg = anglesDeg[idx] ?? 0;
          const rad = (deg * Math.PI) / 180;
          const x = 50 + Math.sin(rad) * 36;
          const y = 50 - Math.cos(rad) * 36;
          return (
            <div
              key={opt}
              className={cn(
                'absolute z-20 px-1 text-[11px] leading-none font-semibold tracking-normal whitespace-nowrap transition-opacity duration-300 text-center -translate-x-1/2 -translate-y-1/2 pointer-events-none',
                currentIndex === idx ? 'text-red-500 opacity-100' : 'text-neu-text-secondary opacity-40'
              )}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {opt}
            </div>
          );
        })}
      </button>
    </div>
  );
};

const Analysis: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isReadEnabled } = useSubjectCapabilities();
  const [period, setPeriod] = useState('3天');
  const [subject, setSubject] = useState<CapabilitySubject>('math');

  const periodDays = useMemo(() => {
    if (period === '7天') return 7;
    if (period === '30天') return 30;
    return 3;
  }, [period]);
  const submission = useReportSubmission(subject, periodDays, isReadEnabled);
  const { eligibility } = submission;

  const subjectLabel = SUBJECT_OPTIONS.find(({ id }) => id === subject)?.label || '数学';

  return (
    <div className="relative w-full max-w-md mx-auto h-[100dvh] bg-[#EFEEEE] font-display antialiased text-neu-text overflow-hidden">
      <div className="relative w-full h-full flex flex-col justify-between p-6">
        <div className="mt-[max(1rem,env(safe-area-inset-top))] text-center relative z-10 shrink-0">
          <h1 className="text-xl tracking-tight font-bold text-neu-text-secondary font-display opacity-90">
            数据分析中心
          </h1>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center space-y-9 relative z-10 min-h-0">
          <div className="w-full grid grid-cols-2 gap-5 px-3 max-w-[22.5rem]">
            <Knob
              label="天数"
              testId="period"
              options={['3天', '7天', '30天']}
              value={period}
              onChange={setPeriod}
            />
            <Knob
              label="学科"
              testId="subject"
              options={SUBJECT_LABELS}
              value={subjectLabel}
              onChange={(val) => {
                const option = SUBJECT_OPTIONS.find(({ label }) => label === val);
                if (!option) return;
                if (!isReadEnabled(option.id)) {
                  showToast(`${option.label}入口已暂时关闭`, 'info');
                  return;
                }
                setSubject(option.id);
              }}
            />
          </div>

          <div className="flex flex-col items-center gap-3 shrink-0">
            {submission.error && <p role="alert" className="max-w-[22rem] text-center text-sm text-neu-text-secondary">{submission.error}</p>}
            {submission.pendingRequest && <div className="text-center text-sm text-neu-text-secondary">
              <p>已有请求：{SUBJECT_OPTIONS.find(option => option.id === submission.pendingRequest?.subject)?.label} · {submission.pendingRequest.window_days}天</p>
              <p>{submission.pendingRequest.from_date} 至 {submission.pendingRequest.through_date}</p>
            </div>}
            {!submission.pendingRequest && eligibility && !eligibility.eligible && (
              <div className="text-sm text-neu-text-secondary">数据不足，暂不可生成</div>
            )}
            <button
              onClick={() => void submission.submit()}
              disabled={!submission.canSubmit}
              className={cn(
                'group w-24 h-24 rounded-full bg-neu-bg shadow-neu-flat active:shadow-neu-pressed flex items-center justify-center transition-all duration-200 outline-none focus:outline-none',
                'hover:scale-105 active:scale-95',
                !submission.canSubmit && 'opacity-50'
              )}
            >
              <div className="w-20 h-20 rounded-full flex items-center justify-center border border-white/40 bg-gradient-to-br from-white/40 to-transparent">
                <span className="text-sm font-bold text-neu-text tracking-[0.12em] group-active:scale-95 transition-transform ml-0.5">
                  {submission.busy ? '正在提交' : submission.pendingRequest ? '重试已有请求' : '生成报告'}
                </span>
              </div>
            </button>
          </div>
        </div>

        <div className="pb-[max(0.5rem,env(safe-area-inset-bottom))] shrink-0" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 w-full max-w-md mx-auto px-6 pb-8 pt-4 z-50 pointer-events-none flex justify-center bg-gradient-to-t from-[#EFEEEE] via-[#EFEEEE]/80 to-transparent">
        <button
          onClick={() => navigate('/report-history')}
          className="absolute left-12 bottom-10 pointer-events-auto size-16 rounded-full bg-[#EFEEEE] flex items-center justify-center transition-all border-4 border-[#EFEEEE] group shadow-[-8px_-8px_20px_#FFFFFF,8px_8px_20px_#C9CBD0] active:shadow-[inset_6px_6px_12px_#C9CBD0,inset_-6px_-6px_12px_#FFFFFF] text-[#363C4A]/60 hover:text-[#363C4A]"
          aria-label="报告记录"
        >
          <span className="material-symbols-outlined text-[26px] group-active:scale-95 transition-transform">description</span>
        </button>

        <div className="pointer-events-auto">
          <HomeButton />
        </div>
      </div>
    </div>
  );
};

export default Analysis;
