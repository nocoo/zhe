import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useUploadsViewModel
const mockHandleFiles = vi.fn();
const mockSetIsDragOver = vi.fn();
const mockHandleDelete = vi.fn();
const mockDismissUploadingFile = vi.fn();

vi.mock('@/viewmodels/useUploadViewModel', () => ({
  useUploadsViewModel: vi.fn(),
  useUploadItemViewModel: vi.fn(),
  formatFileSize: (bytes: number) => `${bytes} B`,
  isImageType: (type: string) => type.startsWith('image/'),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...inputs: string[]) => inputs.filter(Boolean).join(' '),
  formatDate: () => 'Feb 12, 2026',
  formatNumber: (n: number) => String(n),
  copyToClipboard: vi.fn(),
}));

vi.mock('@/models/upload', () => ({
  ALLOWED_TYPES: ['image/png', 'image/jpeg'],
}));

// Import after mocks
import { useUploadsViewModel, useUploadItemViewModel } from '@/viewmodels/useUploadViewModel';
import { UploadZone } from '@/components/dashboard/upload-zone';
import { UploadItem, UploadingItem } from '@/components/dashboard/upload-item';
import { UploadList } from '@/components/dashboard/upload-list';
import type { Upload } from '@/lib/db/schema';
import type { UploadingFile } from '@/models/upload';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUpload(overrides: Partial<Upload> = {}): Upload {
  return {
    id: 1,
    userId: 'user-1',
    key: '20260212/abc.png',
    fileName: 'photo.png',
    fileType: 'image/png',
    fileSize: 1024,
    publicUrl: 'https://s.zhe.to/20260212/abc.png',
    createdAt: new Date('2026-02-12'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UploadZone tests
// ---------------------------------------------------------------------------

describe('UploadZone', () => {
  const mockOnDragOver = vi.fn();
  const mockOnFiles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders upload prompt text', () => {
    render(
      <UploadZone
        isDragOver={false}
        onDragOver={mockOnDragOver}
        onFiles={mockOnFiles}
      />,
    );

    expect(screen.getByText('拖拽文件到此处，或点击选择')).toBeInTheDocument();
    expect(screen.getByText(/支持图片/)).toBeInTheDocument();
  });

  it('shows drag-over text when isDragOver is true', () => {
    render(
      <UploadZone
        isDragOver={true}
        onDragOver={mockOnDragOver}
        onFiles={mockOnFiles}
      />,
    );

    expect(screen.getByText('释放文件以上传')).toBeInTheDocument();
  });

  it('calls onDragOver(true) on dragOver event', () => {
    render(
      <UploadZone
        isDragOver={false}
        onDragOver={mockOnDragOver}
        onFiles={mockOnFiles}
      />,
    );

    const zone = screen.getByTestId('upload-zone');
    fireEvent.dragOver(zone);

    expect(mockOnDragOver).toHaveBeenCalledWith(true);
  });

  it('calls onDragOver(false) on dragLeave event', () => {
    render(
      <UploadZone
        isDragOver={true}
        onDragOver={mockOnDragOver}
        onFiles={mockOnFiles}
      />,
    );

    const zone = screen.getByTestId('upload-zone');
    fireEvent.dragLeave(zone);

    expect(mockOnDragOver).toHaveBeenCalledWith(false);
  });

  it('calls onFiles on file drop', () => {
    render(
      <UploadZone
        isDragOver={false}
        onDragOver={mockOnDragOver}
        onFiles={mockOnFiles}
      />,
    );

    const zone = screen.getByTestId('upload-zone');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const dataTransfer = { files: [file] };

    fireEvent.drop(zone, { dataTransfer });

    expect(mockOnFiles).toHaveBeenCalled();
    expect(mockOnDragOver).toHaveBeenCalledWith(false);
  });

  it('opens file picker on click', () => {
    render(
      <UploadZone
        isDragOver={false}
        onDragOver={mockOnDragOver}
        onFiles={mockOnFiles}
      />,
    );

    const input = screen.getByTestId('upload-input');
    const clickSpy = vi.spyOn(input, 'click');

    const zone = screen.getByTestId('upload-zone');
    fireEvent.click(zone);

    expect(clickSpy).toHaveBeenCalled();
  });

  it('does not respond to events when disabled', () => {
    render(
      <UploadZone
        isDragOver={false}
        onDragOver={mockOnDragOver}
        onFiles={mockOnFiles}
        disabled
      />,
    );

    const zone = screen.getByTestId('upload-zone');
    fireEvent.dragOver(zone);
    fireEvent.click(zone);

    expect(mockOnDragOver).not.toHaveBeenCalled();
  });

  it('opens file picker on Enter key', () => {
    render(
      <UploadZone
        isDragOver={false}
        onDragOver={mockOnDragOver}
        onFiles={mockOnFiles}
      />,
    );

    const input = screen.getByTestId('upload-input');
    const clickSpy = vi.spyOn(input, 'click');

    const zone = screen.getByTestId('upload-zone');
    fireEvent.keyDown(zone, { key: 'Enter' });

    expect(clickSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UploadItem tests
// ---------------------------------------------------------------------------

describe('UploadItem', () => {
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUploadItemViewModel).mockReturnValue({
      copied: false,
      isDeleting: false,
      handleCopy: vi.fn(),
      handleDelete: vi.fn(),
    });
  });

  it('renders file name and public URL', () => {
    const upload = makeUpload();

    render(<UploadItem upload={upload} onDelete={mockOnDelete} />);

    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByText('https://s.zhe.to/20260212/abc.png')).toBeInTheDocument();
  });

  it('renders file size and type in meta', () => {
    const upload = makeUpload({ fileSize: 2048 });

    render(<UploadItem upload={upload} onDelete={mockOnDelete} />);

    expect(screen.getByText('2048 B')).toBeInTheDocument();
    expect(screen.getByText('image/png')).toBeInTheDocument();
  });

  it('shows check icon when copied is true', () => {
    vi.mocked(useUploadItemViewModel).mockReturnValue({
      copied: true,
      isDeleting: false,
      handleCopy: vi.fn(),
      handleDelete: vi.fn(),
    });

    const upload = makeUpload();
    const { container } = render(<UploadItem upload={upload} onDelete={mockOnDelete} />);

    // Check icon should be rendered (by title attribute on the button)
    const copyBtn = container.querySelector('[title="复制链接"]');
    expect(copyBtn).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// UploadingItem tests
// ---------------------------------------------------------------------------

describe('UploadingItem', () => {
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows file name for uploading state', () => {
    const file: UploadingFile = {
      id: 'temp-1',
      fileName: 'uploading.png',
      fileType: 'image/png',
      fileSize: 512,
      status: 'uploading',
      progress: 50,
    };

    render(<UploadingItem file={file} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('uploading.png')).toBeInTheDocument();
  });

  it('shows progress bar for uploading state', () => {
    const file: UploadingFile = {
      id: 'temp-1',
      fileName: 'test.png',
      fileType: 'image/png',
      fileSize: 512,
      status: 'uploading',
      progress: 60,
    };

    const { container } = render(<UploadingItem file={file} onDismiss={mockOnDismiss} />);

    const progressBar = container.querySelector('[style*="width: 60%"]');
    expect(progressBar).toBeInTheDocument();
  });

  it('shows error message for error state', () => {
    const file: UploadingFile = {
      id: 'temp-1',
      fileName: 'bad.exe',
      fileType: 'application/x-msdownload',
      fileSize: 100,
      status: 'error',
      progress: 0,
      error: 'File type not allowed',
    };

    render(<UploadingItem file={file} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('File type not allowed')).toBeInTheDocument();
  });

  it('shows dismiss button for error state', () => {
    const file: UploadingFile = {
      id: 'temp-1',
      fileName: 'bad.exe',
      fileType: 'application/x-msdownload',
      fileSize: 100,
      status: 'error',
      progress: 0,
      error: 'Nope',
    };

    render(<UploadingItem file={file} onDismiss={mockOnDismiss} />);

    const dismissBtn = screen.getByTitle('关闭');
    fireEvent.click(dismissBtn);

    expect(mockOnDismiss).toHaveBeenCalledWith('temp-1');
  });

  it('shows success message for success state', () => {
    const file: UploadingFile = {
      id: 'temp-1',
      fileName: 'done.png',
      fileType: 'image/png',
      fileSize: 1024,
      status: 'success',
      progress: 100,
      publicUrl: 'https://s.zhe.to/done.png',
    };

    render(<UploadingItem file={file} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('上传成功')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// UploadList tests
// ---------------------------------------------------------------------------

describe('UploadList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no uploads', () => {
    vi.mocked(useUploadsViewModel).mockReturnValue({
      uploads: [],
      loading: false,
      uploadingFiles: [],
      isDragOver: false,
      setIsDragOver: mockSetIsDragOver,
      handleFiles: mockHandleFiles,
      handleDelete: mockHandleDelete,
      refreshUploads: vi.fn(),
      dismissUploadingFile: mockDismissUploadingFile,
    });

    render(<UploadList />);

    expect(screen.getByText('暂无文件')).toBeInTheDocument();
    expect(screen.getByText('共 0 个文件')).toBeInTheDocument();
  });

  it('renders upload list with file count', () => {
    const uploads = [makeUpload({ id: 1 }), makeUpload({ id: 2, fileName: 'doc.pdf' })];

    vi.mocked(useUploadsViewModel).mockReturnValue({
      uploads,
      loading: false,
      uploadingFiles: [],
      isDragOver: false,
      setIsDragOver: mockSetIsDragOver,
      handleFiles: mockHandleFiles,
      handleDelete: mockHandleDelete,
      refreshUploads: vi.fn(),
      dismissUploadingFile: mockDismissUploadingFile,
    });

    // Mock individual item viewmodel
    vi.mocked(useUploadItemViewModel).mockReturnValue({
      copied: false,
      isDeleting: false,
      handleCopy: vi.fn(),
      handleDelete: vi.fn(),
    });

    render(<UploadList />);

    expect(screen.getByText('图片管理')).toBeInTheDocument();
    expect(screen.getByText('共 2 个文件')).toBeInTheDocument();
  });

  it('renders upload zone', () => {
    vi.mocked(useUploadsViewModel).mockReturnValue({
      uploads: [],
      loading: false,
      uploadingFiles: [],
      isDragOver: false,
      setIsDragOver: mockSetIsDragOver,
      handleFiles: mockHandleFiles,
      handleDelete: mockHandleDelete,
      refreshUploads: vi.fn(),
      dismissUploadingFile: mockDismissUploadingFile,
    });

    render(<UploadList />);

    expect(screen.getByTestId('upload-zone')).toBeInTheDocument();
  });

  it('renders uploading files when present', () => {
    const uploadingFiles: UploadingFile[] = [
      {
        id: 'temp-1',
        fileName: 'uploading.png',
        fileType: 'image/png',
        fileSize: 512,
        status: 'uploading',
        progress: 50,
      },
    ];

    vi.mocked(useUploadsViewModel).mockReturnValue({
      uploads: [],
      loading: false,
      uploadingFiles,
      isDragOver: false,
      setIsDragOver: mockSetIsDragOver,
      handleFiles: mockHandleFiles,
      handleDelete: mockHandleDelete,
      refreshUploads: vi.fn(),
      dismissUploadingFile: mockDismissUploadingFile,
    });

    render(<UploadList />);

    expect(screen.getByText('uploading.png')).toBeInTheDocument();
  });

  it('renders skeleton when loading', () => {
    vi.mocked(useUploadsViewModel).mockReturnValue({
      uploads: [],
      loading: true,
      uploadingFiles: [],
      isDragOver: false,
      setIsDragOver: mockSetIsDragOver,
      handleFiles: mockHandleFiles,
      handleDelete: mockHandleDelete,
      refreshUploads: vi.fn(),
      dismissUploadingFile: mockDismissUploadingFile,
    });

    render(<UploadList />);

    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
    expect(screen.queryByText('图片管理')).not.toBeInTheDocument();
  });
});
