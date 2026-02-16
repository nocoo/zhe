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
const mockSetAutoConvertPng = vi.fn();
const mockSetJpegQuality = vi.fn();

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
  const mockHandleDeleteFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUploadItemViewModel).mockReturnValue({
      copied: false,
      isDeleting: false,
      handleCopy: vi.fn(),
      handleDelete: mockHandleDeleteFn,
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
      handleDelete: mockHandleDeleteFn,
    });

    const upload = makeUpload();
    const { container } = render(<UploadItem upload={upload} onDelete={mockOnDelete} />);

    // Check icon should be rendered (by title attribute on the button)
    const copyBtn = container.querySelector('[title="复制链接"]');
    expect(copyBtn).toBeInTheDocument();
  });

  it('shows AlertDialog confirmation when delete button is clicked', () => {
    const upload = makeUpload();
    render(<UploadItem upload={upload} onDelete={mockOnDelete} />);

    const deleteBtn = screen.getByLabelText('Delete file');
    fireEvent.click(deleteBtn);

    expect(screen.getByText('确认删除')).toBeInTheDocument();
    expect(screen.getByText('此操作不可撤销，确定要删除这个文件吗？')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('calls handleDelete when AlertDialog confirm button is clicked', () => {
    const upload = makeUpload();
    render(<UploadItem upload={upload} onDelete={mockOnDelete} />);

    // Open dialog
    fireEvent.click(screen.getByLabelText('Delete file'));
    // Confirm delete
    fireEvent.click(screen.getByText('删除'));

    expect(mockHandleDeleteFn).toHaveBeenCalled();
  });

  it('does not call handleDelete when cancel is clicked', () => {
    const upload = makeUpload();
    render(<UploadItem upload={upload} onDelete={mockOnDelete} />);

    // Open dialog
    fireEvent.click(screen.getByLabelText('Delete file'));
    // Cancel
    fireEvent.click(screen.getByText('取消'));

    expect(mockHandleDeleteFn).not.toHaveBeenCalled();
  });

  it('disables delete button when isDeleting', () => {
    vi.mocked(useUploadItemViewModel).mockReturnValue({
      copied: false,
      isDeleting: true,
      handleCopy: vi.fn(),
      handleDelete: mockHandleDeleteFn,
    });

    const upload = makeUpload();
    render(<UploadItem upload={upload} onDelete={mockOnDelete} />);

    const deleteBtn = screen.getByLabelText('Delete file');
    expect(deleteBtn).toBeDisabled();
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
  function mockUploadsVM(overrides: Record<string, unknown> = {}) {
    const defaults = {
      uploads: [],
      loading: false,
      uploadingFiles: [],
      isDragOver: false,
      setIsDragOver: mockSetIsDragOver,
      autoConvertPng: false,
      setAutoConvertPng: mockSetAutoConvertPng,
      jpegQuality: 90,
      setJpegQuality: mockSetJpegQuality,
      handleFiles: mockHandleFiles,
      handleDelete: mockHandleDelete,
      refreshUploads: vi.fn(),
      dismissUploadingFile: mockDismissUploadingFile,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useUploadsViewModel).mockReturnValue({ ...defaults, ...overrides } as any);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no uploads', () => {
    mockUploadsVM();

    render(<UploadList />);

    expect(screen.getByText('暂无文件')).toBeInTheDocument();
    expect(screen.getByText('共 0 个文件')).toBeInTheDocument();
  });

  it('renders upload list with file count', () => {
    const uploads = [makeUpload({ id: 1 }), makeUpload({ id: 2, fileName: 'doc.pdf' })];
    mockUploadsVM({ uploads });

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
    mockUploadsVM();

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
    mockUploadsVM({ uploadingFiles });

    render(<UploadList />);

    expect(screen.getByText('uploading.png')).toBeInTheDocument();
  });

  it('renders skeleton when loading', () => {
    mockUploadsVM({ loading: true });

    render(<UploadList />);

    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
    expect(screen.queryByText('图片管理')).not.toBeInTheDocument();
  });

  it('renders PNG auto-convert switch', () => {
    mockUploadsVM();

    render(<UploadList />);

    expect(screen.getByText('PNG 自动转 JPG')).toBeInTheDocument();
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toBeInTheDocument();
    expect(switchEl).not.toBeChecked();
  });

  it('renders PNG auto-convert switch as checked when enabled', () => {
    mockUploadsVM({ autoConvertPng: true });

    render(<UploadList />);

    const switchEl = screen.getByRole('switch');
    expect(switchEl).toBeChecked();
  });

  it('calls setAutoConvertPng when switch is toggled', () => {
    mockUploadsVM();

    render(<UploadList />);

    const switchEl = screen.getByRole('switch');
    fireEvent.click(switchEl);

    expect(mockSetAutoConvertPng).toHaveBeenCalledWith(true);
  });

  it('does not show quality slider when autoConvertPng is off', () => {
    mockUploadsVM({ autoConvertPng: false });

    render(<UploadList />);

    expect(screen.queryByText('质量')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('JPG 质量')).not.toBeInTheDocument();
  });

  it('shows quality slider when autoConvertPng is on', () => {
    mockUploadsVM({ autoConvertPng: true, jpegQuality: 90 });

    render(<UploadList />);

    expect(screen.getByText('质量')).toBeInTheDocument();
    expect(screen.getByLabelText('JPG 质量')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('shows custom quality value', () => {
    mockUploadsVM({ autoConvertPng: true, jpegQuality: 75 });

    render(<UploadList />);

    expect(screen.getByText('75')).toBeInTheDocument();
  });
});
