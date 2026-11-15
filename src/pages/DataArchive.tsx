import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useKnowledgeArchive } from '@/hooks/useAppSWR';
import type { CapabilitySubject, KnowledgeArchiveNode } from '@/services/types';
import { useToast } from '@/components/ui/Toast';
import { BackButton } from '@/components/ui/BackButton';
import {
  isCapabilitySubject,
  SUBJECT_OPTIONS,
} from '@/config/subjects';
import { useSubjectCapabilities } from '@/hooks/useSubjectCapabilities';

type MistakeState = 'active' | 'mastered';

const subjectFromQuery = (value: string | null): CapabilitySubject =>
  isCapabilitySubject(value) ? value : 'math';

const stateFromQuery = (value: string | null): MistakeState =>
  value === 'mastered' ? 'mastered' : 'active';

const DataArchive: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { loading: capabilitiesLoading, isReadEnabled } = useSubjectCapabilities();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const requestedSubject = subjectFromQuery(searchParams.get('subject'));
  const subject = requestedSubject;
  const subjectReadEnabled = isReadEnabled(subject);
  const subjectGatePending = capabilitiesLoading && !subjectReadEnabled;
  const mistakeState = stateFromQuery(searchParams.get('mistake_state'));
  const selectedDomainID = (searchParams.get('domain') || '').trim();
  const selectedModuleID = (searchParams.get('module') || '').trim();
  const { data, isLoading: archiveLoading, error } = useKnowledgeArchive(
    subject,
    mistakeState,
    subjectReadEnabled,
  );
  const isLoading = subjectGatePending || archiveLoading;

  useEffect(() => {
    if (capabilitiesLoading || subjectReadEnabled) return;
    const label = SUBJECT_OPTIONS.find(({ id }) => id === subject)?.label || '该学科';
    showToast(`${label}入口已暂时关闭`, 'info');
    navigate('/data?subject=math', { replace: true });
  }, [capabilitiesLoading, navigate, showToast, subject, subjectReadEnabled]);

  const selectedDomain = useMemo(
    () => data?.nodes.find((node) => node.id === selectedDomainID) || null,
    [data?.nodes, selectedDomainID]
  );
  const selectedModule = useMemo(
    () => selectedDomain?.children.find((node) => node.id === selectedModuleID) || null,
    [selectedDomain, selectedModuleID]
  );
  const visibleNodes = useMemo(
    () => selectedModule?.children || selectedDomain?.children || data?.nodes || [],
    [data?.nodes, selectedDomain, selectedModule]
  );
  const currentLevel = selectedModule ? 3 : selectedDomain ? 2 : 1;
  const pageTitle = selectedModule?.name || selectedDomain?.name || '数据中心';
  const visibleItemCount = selectedModule?.count ?? selectedDomain?.count ?? data?.total_items;
  const sectionTitle = currentLevel === 1
    ? (subject === 'math' ? '组合分类' : '学科大类')
    : currentLevel === 2
      ? '标准模块'
      : '知识单元';

  const nodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return visibleNodes;
    return visibleNodes.filter((node) => {
      const descendants = node.children.flatMap((child) => [
        child.name,
        ...child.children.map((unit) => unit.name),
      ]);
      return [node.name, node.canonical_path, ...descendants]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [searchQuery, visibleNodes]);

  const goToArchive = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    navigate(`/data?${next.toString()}`);
  };

  const selectSubject = (nextSubject: CapabilitySubject) => {
    if (!isReadEnabled(nextSubject)) {
      const label = SUBJECT_OPTIONS.find(({ id }) => id === nextSubject)?.label || '该学科';
      showToast(`${label}入口已暂时关闭`, 'info');
      return;
    }
    setSearchQuery('');
    goToArchive({ subject: nextSubject, domain: null, module: null });
  };

  const openNode = (node: KnowledgeArchiveNode) => {
    setSearchQuery('');
    if (node.level === 1) {
      goToArchive({ domain: node.id, module: null });
      return;
    }
    if (node.level === 2) {
      goToArchive({ module: node.id });
      return;
    }
    const detailParams = new URLSearchParams({
      subject,
      mode: mistakeState === 'mastered' ? 'mastered' : 'review',
      taxonomy_version: node.taxonomy_version || data?.taxonomy_version || '',
      tag_name: node.name,
    });
    navigate(`/data/category/${encodeURIComponent(node.id)}?${detailParams.toString()}`, {
      state: {
        tagId: node.id,
        tagName: node.name,
        mode: mistakeState === 'mastered' ? 'mastered' : 'review',
        subject,
        taxonomyVersion: node.taxonomy_version || data?.taxonomy_version,
      },
    });
  };

  const goBack = () => {
    setSearchQuery('');
    if (selectedModule) {
      goToArchive({ module: null });
      return;
    }
    if (selectedDomain) {
      goToArchive({ domain: null, module: null });
    }
  };

  const toggleMistakeState = () => {
    goToArchive({
      mistake_state: mistakeState === 'active' ? 'mastered' : 'active',
      domain: null,
      module: null,
    });
  };

  return (
    <div className="bg-[#EFEEEE] h-[100dvh] relative w-full max-w-md mx-auto flex flex-col overflow-hidden antialiased selection:bg-[#26A9DB]/20 font-display text-[#363C4A]">
      <header className="shrink-0 pt-6 pb-2 px-6 flex flex-col gap-3 z-20 bg-[#EFEEEE]/90 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          {selectedDomain ? <BackButton onClick={goBack} /> : <div className="size-12" />}
          <h1 className="min-w-0 flex-1 px-3 text-center text-xl font-extrabold text-[#363C4A] truncate">
            {pageTitle}
          </h1>
          <button
            type="button"
            aria-label="搜索知识点"
            onClick={() => setShowSearch(!showSearch)}
            className="flex items-center justify-center size-12 rounded-full shadow-[-8px_-8px_20px_#FFFFFF,8px_8px_20px_#C9CBD0] active:shadow-[inset_6px_6px_12px_#C9CBD0,inset_-6px_-6px_12px_#FFFFFF] transition-all duration-200 text-[#363C4A]"
          >
            <span className="material-symbols-outlined text-[24px]">search</span>
          </button>
        </div>

        {showSearch && (
          <div className="w-full">
            <input
              type="search"
              aria-label="搜索知识点标签"
              placeholder="搜索知识点标签..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full px-4 py-3 rounded-2xl bg-[#EFEEEE] shadow-[inset_6px_6px_12px_#C9CBD0,inset_-6px_-6px_12px_#FFFFFF] text-[#363C4A] placeholder:text-[#64748B]/50 text-sm focus:outline-none"
            />
          </div>
        )}
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar flex flex-col px-6 pb-32">
        <div className="mt-8 mb-5 w-full flex justify-center">
          <div className="grid w-full max-w-[340px] grid-cols-4 gap-1.5 rounded-2xl bg-[#EFEEEE] p-1.5 shadow-[inset_6px_6px_12px_#C9CBD0,inset_-6px_-6px_12px_#FFFFFF]">
            {SUBJECT_OPTIONS.map((option) => {
              const active = subject === option.id;
                const enabled = isReadEnabled(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  aria-disabled={!enabled}
                  onClick={() => selectSubject(option.id)}
                  className={`h-12 min-w-0 rounded-xl text-sm font-bold transition-all ${
                    active
                      ? 'bg-[#EFEEEE] text-[#363C4A] shadow-[0_0_15px_rgba(38,169,219,0.2),-4px_-4px_10px_#FFFFFF,4px_4px_10px_#C9CBD0]'
                      : 'text-[#363C4A]/40 hover:text-[#363C4A]/70'
                  } ${enabled ? '' : 'cursor-not-allowed opacity-50'}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-full text-center text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
          {mistakeState === 'active' ? '错题面板' : '已掌握面板'} · {sectionTitle}
        </div>
        <div className="w-full text-center text-[11px] font-semibold text-gray-400 mb-4">
          {visibleItemCount !== undefined ? `${visibleItemCount} 题` : ''}
        </div>

        {isLoading && <div className="text-sm text-gray-400 text-center mt-6">加载中...</div>}
        {!isLoading && error && <div className="text-sm text-red-400 text-center mt-6">数据加载失败</div>}
        {!isLoading && !error && nodes.length === 0 && (
          <div className="text-sm text-gray-400 text-center mt-6">暂无数据</div>
        )}

        <div className="grid grid-cols-2 gap-5 w-full mt-2">
          {nodes.map((node) => (
            <button
              type="button"
              key={node.id}
              onClick={() => openNode(node)}
              className="group relative min-h-[180px] flex flex-col p-5 text-left bg-[#EFEEEE] rounded-3xl transition-all duration-200 cursor-pointer overflow-hidden border border-white/50 shadow-[-8px_-8px_20px_#FFFFFF,8px_8px_20px_#C9CBD0] active:shadow-[inset_5px_5px_10px_#C9CBD0,inset_-5px_-5px_10px_#FFFFFF]"
            >
              <div className="flex w-full justify-between items-start mb-4 gap-2">
                <div className="size-10 shrink-0 rounded-full flex items-center justify-center shadow-[inset_3px_3px_6px_#C9CBD0,inset_-3px_-3px_6px_#FFFFFF] text-[#363C4A]/80">
                  <span className="material-symbols-outlined text-[20px]">
                    {node.level === 3 ? 'topic' : 'folder'}
                  </span>
                </div>
                <span className="text-4xl font-extrabold leading-none text-[#363C4A] tabular-nums">
                  {node.count.toString().padStart(2, '0')}
                </span>
              </div>
              <h2 className="text-base font-bold leading-snug mb-5 mt-1 text-black break-words">
                {node.name}
              </h2>
              <div className="flex flex-wrap gap-2 mt-auto">
                {node.children.slice(0, 2).map((child) => (
                  <span
                    key={child.id}
                    className="max-w-full px-3 py-1.5 rounded-full bg-[#EFEEEE] text-[10px] font-semibold leading-tight shadow-[inset_2px_2px_5px_#D1D3D6,inset_-2px_-2px_5px_#FFFFFF] text-[#363C4A]/70 break-words"
                  >
                    {child.name}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto px-6 pb-8 pt-4 z-50 pointer-events-none flex justify-center bg-gradient-to-t from-[#EFEEEE] via-[#EFEEEE]/80 to-transparent">
        <button
          type="button"
          onClick={toggleMistakeState}
          aria-label={mistakeState === 'active' ? '查看已掌握题目' : '查看错题'}
          aria-pressed={mistakeState === 'mastered'}
          className={`absolute left-12 bottom-10 pointer-events-auto size-16 rounded-full bg-[#EFEEEE] flex items-center justify-center transition-all border-4 border-[#EFEEEE] group ${
            mistakeState === 'mastered'
              ? 'shadow-[inset_6px_6px_12px_#C9CBD0,inset_-6px_-6px_12px_#FFFFFF] text-[#10B981]'
              : 'shadow-[-8px_-8px_20px_#FFFFFF,8px_8px_20px_#C9CBD0] active:shadow-[inset_6px_6px_12px_#C9CBD0,inset_-6px_-6px_12px_#FFFFFF] text-[#363C4A]/60 hover:text-[#363C4A]'
          }`}
        >
          <span className="font-extrabold text-lg group-active:scale-95 transition-transform tracking-wider">OK</span>
        </button>
        <button
          type="button"
          aria-label="返回首页"
          onClick={() => navigate('/')}
          className="pointer-events-auto h-[4.5rem] w-[4.5rem] rounded-full bg-neu-bg shadow-neu-plate flex items-center justify-center text-gray-400 hover:text-neu-text active:text-primary active:shadow-neu-pressed active:scale-95 transition-all duration-300 border border-white/40"
        >
          <span className="material-symbols-outlined text-3xl">home</span>
        </button>
      </div>
    </div>
  );
};

export default DataArchive;
