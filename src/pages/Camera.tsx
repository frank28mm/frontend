import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/contexts/ProfileContext';
import { useToast } from '@/components/ui/Toast';
import { validateUploadFiles } from '@/lib/upload_limits';

const Camera: React.FC = () => {
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const { showToast } = useToast();
  const albumInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    let canceled = false;
    const start = async () => {
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (canceled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err: unknown) {
        const errorName =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name?: unknown }).name || '')
            : '';
        if (canceled || errorName === 'AbortError') return;
        console.error(err);
        setCameraError('无法打开摄像头（可改用相册上传）');
        setCameraReady(false);
      }
    };

    start();
    return () => {
      canceled = true;
      stopCamera();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Allow re-selecting the same files.
    e.target.value = '';
    const check = validateUploadFiles(files);
    if (!check.ok) {
      showToast(check.message || '图片不符合上传要求', 'warning');
      return;
    }
    navigate('/upload', { state: { files } });
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const w = video.videoWidth || 1080;
    const h = video.videoHeight || 1440;

    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    );
    if (!blob) return;

    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    navigate('/upload', { state: { files: [file] } });
  };

  const hintText = useMemo(() => {
    if (cameraError) return cameraError;
    return cameraReady ? '请将作业平整置于取景框内' : '正在连接摄像头…';
  }, [cameraError, cameraReady]);

  return (
    <div className="bg-neu-bg font-display antialiased text-gray-700 overflow-hidden h-[100dvh] w-full flex flex-col relative selection:bg-indigo-500/20">
      <header className="relative z-30 flex items-center justify-center px-8 pt-10 pb-4 shrink-0">
        <div className="flex flex-col items-center">
          <h1 className="text-xl font-bold text-slate-700 tracking-tight">拍照上传</h1>
          <div className="mt-1 text-[10px] font-bold tracking-widest text-slate-500">
            数据库：{activeProfile?.display_name || '默认'}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 px-6 py-2 flex flex-col items-center justify-center relative z-10 w-full">
        {/* A4 aspect ratio viewfinder container - Height driven, width auto */}
        <div className="relative h-full max-w-full aspect-[1/1.414] rounded-[2.5rem] bg-neu-bg shadow-neu-flat p-4 flex flex-col transition-all duration-300 border border-white/60">
          {/* Viewfinder content */}
          <div className="relative w-full h-full bg-[#E8E7E7] rounded-[2rem] shadow-neu-pressed overflow-hidden border border-white/20 group">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover opacity-90 mix-blend-multiply filter contrast-[1.05] brightness-105"
            />
            <canvas ref={canvasRef} className="hidden" />

            <div className="absolute inset-0 pointer-events-none p-6 opacity-80">
              <div className="absolute top-8 left-8 w-12 h-12 border-t-[3px] border-l-[3px] border-white/80 rounded-tl-3xl shadow-sm"></div>
              <div className="absolute top-8 right-8 w-12 h-12 border-t-[3px] border-r-[3px] border-white/80 rounded-tr-3xl shadow-sm"></div>
              <div className="absolute bottom-8 left-8 w-12 h-12 border-b-[3px] border-l-[3px] border-white/80 rounded-bl-3xl shadow-sm"></div>
              <div className="absolute bottom-8 right-8 w-12 h-12 border-b-[3px] border-r-[3px] border-white/80 rounded-br-3xl shadow-sm"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 opacity-70">
                <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-white rounded-full shadow-sm"></div>
                <div className="absolute left-1/2 top-0 h-full w-[1.5px] bg-white rounded-full shadow-sm"></div>
              </div>
            </div>
          </div>
          <div className="mt-6 mb-2 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500/70 animate-pulse shadow-sm"></span>
            <p className="text-slate-500 text-sm font-medium tracking-wide">{hintText}</p>
          </div>
        </div>
      </main>

      {/* Bottom buttons - Album, Capture, Home */}
      <div className="relative w-full pb-12 pt-4 px-10 z-30 max-w-md mx-auto">
        <div className="flex items-center justify-center gap-6">
          <input
            ref={albumInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Album button - size-16 like OK button in DataArchive */}
          <button
            onClick={() => albumInputRef.current?.click()}
            className="size-16 rounded-full bg-neu-bg shadow-neu-icon flex items-center justify-center text-gray-400 hover:text-neu-text active:text-primary active:shadow-neu-pressed active:scale-95 transition-all duration-300 border border-white/50"
          >
            <span className="material-symbols-outlined text-[26px]">photo_library</span>
          </button>

          {/* Capture button - white circle with groove ring, neumorphic style */}
          <button
            onClick={handleCapture}
            className="h-[4.5rem] w-[4.5rem] rounded-full flex items-center justify-center active:scale-95 transition-all duration-300 relative"
          >
            {/* Outer ring with pressed groove effect */}
            <div className="absolute inset-0 rounded-full bg-neu-bg shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1),inset_-3px_-3px_6px_rgba(255,255,255,0.95)] border border-white/40"></div>
            {/* White inner circle */}
            <div className="w-[4rem] h-[4rem] rounded-full bg-white shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_rgba(255,255,255,0.9)] relative z-10"></div>
          </button>

          {/* Home button - size-16 like OK button in DataArchive */}
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
};

export default Camera;
