import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiClient } from '@/services/api';
import { BackButton } from '@/components/ui/BackButton';
import { useProfile } from '@/contexts/ProfileContext';
import { useToast } from '@/components/ui/Toast';
import { validateUploadFiles } from '@/lib/upload_limits';

interface LocationState {
  files?: File[];
  file?: File;
}

const STABLE_SUBJECT_FORBIDDEN_LABELS = new Map<string, string>([
  ['ENGLISH_GRADING_DISABLED', '英语'],
  ['ENGLISH_GRADING_NOT_ALLOWLISTED', '英语'],
  ['PHYSICS_GRADING_DISABLED', '物理'],
  ['PHYSICS_GRADING_NOT_ALLOWLISTED', '物理'],
  ['CHEMISTRY_GRADING_DISABLED', '化学'],
  ['CHEMISTRY_GRADING_NOT_ALLOWLISTED', '化学'],
]);

const Upload: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMountedRef = useRef(true);
  const uploadingIntervalRef = useRef<number | null>(null);
  const { activeProfile } = useProfile();
  const { showToast } = useToast();

  const initialFiles = useMemo<File[]>(() => {
    const stateFiles = (location.state as LocationState | null)?.files;
    const stateFile = (location.state as LocationState | null)?.file;
    if (Array.isArray(stateFiles) && stateFiles.length) {
      return stateFiles;
    }
    if (stateFile) {
      return [stateFile];
    }
    return [];
  }, [location.state]);

  const [files, setFiles] = useState<File[]>(initialFiles);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [step, setStep] = useState<'preview' | 'uploading'>('preview');
  const [convertBusy, setConvertBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'grading'>('uploading');
  const [elapsedMs, setElapsedMs] = useState(0);

  // Timer effect: Auto-start when step is 'uploading'
  useEffect(() => {
    if (step !== 'uploading') {
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 200);
    return () => clearInterval(timer);
  }, [step]);

  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const previewUrl = previewUrls[selectedIndex] || previewUrls[0] || '';
  const previewStartIndex = Math.min(Math.max(0, selectedIndex - 2), Math.max(0, previewUrls.length - 6));

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (uploadingIntervalRef.current) {
        window.clearInterval(uploadingIntervalRef.current);
        uploadingIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!previewUrl) return;
    setPreviewLoading(true);
    setPreviewError(null);
  }, [previewUrl]);

  useEffect(() => {
    if (!files.length) {
      navigate('/scan', { replace: true });
    }
  }, [files, navigate]);

  useEffect(() => {
    const check = validateUploadFiles(files);
    if (!check.ok) {
      showToast(check.message || '图片不符合上传要求', 'warning');
      navigate('/scan', { replace: true });
    }
  }, [files, navigate, showToast]);

  const currentFile = files[selectedIndex] || files[0] || null;

  const tryConvertCurrentFile = async () => {
    if (!currentFile) return;
    if (convertBusy) return;
    setPreviewError('预览失败，正在尝试转换为 JPG…');
    // If browser cannot decode/preview the picked file (common with HEIC on some browsers),
    // try a best-effort client-side conversion to JPEG.
    if (typeof createImageBitmap !== 'function') {
      setPreviewError('该图片格式暂不支持预览（请改用 JPG/PNG）');
      return;
    }
    setConvertBusy(true);
    try {
      const bitmap = await createImageBitmap(currentFile);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no_canvas_context');
      ctx.drawImage(bitmap, 0, 0);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
      );
      if (!blob) throw new Error('toBlob_failed');
      const safeName = (currentFile.name || `photo_${Date.now()}`)
        .replace(/\.(heic|heif|png|webp|jpeg|jpg)$/i, '')
        .trim();
      const nextFile = new File([blob], `${safeName || `photo_${Date.now()}`}.jpg`, {
        type: 'image/jpeg',
      });
      setFiles((prev) => {
        const next = [...prev];
        const idx = Math.max(0, Math.min(selectedIndex, next.length - 1));
        next[idx] = nextFile;
        return next;
      });
      setPreviewError(null);
    } catch {
      setPreviewError('该图片格式暂不支持预览（请改用 JPG/PNG）');
    } finally {
      setConvertBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!files.length) return;
    const check = validateUploadFiles(files);
    if (!check.ok) {
      showToast(check.message || '图片不符合上传要求', 'warning');
      return;
    }
    setStep('uploading');
    setUploadPhase('uploading');
    // Timer is handled by useEffect now
    let stage: 'upload' | 'grade' = 'upload';

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('file', file));

      const uploadRes = await apiClient.post<{
        upload_id: string;
        page_image_urls: string[];
        total_pages: number;
      }>(
        '/uploads',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const { upload_id } = uploadRes.data;
      if (isMountedRef.current) {
        setUploadPhase('grading');
      }
      stage = 'grade';

      const gradeRes = await apiClient.post<{ job_id: string }>(
        '/grade',
        { upload_id, subject: 'auto' },
        { headers: { 'X-Force-Async': '1' } }
      );

      const { job_id } = gradeRes.data;

      // Persist job state even if component is unmounted (user left early)
      localStorage.setItem('active_job_id', job_id);
      localStorage.setItem('active_job_submission_id', upload_id);
      localStorage.removeItem('active_job_status');

      if (isMountedRef.current) {
        navigate(`/result?jobId=${job_id}&submissionId=${upload_id}`, { replace: true });
      }
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
      const status = ax.response?.status;
      const msg = ax.response?.data?.detail || ax.message || '上传失败';
      const forbiddenSubjectLabel = status === 403
        ? STABLE_SUBJECT_FORBIDDEN_LABELS.get(String(msg || '').trim())
        : undefined;
      if (!forbiddenSubjectLabel && status === undefined) console.error(err);
      if (isMountedRef.current) {
        if (status === 401) {
          showToast('请先登录后再上传作业', 'warning');
          navigate('/login');
        } else if (forbiddenSubjectLabel) {
          showToast(`${forbiddenSubjectLabel}批改当前未对该账号开放，图片已保留，请稍后重试`, 'warning');
        } else if (msg?.includes('quota') || msg?.includes('CP')) {
          showToast('账户算力(CP)不足，请前往“我的”页面充值', 'warning');
        } else if (stage === 'grade') {
          showToast(`上传成功，但创建批改任务失败：${msg}`, 'error');
        } else {
          showToast(`上传失败：${msg}`, 'error');
        }
        setStep('preview');
      }
    }
    // Finally block removed: timer cleanup is handled by useEffect or unmount
  };

  if (!files.length) {
    return null;
  }

  if (step === 'preview') {
    return (
      <div className="bg-neu-bg font-display antialiased text-gray-700 overflow-hidden h-[100dvh] w-full flex flex-col relative selection:bg-indigo-500/20">
        <header className="sticky top-0 z-30 flex items-center justify-center px-6 pt-10 pb-4 bg-neu-bg/90 backdrop-blur-sm relative shrink-0">
          <BackButton
            to="/scan"
            className="absolute left-6 h-10 w-10 bg-[#EFEEEE] shadow-[4px_4px_8px_#D1D1D1,-4px_-4px_8px_#FFFFFF] text-[#6B7280] active:shadow-[inset_6px_6px_12px_#D1D1D1,-6px_-6px_12px_#FFFFFF] active:scale-95"
            iconClassName="text-[1.2rem]"
          />
          <div className="flex flex-col items-center">
            <h1 className="text-xl font-bold text-slate-700 tracking-tight">上传预览</h1>
            <div className="mt-1 text-[10px] font-bold tracking-widest text-slate-500">
              数据库：{activeProfile?.display_name || '默认'}
            </div>
            {files.length > 1 && (
              <span className="text-[10px] font-semibold text-gray-400 mt-0.5">
                第 {Math.min(selectedIndex + 1, files.length)}/{files.length} 页
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 min-h-0 px-6 py-2 flex flex-col items-center justify-center relative z-10 w-full">
          <div className="relative h-full max-w-full aspect-[1/1.414] rounded-[2.5rem] bg-neu-bg shadow-neu-flat p-4 flex flex-col transition-all duration-300 border border-white/60">
            <div className="relative w-full h-full bg-[#E8E7E7] rounded-[2rem] shadow-neu-pressed overflow-hidden border border-white/20 group">
              <div className="absolute inset-0 pointer-events-none p-4 opacity-80">
                <div className="absolute top-6 left-6 w-10 h-10 border-t-[3px] border-l-[3px] border-white/80 rounded-tl-2xl shadow-sm"></div>
                <div className="absolute top-6 right-6 w-10 h-10 border-t-[3px] border-r-[3px] border-white/80 rounded-tr-2xl shadow-sm"></div>
                <div className="absolute bottom-6 left-6 w-10 h-10 border-b-[3px] border-l-[3px] border-white/80 rounded-bl-2xl shadow-sm"></div>
                <div className="absolute bottom-6 right-6 w-10 h-10 border-b-[3px] border-r-[3px] border-white/80 rounded-br-2xl shadow-sm"></div>
              </div>

              {previewUrl ? (
                <img
                  alt="作业预览"
                  src={previewUrl}
                  className="absolute inset-0 z-10 h-full w-full object-contain opacity-90 mix-blend-multiply filter contrast-[1.05] brightness-105"
                  onError={() => {
                    setPreviewLoading(false);
                    if (!previewError && !convertBusy) {
                      void tryConvertCurrentFile();
                    }
                  }}
                  onLoad={() => {
                    setPreviewLoading(false);
                    setPreviewError(null);
                  }}
                />
              ) : null}
              <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#EFEEEE]/20 to-transparent pointer-events-none"></div>

              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <span className="text-2xl font-light text-gray-700 tracking-widest opacity-90">PREVIEW</span>
              </div>

              {previewLoading && !previewError && (
                <div className="absolute inset-0 z-20 flex items-center justify-center">
                  <div className="rounded-2xl bg-neu-bg/80 backdrop-blur-md shadow-neu-flat px-5 py-3 border border-white/40 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-indigo-500/70 animate-pulse shadow-sm" />
                    <span className="text-[12px] font-semibold text-slate-600 tracking-wide">加载预览…</span>
                  </div>
                </div>
              )}

              {previewError && (
                <div className="absolute inset-0 z-30 flex items-center justify-center px-8">
                  <div className="w-full rounded-2xl bg-neu-bg/90 backdrop-blur-md shadow-neu-flat p-4 border border-white/40 text-center">
                    <div className="text-sm font-bold text-slate-700">{convertBusy ? '正在转换…' : '无法预览'}</div>
                    <div className="mt-2 text-[12px] text-slate-500 leading-relaxed">{previewError}</div>
                    <button
                      type="button"
                      onClick={() => void tryConvertCurrentFile()}
                      disabled={convertBusy}
                      className="mt-4 px-4 py-2 rounded-2xl bg-neu-bg shadow-neu-flat-sm border border-white/40 text-[12px] font-bold text-slate-600 active:shadow-neu-pressed active:scale-[0.98] transition-all disabled:opacity-60"
                    >
                      {convertBusy ? '转换中…' : '尝试转换为 JPG'}
                    </button>
                  </div>
                </div>
                )}
            </div>

            {previewUrls.length > 1 && (
              <div className="mt-3 flex items-center justify-center gap-2 shrink-0">
                {previewUrls.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setSelectedIndex((index) => Math.max(0, index - 1))}
                    disabled={selectedIndex === 0}
                    className="size-8 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:text-primary disabled:opacity-30"
                    aria-label="上一张"
                    title="上一张"
                  >
                    <span className="material-symbols-outlined text-xl" aria-hidden="true">chevron_left</span>
                  </button>
                )}
                {previewUrls.slice(previewStartIndex, previewStartIndex + 6).map((_, offset) => {
                  const idx = previewStartIndex + offset;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedIndex(idx)}
                      className={`h-2.5 w-2.5 shrink-0 rounded-full transition-all ${
                        idx === selectedIndex ? 'bg-primary shadow-neu-flat-sm' : 'bg-gray-300/70'
                      }`}
                      aria-label={`选择第 ${idx + 1} 张`}
                      aria-current={idx === selectedIndex ? 'page' : undefined}
                    />
                  );
                })}
                {previewUrls.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setSelectedIndex((index) => Math.min(previewUrls.length - 1, index + 1))}
                    disabled={selectedIndex === previewUrls.length - 1}
                    className="size-8 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:text-primary disabled:opacity-30"
                    aria-label="下一张"
                    title="下一张"
                  >
                    <span className="material-symbols-outlined text-xl" aria-hidden="true">chevron_right</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Bottom buttons - Retake, Upload, Home (match Camera sizing) */}
        <div
          className="relative w-full pb-12 pt-4 px-10 z-30 max-w-md mx-auto"
          style={{ paddingBottom: 'max(3rem, env(safe-area-inset-bottom) + 2.5rem)' }}
        >
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => navigate('/scan')}
              className="size-16 rounded-full bg-neu-bg shadow-neu-icon flex items-center justify-center text-gray-400 hover:text-neu-text active:text-primary active:shadow-neu-pressed active:scale-95 transition-all duration-300 border border-white/50"
            >
              <span className="material-symbols-outlined text-[26px]">replay</span>
            </button>

            <button
              onClick={handleUpload}
              aria-label="开始批改"
              className="h-[4.5rem] w-[4.5rem] rounded-full flex items-center justify-center active:scale-95 transition-all duration-300 relative"
            >
              <div className="absolute inset-0 rounded-full bg-neu-bg shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1),inset_-3px_-3px_6px_rgba(255,255,255,0.95)] border border-white/40"></div>
              <div className="w-[4rem] h-[4rem] rounded-full bg-white shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_rgba(255,255,255,0.9)] relative z-10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px] text-slate-700">cloud_upload</span>
              </div>
            </button>

            <button
              onClick={() => navigate('/')}
              className="size-16 rounded-full bg-neu-bg shadow-neu-icon flex items-center justify-center text-gray-400 hover:text-neu-text active:text-primary active:shadow-neu-pressed active:scale-95 transition-all duration-300 border border-white/50"
            >
              <span className="material-symbols-outlined text-[26px]">home</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const elapsedText = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(
    elapsedSeconds % 60
  ).padStart(2, '0')}`;

  const statusTitle = uploadPhase === 'uploading' ? '正在上传…' : '批改中';
  const statusDesc = uploadPhase === 'grading' ? 'AI 正在逐题扫描分析' : '';

  return (
    <div className="bg-neu-bg font-display text-neu-text-main overflow-hidden h-[100dvh] flex flex-col items-center">
      <div className="w-full flex items-center pt-10 pb-4 justify-center z-20 shrink-0 relative">
        <h2 className="text-neu-text-main text-lg font-bold tracking-tight text-center">智能批改</h2>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full px-6 relative z-10 max-w-md pb-8 gap-6">
        {/* A4 Preview Container - Adaptive Height */}
        <div className="relative h-full max-h-full aspect-[1/1.414] min-h-0 rounded-[2.5rem] bg-neu-bg shadow-neu-deep flex flex-col items-center p-4">
          <div
            className="relative w-full h-full bg-neu-bg shadow-neu-concave rounded-[2rem] p-2 overflow-hidden flex flex-col"
          >
            <div className="relative w-full h-full bg-[#E8E7E7] rounded-[1.5rem] shadow-neu-pressed overflow-hidden border border-white/20">
              <img
                alt="作业预览"
                className="absolute inset-0 h-full w-full object-contain opacity-90 mix-blend-multiply filter contrast-[1.05] brightness-105"
                src={previewUrl}
                onError={() => {
                  setPreviewLoading(false);
                  if (!previewError && !convertBusy) {
                    void tryConvertCurrentFile();
                  }
                }}
                onLoad={() => {
                  setPreviewLoading(false);
                  setPreviewError(null);
                }}
              />
              <div className="absolute inset-0 bg-neu-text-main/5 mix-blend-multiply"></div>

              <div className="absolute inset-0 pointer-events-none p-6 opacity-80">
                <div className="absolute top-8 left-8 w-12 h-12 border-t-[3px] border-l-[3px] border-white/80 rounded-tl-3xl shadow-sm"></div>
                <div className="absolute top-8 right-8 w-12 h-12 border-t-[3px] border-r-[3px] border-white/80 rounded-tr-3xl shadow-sm"></div>
                <div className="absolute bottom-8 left-8 w-12 h-12 border-b-[3px] border-l-[3px] border-white/80 rounded-bl-3xl shadow-sm"></div>
                <div className="absolute bottom-8 right-8 w-12 h-12 border-b-[3px] border-r-[3px] border-white/80 rounded-br-3xl shadow-sm"></div>
              </div>

              <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                <div className="absolute w-full animate-scan-loop left-0 -top-10">
                  <div className="scan-line"></div>
                  <div className="scan-trail"></div>
                </div>
              </div>

              {previewLoading && !previewError && (
                <div className="absolute inset-0 z-20 flex items-center justify-center">
                  <div className="rounded-2xl bg-neu-bg/80 backdrop-blur-md shadow-neu-flat px-5 py-3 border border-white/40 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-indigo-500/70 animate-pulse shadow-sm" />
                    <span className="text-[12px] font-semibold text-slate-600 tracking-wide">加载预览…</span>
                  </div>
                </div>
              )}

              {previewError && (
                <div className="absolute inset-0 z-30 flex items-center justify-center px-8">
                  <div className="w-full rounded-2xl bg-neu-bg/90 backdrop-blur-md shadow-neu-flat p-4 border border-white/40 text-center">
                    <div className="text-sm font-bold text-slate-700">{convertBusy ? '正在转换…' : '无法预览'}</div>
                    <div className="mt-2 text-[12px] text-slate-500 leading-relaxed">{previewError}</div>
                    <button
                      type="button"
                      onClick={() => void tryConvertCurrentFile()}
                      disabled={convertBusy}
                      className="mt-4 px-4 py-2 rounded-2xl bg-neu-bg shadow-neu-flat-sm border border-white/40 text-[12px] font-bold text-slate-600 active:shadow-neu-pressed active:scale-[0.98] transition-all disabled:opacity-60"
                    >
                      {convertBusy ? '转换中…' : '尝试转换为 JPG'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status Info Footer */}
        <div className="w-full shrink-0 flex flex-col items-center gap-4">
          <div className="text-center space-y-1">
            <h2 className="text-neu-text-main text-xl font-bold tracking-tight">{statusTitle}</h2>
            {statusDesc ? <div className="text-[12px] font-semibold text-neu-text-sub">{statusDesc}</div> : null}
            <p className="text-neu-text-sub text-xs font-medium opacity-80">用时：{elapsedText}</p>
          </div>

          <div className="w-full max-w-[280px]">
            <div className="rounded-xl bg-neu-bg shadow-neu-flat p-3 border border-white/40">
              <div className="text-[10px] text-gray-500 leading-relaxed text-center">
                {uploadPhase === 'uploading' ? (
                  <span>
                    文件正在上传中，请<span className="font-bold text-orange-500">保持在此页面</span>，上传完成后自动开始批改。
                  </span>
                ) : (
                  <span>
                    无需等待，可点击下方 <span className="font-bold">HOME</span> 返回首页，稍后在「历史记录」查看批改进度。
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8 mt-2">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => navigate('/')}
                className="w-12 h-12 rounded-full bg-neu-bg shadow-neu-button flex items-center justify-center text-neu-text-sub hover:text-neu-text active:shadow-neu-button-pressed active:text-neu-accent transition-all duration-200 group border border-white/50"
              >
                <span className="material-symbols-outlined text-xl group-active:scale-95">home</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Upload;
