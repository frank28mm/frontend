import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_UPLOAD_IMAGE_BYTES } from '@/lib/upload_limits';
import Camera from '@/pages/Camera';
import Upload from '@/pages/Upload';

const { navigate, post, showToast, location } = vi.hoisted(() => ({
  navigate: vi.fn(),
  post: vi.fn(),
  showToast: vi.fn(),
  location: { state: { files: [] as File[] } },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => location,
}));
vi.mock('@/services/api', () => ({ apiClient: { post } }));
vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: () => ({ activeProfile: { display_name: 'Student' } }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/components/ui/BackButton', () => ({ BackButton: () => <button>Back</button> }));

const imageFiles = (count: number) => Array.from(
  { length: count },
  (_, index) => new File(['page'], `page-${index + 1}.jpg`, { type: 'image/jpeg' }),
);

describe('upload selection and preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    location.state = { files: [] };
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, String(value)),
      removeItem: (key: string) => stored.delete(key),
    });
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn((file: File) => `blob:${file.name}`),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue({ name: 'AbortError' }) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([9, 20, 100])('passes all %i selected images from the album to preview', (count) => {
    const files = imageFiles(count);
    const { container } = render(<Camera />);

    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files } });

    expect(navigate).toHaveBeenCalledWith('/upload', { state: { files } });
    expect(showToast).not.toHaveBeenCalled();
  });

  it.each([9, 20, 100])('can preview every page and submits all %i images in order', async (count) => {
    const files = imageFiles(count);
    location.state = { files };
    post
      .mockResolvedValueOnce({ data: { upload_id: 'upload-1', total_pages: count } })
      .mockResolvedValueOnce({ data: { job_id: 'job-1' } });
    render(<Upload />);

    expect(navigate).not.toHaveBeenCalled();
    const previous = screen.getByRole('button', { name: '上一张' });
    const next = screen.getByRole('button', { name: '下一张' });
    const preview = screen.getByRole('img', { name: '作业预览' });
    const pageCounter = screen.getByText(`第 1/${count} 页`);
    expect(previous).toBeDisabled();
    for (let index = 0; index < count; index += 1) {
      expect(preview).toHaveAttribute('src', `blob:page-${index + 1}.jpg`);
      expect(pageCounter).toHaveTextContent(`第 ${index + 1}/${count} 页`);
      if (index < count - 1) fireEvent.click(next);
    }
    expect(next).toBeDisabled();
    fireEvent.click(previous);
    expect(preview).toHaveAttribute('src', `blob:page-${count - 1}.jpg`);
    fireEvent.click(screen.getByRole('button', { name: `选择第 ${count} 张` }));
    expect(preview).toHaveAttribute('src', `blob:page-${count}.jpg`);
    fireEvent.click(screen.getByRole('button', { name: '开始批改' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/result?jobId=job-1&submissionId=upload-1', {
      replace: true,
    }));
    expect(post).toHaveBeenNthCalledWith(1, '/uploads', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const submitted = (post.mock.calls[0][1] as FormData).getAll('file') as File[];
    expect(submitted.map((file) => file.name)).toEqual(files.map((file) => file.name));
    expect(post).toHaveBeenNthCalledWith(2, '/grade', { upload_id: 'upload-1', subject: 'auto' }, {
      headers: { 'X-Force-Async': '1' },
    });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('still rejects an image over 5MB in a large album selection', () => {
    const files = imageFiles(20);
    files.push(new File([new Uint8Array(MAX_UPLOAD_IMAGE_BYTES + 1)], 'large.jpg', { type: 'image/jpeg' }));
    const { container } = render(<Camera />);

    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files } });

    expect(navigate).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('large.jpg'), 'warning');
  });
});
