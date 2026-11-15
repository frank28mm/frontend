import React, { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackButton } from '@/components/ui/BackButton';
import { HomeFab } from '@/components/ui/HomeButton';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/contexts/ProfileContext';
import { useQuota } from '@/hooks/useQuota'; // Added
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/api';
import type { ProfileItem } from '@/services/types';
import ImageCropper from '@/components/ImageCropper';

type ModalMode = 'create' | 'rename';

const extractHttpStatus = (err: unknown): number | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  if (!('response' in err)) return undefined;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  if (!('status' in response)) return undefined;
  const status = (response as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

const extractHttpDetail = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  if (!('response' in err)) return undefined;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  if (!('data' in response)) return undefined;
  const data = (response as { data?: unknown }).data;
  if (typeof data === 'string') return data;
  if (typeof data !== 'object' || data === null) return undefined;
  if (!('detail' in data)) return undefined;
  const detail = (data as { detail?: unknown }).detail;
  return typeof detail === 'string' ? detail : undefined;
};

const ProfileManagement: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { profiles, activeProfileId, activeProfile, setActiveProfile, refresh, loading } = useProfile();
  const { quota } = useQuota(); // Added

  const selectedProfileId = activeProfileId || activeProfile?.profile_id || null;
  const isVip = Boolean(quota?.plan_tier && ['S1', 'S2', 'S3', 'S4', 'S5'].includes(quota.plan_tier));
  const canAdd = isVip || profiles.length < 1;

  const [modalOpen, setModalOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [targetProfile, setTargetProfile] = useState<ProfileItem | null>(null);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);

  // Avatar states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);

  const canDelete = useMemo(() => profiles.length > 1, [profiles.length]);

  const resetModalState = () => {
    setDraftName('');
    setAvatarPreview(null);
    setAvatarBlob(null);
    setCroppingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCreate = () => {
    if (!canAdd) {
      setUpgradeModalOpen(true);
      return;
    }
    setModalMode('create');
    setTargetProfile(null);
    resetModalState();
    setModalOpen(true);
  };

  const openRename = (p: ProfileItem) => {
    setModalMode('rename');
    setTargetProfile(p);
    resetModalState();
    setDraftName(p.display_name || '');
    setAvatarPreview(p.avatar_url || null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setCroppingImage(reader.result as string);
      });
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = (croppedBlob: Blob) => {
    setAvatarBlob(croppedBlob);
    setAvatarPreview(URL.createObjectURL(croppedBlob));
    setCroppingImage(null);
  };

  const onCropCancel = () => {
    setCroppingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarBlob) return null;
    const formData = new FormData();
    formData.append('file', avatarBlob, 'avatar.jpg');
    // Using existing uploads endpoint which returns { page_image_urls: [...] }
    const res = await apiClient.post<{ page_image_urls: string[] }>('/uploads', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data?.page_image_urls?.[0] || null;
  };

  const submitModal = async () => {
    const name = draftName.trim();
    if (!name) {
      showToast('请输入孩子名称', 'warning');
      return;
    }
    if (name.length > 30) {
      showToast('名称太长（最多 30 个字符）', 'warning');
      return;
    }

    setSaving(true);
    try {
      let avatarUrl = targetProfile?.avatar_url || null; // Keep existing
      
      // If new avatar selected, upload it first
      if (avatarBlob) {
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          avatarUrl = uploadedUrl;
        }
      }

      if (modalMode === 'create') {
        const res = await apiClient.post<ProfileItem>('/me/profiles', { 
          display_name: name, 
          avatar_url: avatarUrl 
        });
        await refresh();
        if (res.data?.profile_id) {
          await setActiveProfile(res.data.profile_id);
        }
        showToast('已创建子账号', 'success');
        setModalOpen(false);
        return;
      }

      if (modalMode === 'rename') {
        const pid = targetProfile?.profile_id;
        if (!pid) {
          showToast('未找到目标子账号', 'error');
          return;
        }
        await apiClient.patch<ProfileItem>(`/me/profiles/${encodeURIComponent(pid)}`, { 
          display_name: name,
          avatar_url: avatarUrl
        });
        await refresh();
        showToast('已更新信息', 'success');
        setModalOpen(false);
      }
    } catch (err: unknown) {
      const status = extractHttpStatus(err);
      const detail = extractHttpDetail(err);
      if (status === 409) {
        showToast('该名字已存在，请换一个', 'warning');
      } else if (detail) {
        showToast(`操作失败：${detail}`, 'error');
      } else {
        showToast('操作失败，请稍后重试', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (p: ProfileItem) => {
    if (!canDelete) {
      showToast('至少保留 1 个孩子', 'warning');
      return;
    }
    const ok = window.confirm(`确定删除「${p.display_name}」吗？\n删除后该孩子的所有数据将不再显示。`);
    if (!ok) return;
    try {
      await apiClient.delete(`/me/profiles/${encodeURIComponent(p.profile_id)}`);
      await refresh();
      showToast('已删除', 'success');
    } catch {
      showToast('删除失败，请稍后重试', 'error');
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col max-w-md mx-auto bg-neu-bg pb-32 overflow-hidden">
      {croppingImage && (
        <ImageCropper
          imageSrc={croppingImage}
          onCropComplete={onCropComplete}
          onCancel={onCropCancel}
        />
      )}

      <header className="sticky top-0 z-30 flex items-center justify-center px-6 pt-12 pb-6 bg-neu-bg/90 backdrop-blur-sm relative">
        <div className="absolute left-6">
          <BackButton onClick={() => navigate(-1)} />
        </div>
        <h1 className="text-xl font-bold text-neu-text-secondary tracking-tight">子账号管理</h1>
        <button
          type="button"
          onClick={openCreate}
          className={cn(
            "absolute right-6 w-10 h-10 rounded-full bg-neu-bg shadow-neu-icon-btn flex items-center justify-center transition-all duration-300 focus:outline-none",
            !canAdd ? "text-amber-500 hover:text-amber-600" : "text-neu-text-secondary hover:text-primary active:shadow-neu-pressed"
          )}
          aria-label="Add profile"
          title={!canAdd ? "升级解锁" : "新增孩子"}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {!canAdd ? 'lock' : 'add'}
          </span>
        </button>
      </header>

      <main className="flex-1 px-6 overflow-y-auto no-scrollbar pb-10">
        <div className="space-y-4">
          {loading ? (
            <div className="text-sm text-neu-text-secondary">加载中…</div>
          ) : profiles.length ? (
            profiles.slice(0, 10).map((p) => {
              const isActive = Boolean(selectedProfileId && p.profile_id === selectedProfileId);
              return (
                <div
                  key={p.profile_id}
                  className={cn(
                    'rounded-2xl bg-neu-bg border border-white/40 p-4 flex items-center justify-between gap-3 transition-all duration-200',
                    isActive ? 'shadow-neu-pressed' : 'shadow-neu-flat'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveProfile(p.profile_id)}
                    className="flex items-center gap-3 flex-1 text-left focus:outline-none"
                    aria-label={`Select ${p.display_name}`}
                    title="设为当前孩子"
                  >
                    <div className={cn('relative h-12 w-12 rounded-full bg-neu-bg flex items-center justify-center overflow-hidden', isActive ? 'shadow-neu-circle-pressed' : 'shadow-neu-circle')}>
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt={p.display_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-neu-text-secondary">{(p.display_name || '默认').slice(0, 1)}</span>
                      )}
                      <div
                        className={cn(
                          'absolute bottom-1 right-1 h-3 w-3 rounded-full transition-opacity duration-200 bg-emerald-500 z-10',
                          isActive ? 'opacity-100' : 'opacity-0'
                        )}
                        style={{
                          boxShadow:
                            '0 0 0 2px rgba(239,238,238,0.95), 0 0 12px rgba(16,185,129,0.55)',
                        }}
                      />
                    </div>
                    <div className="flex flex-col">
                      <div className="font-bold text-neu-text">{p.display_name || '默认'}</div>
                      <div className="text-[10px] text-neu-text-secondary">
                        {isActive ? '当前使用中' : '点击切换'}
                        {p.is_default ? ' · 默认' : ''}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openRename(p)}
                      className="w-10 h-10 rounded-full bg-neu-bg shadow-neu-icon-btn flex items-center justify-center text-neu-text-secondary hover:text-primary active:shadow-neu-pressed transition-all duration-300 focus:outline-none"
                      aria-label="Rename"
                      title="编辑"
                    >
                      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        edit
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(p)}
                      disabled={!canDelete}
                      className={cn(
                        'w-10 h-10 rounded-full bg-neu-bg shadow-neu-icon-btn flex items-center justify-center transition-all duration-300 focus:outline-none',
                        canDelete
                          ? 'text-neu-text-secondary hover:text-error active:shadow-neu-pressed'
                          : 'text-neu-text-secondary/40 cursor-not-allowed'
                      )}
                      aria-label="Delete"
                      title={canDelete ? '删除' : '至少保留 1 个孩子'}
                    >
                      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        delete
                      </span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-neu-text-secondary">暂无子账号</div>
          )}
        </div>
      </main>

      {upgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-neu-bg/60 backdrop-blur-[6px]"
            onClick={() => setUpgradeModalOpen(false)}
          />
          <div className="relative w-full max-w-[320px] bg-neu-popup rounded-[32px] shadow-popup-base pt-10 px-6 pb-8 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300 border border-white/40 items-center text-center">
            <div className="w-16 h-16 rounded-full bg-neu-bg shadow-neu-flat flex items-center justify-center text-amber-500 mb-2">
              <span className="material-symbols-outlined text-[32px]">workspace_premium</span>
            </div>
            
            <div>
              <div className="text-lg font-bold text-neu-text mb-2">多子女管理</div>
              <div className="text-sm text-neu-text-secondary leading-relaxed">
                普通用户仅限管理 1 位子女。<br/>升级 VIP 即可解锁无限档案管理。
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full mt-2">
              <button
                type="button"
                onClick={() => navigate('/subscribe')}
                className="w-full h-12 rounded-2xl bg-primary text-white shadow-lg shadow-primary/30 flex items-center justify-center gap-2 active:scale-[0.98] transition-all font-bold tracking-wide"
              >
                立即升级
              </button>
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(false)}
                className="w-full h-12 rounded-2xl bg-transparent text-neu-text-secondary font-bold text-sm hover:bg-black/5 transition-all"
              >
                暂不需要
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-neu-bg/60 backdrop-blur-[6px]"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-[360px] bg-neu-popup rounded-[32px] shadow-popup-base pt-16 px-6 pb-6 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300 border border-white/40">
            <button
              type="button"
              onClick={closeModal}
              className="absolute top-4 left-5 w-10 h-10 rounded-full bg-neu-popup shadow-popup-flat flex items-center justify-center text-neu-text-secondary active:shadow-popup-pressed transition-all duration-200 z-50 focus:outline-none"
            >
              <span className="material-symbols-outlined font-bold text-lg">close</span>
            </button>

            <div className="text-center">
              <div className="text-lg font-bold text-neu-text">
                {modalMode === 'create' ? '新增孩子' : '编辑信息'}
              </div>
              <div className="text-[11px] text-neu-text-secondary mt-1">
                {modalMode === 'create' ? '用于区分不同孩子的作业与报告' : '修改头像或名称'}
              </div>
            </div>

            {/* Avatar Selection */}
            <div className="flex justify-center">
              <div 
                className="relative w-24 h-24 rounded-full bg-neu-popup shadow-popup-pressed flex items-center justify-center cursor-pointer group overflow-hidden"
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-[40px] text-neu-text-secondary/40">account_circle</span>
                )}
                
                {/* Overlay with camera icon */}
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="material-symbols-outlined text-white text-[24px]">photo_camera</span>
                </div>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={onFileChange}
                />
              </div>
            </div>

            <div className="w-full bg-neu-popup shadow-popup-pressed rounded-2xl px-4 py-3">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="例如：大儿子 / 小明"
                className="w-full bg-transparent text-neu-text outline-none border-none text-sm"
                autoFocus
                maxLength={30}
              />
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={submitModal}
              className={cn(
                'w-full h-12 rounded-2xl bg-neu-popup shadow-popup-flat flex items-center justify-center gap-2 active:shadow-popup-pressed transition-all active:scale-[0.99] group focus:outline-none',
                saving ? 'opacity-60 cursor-not-allowed' : ''
              )}
            >
              <span className="font-bold text-base tracking-wider text-neu-text group-active:translate-y-px">
                {saving ? '处理中…' : '确认'}
              </span>
            </button>
          </div>
        </div>
      )}

      <HomeFab to="/" containerClassName="z-40" />
    </div>
  );
};

export default ProfileManagement;
