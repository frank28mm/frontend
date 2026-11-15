import { PRODUCT_IDENTITY } from '@/content/productIdentity';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackButton } from '@/components/ui/BackButton';
import { HomeFab } from '@/components/ui/HomeButton';

const MineAbout: React.FC = () => {
  const navigate = useNavigate();

  const appVersion = useMemo(() => '0.9', []);

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col max-w-md mx-auto bg-neu-bg pb-32 overflow-hidden">
      <header className="sticky top-0 z-30 flex items-center justify-center px-6 pt-12 pb-6 bg-neu-bg/90 backdrop-blur-sm relative">
        <div className="absolute left-6">
          <BackButton onClick={() => navigate(-1)} />
        </div>
        <h1 className="text-xl font-bold text-neu-text-secondary tracking-tight">关于</h1>
      </header>

      <main className="flex-1 px-6 overflow-y-auto no-scrollbar pb-10 space-y-5">
        <div className="rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-neu-text-secondary" style={{ fontSize: '20px' }}>
              edit
            </span>
            <div className="text-lg font-bold text-neu-text tracking-tight">{PRODUCT_IDENTITY.name}</div>
          </div>
          <div className="mt-6 space-y-3 text-sm text-neu-text">
            <div className="flex items-center justify-between">
              <span className="text-neu-text-secondary">版本</span>
              <span>{appVersion}</span>
            </div>
            <div className="h-px bg-black/5" />
            <div className="flex items-center justify-between">
              <span className="text-neu-text-secondary">定位</span>
              <span>个性化学习数据库</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-6">
          <div className="text-[10px] font-bold tracking-widest text-neu-text-secondary uppercase">我们在做什么</div>
          <div className="mt-3 text-sm text-neu-text leading-relaxed space-y-2">
            <p>帮助家长和孩子更快完成作业批改、错题回顾与阶段性学习分析。</p>
            <p>你可以通过拍照上传获取批改结果，并在“数据中心”查看知识点分布，在“分析报告”查看阶段学习画像。</p>
          </div>
        </div>

        <div className="rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-6">
          <div className="text-[10px] font-bold tracking-widest text-neu-text-secondary uppercase">使用说明</div>
          <div className="mt-3 text-sm text-neu-text leading-relaxed space-y-2">
            <p>AI 批改与辅导结果仅作为学习参考，不能替代老师的最终教学判断。</p>
            <p>如遇识别偏差、图示缺失或结果异常，建议结合题目原图进行复核。</p>
          </div>
        </div>

        <div className="rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-6">
          <div className="text-[10px] font-bold tracking-widest text-neu-text-secondary uppercase">技术与服务</div>
          <div className="mt-3 text-sm text-neu-text leading-relaxed space-y-2">
            <p>前端：React + TypeScript</p>
            <p>后端：Go</p>
            <p>智能能力：OCR / 视觉理解 / 对话模型</p>
          </div>
        </div>

        <div className="rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-6">
          <div className="text-[10px] font-bold tracking-widest text-neu-text-secondary uppercase">联系与反馈</div>
          <div className="mt-3 text-sm text-neu-text leading-relaxed">
            如你有建议、问题或需要协助，请前往：我的 → 帮助与反馈。
          </div>
        </div>
      </main>

      <HomeFab to="/" containerClassName="z-40" />
    </div>
  );
};

export default MineAbout;
