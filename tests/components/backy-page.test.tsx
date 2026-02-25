import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BackyPage } from '@/components/dashboard/backy-page';
import type { BackyPushDetail } from '@/models/backy';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
  environment: 'dev' as 'prod' | 'dev',
  testResult: null as { ok: boolean; message: string } | null,
  pushResult: null as BackyPushDetail | null,
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

describe('BackyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockBackyViewModel.environment = 'dev';
    mockBackyViewModel.testResult = null;
    mockBackyViewModel.pushResult = null;
    mockBackyViewModel.history = null;
    mockBackyViewModel.error = null;
  });

  it('renders page heading', () => {
    render(<BackyPage />);

    expect(screen.getByText('远程备份')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockBackyViewModel.isLoading = true;
    render(<BackyPage />);

    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows config form when not configured', () => {
    mockBackyViewModel.isConfigured = false;
    render(<BackyPage />);

    expect(screen.getByTestId('backy-webhook-url')).toBeInTheDocument();
    expect(screen.getByTestId('backy-api-key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /保存/ })).toBeInTheDocument();
  });

  it('shows save button disabled when saving', () => {
    mockBackyViewModel.isConfigured = false;
    mockBackyViewModel.isSaving = true;
    render(<BackyPage />);

    const saveBtn = screen.getByRole('button', { name: /保存/ });
    expect(saveBtn).toBeDisabled();
  });

  it('shows error message', () => {
    mockBackyViewModel.isConfigured = false;
    mockBackyViewModel.error = 'Webhook URL 格式无效';
    render(<BackyPage />);

    expect(screen.getByTestId('backy-error')).toHaveTextContent('Webhook URL 格式无效');
  });

  it('calls handleSave when save button clicked', () => {
    mockBackyViewModel.isConfigured = false;
    render(<BackyPage />);

    const saveBtn = screen.getByRole('button', { name: /保存/ });
    fireEvent.click(saveBtn);

    expect(mockBackyHandleSave).toHaveBeenCalled();
  });

  it('shows cancel button in edit mode', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.isEditing = true;
    render(<BackyPage />);

    const cancelBtn = screen.getByRole('button', { name: /取消/ });
    fireEvent.click(cancelBtn);

    expect(mockBackyCancelEditing).toHaveBeenCalled();
  });

  it('shows environment badge when configured', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.environment = 'dev';
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    render(<BackyPage />);

    expect(screen.getByText('dev')).toBeInTheDocument();
  });

  it('shows prod badge for production environment', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.environment = 'prod';
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    render(<BackyPage />);

    expect(screen.getByText('prod')).toBeInTheDocument();
  });

  it('shows configured state with action buttons', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    render(<BackyPage />);

    expect(screen.getByText('https://backy.example.com/webhook')).toBeInTheDocument();
    expect(screen.getByText('sk-1••••cdef')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /测试连接/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /推送备份/ })).toBeInTheDocument();
    // History section is always visible with refresh button
    expect(screen.getByRole('button', { name: /刷新历史/ })).toBeInTheDocument();
  });

  it('calls handleTest when test button clicked', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    render(<BackyPage />);

    fireEvent.click(screen.getByRole('button', { name: /测试连接/ }));
    expect(mockBackyHandleTest).toHaveBeenCalled();
  });

  it('calls handlePush when push button clicked', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    render(<BackyPage />);

    fireEvent.click(screen.getByRole('button', { name: /推送备份/ }));
    expect(mockBackyHandlePush).toHaveBeenCalled();
  });

  it('calls handleLoadHistory when refresh button clicked', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    render(<BackyPage />);

    fireEvent.click(screen.getByRole('button', { name: /刷新历史/ }));
    expect(mockBackyHandleLoadHistory).toHaveBeenCalled();
  });

  it('calls startEditing when edit button clicked', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    render(<BackyPage />);

    const editBtn = screen.getByRole('button', { name: /编辑配置/ });
    fireEvent.click(editBtn);

    expect(mockBackyStartEditing).toHaveBeenCalled();
  });

  it('shows test result (success) in green box', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    mockBackyViewModel.testResult = { ok: true, message: '连接成功' };
    render(<BackyPage />);

    const testResult = screen.getByTestId('backy-test-result');
    expect(testResult).toHaveTextContent('连接成功');
    expect(testResult.className).toContain('border-green-200');
  });

  it('shows test result (failure) in red box with alert icon', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    mockBackyViewModel.testResult = { ok: false, message: '连接失败 (401)' };
    render(<BackyPage />);

    const testResult = screen.getByTestId('backy-test-result');
    expect(testResult).toHaveTextContent('连接失败 (401)');
    expect(testResult.className).toContain('border-red-200');
  });

  it('shows push result with detailed info', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    mockBackyViewModel.pushResult = {
      ok: true,
      message: '推送成功 (150ms)',
      durationMs: 150,
      request: {
        tag: 'v1.2.3-2026-02-24-10lnk-2fld-3tag',
        fileName: 'zhe-backup-2026-02-24.json',
        fileSizeBytes: 1024,
        backupStats: { links: 10, folders: 2, tags: 3 },
      },
    };
    render(<BackyPage />);

    const pushResult = screen.getByTestId('backy-push-result');
    expect(pushResult).toHaveTextContent('推送成功 (150ms)');
    expect(pushResult).toHaveTextContent('v1.2.3-2026-02-24-10lnk-2fld-3tag');
    expect(pushResult).toHaveTextContent('1.0 KB');
    expect(pushResult).toHaveTextContent('链接: 10');
    expect(pushResult).toHaveTextContent('文件夹: 2');
    expect(pushResult).toHaveTextContent('标签: 3');
  });

  it('shows push failure with response details', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    mockBackyViewModel.pushResult = {
      ok: false,
      message: '推送失败 (413)',
      durationMs: 50,
      request: { tag: 'v1.2.3', fileName: 'zhe-backup.json', fileSizeBytes: 999, backupStats: {} },
      response: { status: 413, body: { error: 'too large' } },
    };
    render(<BackyPage />);

    const pushResult = screen.getByTestId('backy-push-result');
    expect(pushResult).toHaveTextContent('推送失败 (413)');
    expect(pushResult).toHaveTextContent('HTTP 413');
    expect(pushResult.className).toContain('border-red-200');
  });

  it('shows backup history in grid layout', () => {
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
    render(<BackyPage />);

    const historySection = screen.getByTestId('backy-history');
    expect(historySection).toBeInTheDocument();
    // Badge count
    expect(screen.getByText('2 份')).toBeInTheDocument();
    // Entry data
    expect(screen.getByText('v1.2.3-2026-02-24-10lnk-2fld-3tag')).toBeInTheDocument();
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
    // Environment badge on entry
    expect(screen.getByText('prod')).toBeInTheDocument();
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
    render(<BackyPage />);

    expect(screen.getByText('暂无备份记录')).toBeInTheDocument();
  });

  it('disables test button when testing', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    mockBackyViewModel.isTesting = true;
    render(<BackyPage />);

    const testBtn = screen.getByRole('button', { name: /测试连接/ });
    expect(testBtn).toBeDisabled();
  });

  it('disables push button when pushing', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    mockBackyViewModel.isPushing = true;
    render(<BackyPage />);

    const pushBtn = screen.getByRole('button', { name: /推送备份/ });
    expect(pushBtn).toBeDisabled();
  });

  it('disables refresh button when loading history', () => {
    mockBackyViewModel.isConfigured = true;
    mockBackyViewModel.webhookUrl = 'https://backy.example.com/webhook';
    mockBackyViewModel.maskedApiKey = 'sk-1••••cdef';
    mockBackyViewModel.isLoadingHistory = true;
    render(<BackyPage />);

    const refreshBtn = screen.getByRole('button', { name: /刷新历史/ });
    expect(refreshBtn).toBeDisabled();
  });
});
