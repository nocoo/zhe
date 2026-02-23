import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataManagementPage } from '@/components/dashboard/data-management-page';
import type { ImportResult } from '@/actions/settings';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockHandleExport = vi.fn();
const mockHandleImport = vi.fn();
const mockClearImportResult = vi.fn();

const mockViewModel = {
  isExporting: false,
  isImporting: false,
  importResult: null as ImportResult | null,
  handleExport: mockHandleExport,
  handleImport: mockHandleImport,
  clearImportResult: mockClearImportResult,
};

vi.mock('@/viewmodels/useSettingsViewModel', () => ({
  useSettingsViewModel: () => mockViewModel,
}));

// Backy viewmodel mock
const mockBackyHandleSave = vi.fn();
const mockBackyHandleTest = vi.fn();
const mockBackyHandlePush = vi.fn();
const mockBackyHandleLoadHistory = vi.fn();
const mockBackyStartEditing = vi.fn();
const mockBackyCancelEditing = vi.fn();
const mockBackyClearTestResult = vi.fn();
const mockBackyClearPushResult = vi.fn();

const mockBackyViewModel = {
  webhookUrl: '',
  setWebhookUrl: vi.fn(),
  apiKey: '',
  setApiKey: vi.fn(),
  maskedApiKey: null as string | null,
  isConfigured: false,
  isEditing: false,
  isLoading: false,
  isSaving: false,
  isTesting: false,
  isPushing: false,
  isLoadingHistory: false,
  testResult: null as { ok: boolean; message: string } | null,
  pushResult: null as { ok: boolean; message: string } | null,
  history: null as { project_name: string; environment: string | null; total_backups: number; recent_backups: { id: string; tag: string; environment: string; file_size: number; is_single_json: number; created_at: string }[] } | null,
  error: null as string | null,
  handleSave: mockBackyHandleSave,
  handleTest: mockBackyHandleTest,
  handlePush: mockBackyHandlePush,
  handleLoadHistory: mockBackyHandleLoadHistory,
  startEditing: mockBackyStartEditing,
  cancelEditing: mockBackyCancelEditing,
  clearTestResult: mockBackyClearTestResult,
  clearPushResult: mockBackyClearPushResult,
};

vi.mock('@/viewmodels/useBackyViewModel', () => ({
  useBackyViewModel: () => mockBackyViewModel,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DataManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewModel.isExporting = false;
    mockViewModel.isImporting = false;
    mockViewModel.importResult = null;

    // Reset Backy mock
    mockBackyViewModel.webhookUrl = '';
    mockBackyViewModel.apiKey = '';
    mockBackyViewModel.maskedApiKey = null;
    mockBackyViewModel.isConfigured = false;
    mockBackyViewModel.isEditing = false;
    mockBackyViewModel.isLoading = false;
    mockBackyViewModel.isSaving = false;
    mockBackyViewModel.isTesting = false;
    mockBackyViewModel.isPushing = false;
    mockBackyViewModel.isLoadingHistory = false;
    mockBackyViewModel.testResult = null;
    mockBackyViewModel.pushResult = null;
    mockBackyViewModel.history = null;
    mockBackyViewModel.error = null;
  });

  // ==================================================================
  // Existing data export/import tests
  // ==================================================================

  it('renders page sections', () => {
    render(<DataManagementPage />);

    expect(screen.getByText('数据导出')).toBeInTheDocument();
    expect(screen.getByText('数据导入')).toBeInTheDocument();
    expect(screen.getByText('远程备份')).toBeInTheDocument();
  });

  it('renders export button', () => {
    render(<DataManagementPage />);

    const exportBtn = screen.getByRole('button', { name: /导出/ });
    expect(exportBtn).toBeInTheDocument();
  });

  it('calls handleExport when export button clicked', () => {
    render(<DataManagementPage />);

    const exportBtn = screen.getByRole('button', { name: /导出/ });
    fireEvent.click(exportBtn);

    expect(mockHandleExport).toHaveBeenCalled();
  });

  it('disables export button when exporting', () => {
    mockViewModel.isExporting = true;
    render(<DataManagementPage />);

    const exportBtn = screen.getByRole('button', { name: /导出/ });
    expect(exportBtn).toBeDisabled();
  });

  it('shows exporting text when exporting', () => {
    mockViewModel.isExporting = true;
    render(<DataManagementPage />);

    expect(screen.getByText('导出中...')).toBeInTheDocument();
  });

  it('renders import file input', () => {
    render(<DataManagementPage />);

    const fileInput = screen.getByTestId('import-file-input');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('accept', '.json');
  });

  it('calls handleImport when file selected', () => {
    render(<DataManagementPage />);

    const fileInput = screen.getByTestId('import-file-input');
    const file = new File(['[]'], 'links.json', { type: 'application/json' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(mockHandleImport).toHaveBeenCalledWith(file);
  });

  it('disables import when importing', () => {
    mockViewModel.isImporting = true;
    render(<DataManagementPage />);

    expect(screen.getByText('导入中...')).toBeInTheDocument();
  });

  it('shows import result when available', () => {
    mockViewModel.importResult = { created: 5, skipped: 2 };
    render(<DataManagementPage />);

    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it('shows dismiss button for import result', () => {
    mockViewModel.importResult = { created: 3, skipped: 0 };
    render(<DataManagementPage />);

    const dismissBtn = screen.getByRole('button', { name: /确定/ });
    fireEvent.click(dismissBtn);

    expect(mockClearImportResult).toHaveBeenCalled();
  });

  it('resets file input after file selection (onFileChange)', () => {
    render(<DataManagementPage />);

    const fileInput = screen.getByTestId('import-file-input') as HTMLInputElement;
    const file = new File(['{}'], 'data.json', { type: 'application/json' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(mockHandleImport).toHaveBeenCalledWith(file);
    expect(fileInput.value).toBe('');
  });

  it('does not call handleImport when no file selected (onFileChange)', () => {
    render(<DataManagementPage />);

    const fileInput = screen.getByTestId('import-file-input');

    fireEvent.change(fileInput, { target: { files: [] } });

    expect(mockHandleImport).not.toHaveBeenCalled();
  });

  // ==================================================================
  // Backy remote backup section
  // ==================================================================

  describe('Backy section', () => {
    it('shows loading state', () => {
      mockBackyViewModel.isLoading = true;
      render(<DataManagementPage />);

      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });

    it('shows config form when not configured', () => {
      mockBackyViewModel.isConfigured = false;
      render(<DataManagementPage />);

      expect(screen.getByTestId('backy-webhook-url')).toBeInTheDocument();
      expect(screen.getByTestId('backy-api-key')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /保存/ })).toBeInTheDocument();
    });

    it('shows save button disabled when saving', () => {
      mockBackyViewModel.isConfigured = false;
      mockBackyViewModel.isSaving = true;
      render(<DataManagementPage />);

      const saveBtn = screen.getByRole('button', { name: /保存/ });
      expect(saveBtn).toBeDisabled();
    });

    it('shows saving text when saving', () => {
      mockBackyViewModel.isConfigured = false;
      mockBackyViewModel.isSaving = true;
      render(<DataManagementPage />);

      expect(screen.getByText('保存中...')).toBeInTheDocument();
    });

    it('shows error message', () => {
      mockBackyViewModel.isConfigured = false;
      mockBackyViewModel.error = 'Webhook URL 格式无效';
      render(<DataManagementPage />);

      expect(screen.getByTestId('backy-error')).toHaveTextContent('Webhook URL 格式无效');
    });

    it('calls handleSave when save button clicked', () => {
      mockBackyViewModel.isConfigured = false;
      render(<DataManagementPage />);

      const saveBtn = screen.getByRole('button', { name: /保存/ });
      fireEvent.click(saveBtn);

      expect(mockBackyHandleSave).toHaveBeenCalled();
    });

    it('shows cancel button in edit mode', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.isEditing = true;
      render(<DataManagementPage />);

      const cancelBtn = screen.getByRole('button', { name: /取消/ });
      fireEvent.click(cancelBtn);

      expect(mockBackyCancelEditing).toHaveBeenCalled();
    });

    it('shows configured state with action buttons', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      render(<DataManagementPage />);

      expect(screen.getByText('https://backy.example.com/webhook')).toBeInTheDocument();
      expect(screen.getByText('sk-1••••cdef')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /测试连接/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /推送备份/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /查看历史/ })).toBeInTheDocument();
    });

    it('calls handleTest when test button clicked', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      render(<DataManagementPage />);

      fireEvent.click(screen.getByRole('button', { name: /测试连接/ }));
      expect(mockBackyHandleTest).toHaveBeenCalled();
    });

    it('calls handlePush when push button clicked', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      render(<DataManagementPage />);

      fireEvent.click(screen.getByRole('button', { name: /推送备份/ }));
      expect(mockBackyHandlePush).toHaveBeenCalled();
    });

    it('calls handleLoadHistory when history button clicked', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      render(<DataManagementPage />);

      fireEvent.click(screen.getByRole('button', { name: /查看历史/ }));
      expect(mockBackyHandleLoadHistory).toHaveBeenCalled();
    });

    it('calls startEditing when edit button clicked', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      render(<DataManagementPage />);

      const editBtn = screen.getByRole('button', { name: /编辑配置/ });
      fireEvent.click(editBtn);

      expect(mockBackyStartEditing).toHaveBeenCalled();
    });

    it('shows test result (success)', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      mockBackyViewModel.testResult = { ok: true, message: '连接成功' };
      render(<DataManagementPage />);

      const testResult = screen.getByTestId('backy-test-result');
      expect(testResult).toHaveTextContent('连接成功');
    });

    it('shows test result (failure)', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      mockBackyViewModel.testResult = { ok: false, message: '连接失败 (401)' };
      render(<DataManagementPage />);

      const testResult = screen.getByTestId('backy-test-result');
      expect(testResult).toHaveTextContent('连接失败 (401)');
    });

    it('shows push result', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      mockBackyViewModel.pushResult = { ok: true, message: '备份成功 (v1.2.3)' };
      render(<DataManagementPage />);

      const pushResult = screen.getByTestId('backy-push-result');
      expect(pushResult).toHaveTextContent('备份成功 (v1.2.3)');
    });

    it('shows backup history', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      mockBackyViewModel.history = {
        project_name: 'zhe',
        environment: null,
        total_backups: 2,
        recent_backups: [
          {
            id: '1',
            tag: 'v1.2.3-2026-02-24-10lnk-2fld-3tag',
            environment: 'prod',
            file_size: 1024,
            is_single_json: 1,
            created_at: '2026-02-24T00:00:00Z',
          },
        ],
      };
      render(<DataManagementPage />);

      const historySection = screen.getByTestId('backy-history');
      expect(historySection).toBeInTheDocument();
      expect(screen.getByText('共 2 次备份')).toBeInTheDocument();
      expect(screen.getByText('v1.2.3-2026-02-24-10lnk-2fld-3tag')).toBeInTheDocument();
      expect(screen.getByText('1.0 KB')).toBeInTheDocument();
    });

    it('shows empty history message', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      mockBackyViewModel.history = {
        project_name: 'zhe',
        environment: null,
        total_backups: 0,
        recent_backups: [],
      };
      render(<DataManagementPage />);

      expect(screen.getByText('暂无备份记录')).toBeInTheDocument();
    });

    it('disables test button when testing', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      mockBackyViewModel.isTesting = true;
      render(<DataManagementPage />);

      const testBtn = screen.getByRole('button', { name: /测试/ });
      expect(testBtn).toBeDisabled();
      expect(screen.getByText('测试中...')).toBeInTheDocument();
    });

    it('disables push button when pushing', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      mockBackyViewModel.isPushing = true;
      render(<DataManagementPage />);

      const pushBtn = screen.getByRole('button', { name: /推送/ });
      expect(pushBtn).toBeDisabled();
      expect(screen.getByText('推送中...')).toBeInTheDocument();
    });

    it('disables history button when loading history', () => {
      mockBackyViewModel.isConfigured = true;
      mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
      mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
      mockBackyViewModel.isLoadingHistory = true;
      render(<DataManagementPage />);

      const historyBtn = screen.getByRole('button', { name: /加载/ });
      expect(historyBtn).toBeDisabled();
    });
  });
});
