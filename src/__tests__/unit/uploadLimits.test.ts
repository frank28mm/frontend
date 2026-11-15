import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_IMAGE_BYTES, validateUploadFiles } from '@/lib/upload_limits';

function imageFiles(count: number): File[] {
  return Array.from(
    { length: count },
    (_, index) => new File(['page'], `page-${index + 1}.jpg`, { type: 'image/jpeg' }),
  );
}

describe('upload limits', () => {
  it.each([4, 8, 9, 20, 100])('accepts %i pages for every subject', (count) => {
    expect(validateUploadFiles(imageFiles(count))).toEqual({ ok: true });
  });

  it('still requires an image', () => {
    expect(validateUploadFiles([]).ok).toBe(false);
  });

  it('still rejects an oversized image in a larger upload', () => {
    const files = imageFiles(20);
    files.push(new File([new Uint8Array(MAX_UPLOAD_IMAGE_BYTES + 1)], 'large.jpg'));
    expect(validateUploadFiles(files)).toMatchObject({ ok: false });
    expect(validateUploadFiles(files).message).toContain('large.jpg');
  });
});
