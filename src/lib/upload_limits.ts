export const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const fixed = i === 0 ? 0 : v < 10 ? 2 : 1;
  return `${v.toFixed(fixed)}${units[i]}`;
}

export function validateUploadFiles(files: File[]): { ok: boolean; message?: string } {
  if (!files || files.length === 0) {
    return { ok: false, message: '请先选择图片' };
  }
  for (const f of files) {
    const size = Number(f?.size || 0);
    if (size > MAX_UPLOAD_IMAGE_BYTES) {
      const name = String(f?.name || '图片');
      return {
        ok: false,
        message: `${name} 过大（${formatBytes(size)}），单张图片最大 ${formatBytes(MAX_UPLOAD_IMAGE_BYTES)}`,
      };
    }
  }

  return { ok: true };
}
