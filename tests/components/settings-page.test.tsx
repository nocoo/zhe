import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from '@/components/dashboard/settings-page';
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

const mockHandleGenerate = vi.fn();
const mockHandleRevoke = vi.fn();

const mockWebhookVm = {
  token: null as string | null,
  createdAt: null as string | null,
  isLoading: false,
  isGenerating: false,
  isRevoking: false,
  webhookUrl: null as string | null,
  handleGenerate: mockHandleGenerate,
  handleRevoke: mockHandleRevoke,
};

vi.mock('@/viewmodels/useWebhookViewModel', () => ({
  useWebhookViewModel: () => mockWebhookVm,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewModel.isExporting = false;
    mockViewModel.isImporting = false;
    mockViewModel.importResult = null;
    mockWebhookVm.token = null;
    mockWebhookVm.createdAt = null;
    mockWebhookVm.isLoading = false;
    mockWebhookVm.isGenerating = false;
    mockWebhookVm.isRevoking = false;
    mockWebhookVm.webhookUrl = null;
  });

  it('renders page sections', () => {
    render(<SettingsPage />);

    expect(screen.getByText('数据导出')).toBeInTheDocument();
    expect(screen.getByText('数据导入')).toBeInTheDocument();
    expect(screen.getByText('Webhook')).toBeInTheDocument();
  });

  it('renders export button', () => {
    render(<SettingsPage />);

    const exportBtn = screen.getByRole('button', { name: /导出/ });
    expect(exportBtn).toBeInTheDocument();
  });

  it('calls handleExport when export button clicked', () => {
    render(<SettingsPage />);

    const exportBtn = screen.getByRole('button', { name: /导出/ });
    fireEvent.click(exportBtn);

    expect(mockHandleExport).toHaveBeenCalled();
  });

  it('disables export button when exporting', () => {
    mockViewModel.isExporting = true;
    render(<SettingsPage />);

    const exportBtn = screen.getByRole('button', { name: /导出/ });
    expect(exportBtn).toBeDisabled();
  });

  it('shows exporting text when exporting', () => {
    mockViewModel.isExporting = true;
    render(<SettingsPage />);

    expect(screen.getByText('导出中...')).toBeInTheDocument();
  });

  it('renders import file input', () => {
    render(<SettingsPage />);

    const fileInput = screen.getByTestId('import-file-input');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('accept', '.json');
  });

  it('calls handleImport when file selected', () => {
    render(<SettingsPage />);

    const fileInput = screen.getByTestId('import-file-input');
    const file = new File(['[]'], 'links.json', { type: 'application/json' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(mockHandleImport).toHaveBeenCalledWith(file);
  });

  it('disables import when importing', () => {
    mockViewModel.isImporting = true;
    render(<SettingsPage />);

    expect(screen.getByText('导入中...')).toBeInTheDocument();
  });

  it('shows import result when available', () => {
    mockViewModel.importResult = { created: 5, skipped: 2 };
    render(<SettingsPage />);

    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it('shows dismiss button for import result', () => {
    mockViewModel.importResult = { created: 3, skipped: 0 };
    render(<SettingsPage />);

    const dismissBtn = screen.getByRole('button', { name: /确定/ });
    fireEvent.click(dismissBtn);

    expect(mockClearImportResult).toHaveBeenCalled();
  });

  // ====================================================================
  // Webhook card
  // ====================================================================

  describe('webhook card', () => {
    it('shows loading state when webhook is loading', () => {
      mockWebhookVm.isLoading = true;
      render(<SettingsPage />);

      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });

    it('shows generate button when no token exists', () => {
      render(<SettingsPage />);

      const btn = screen.getByRole('button', { name: /生成令牌/ });
      expect(btn).toBeInTheDocument();
    });

    it('calls handleGenerate when generate button clicked', () => {
      render(<SettingsPage />);

      const btn = screen.getByRole('button', { name: /生成令牌/ });
      fireEvent.click(btn);

      expect(mockHandleGenerate).toHaveBeenCalledOnce();
    });

    it('shows generating state', () => {
      mockWebhookVm.isGenerating = true;
      render(<SettingsPage />);

      expect(screen.getByText('生成中...')).toBeInTheDocument();
    });

    it('shows token and webhook URL when token exists', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      mockWebhookVm.createdAt = '2026-01-15T00:00:00.000Z';
      render(<SettingsPage />);

      // Token appears in both the token display and the webhook URL
      const matches = screen.getAllByText(/abc-123-def/);
      expect(matches.length).toBe(2);
      // Webhook URL should be visible
      expect(screen.getByText(/https:\/\/zhe\.example\.com\/api\/webhook/)).toBeInTheDocument();
    });

    it('shows regenerate and revoke buttons when token exists', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<SettingsPage />);

      expect(screen.getByRole('button', { name: /重新生成/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /撤销令牌/ })).toBeInTheDocument();
    });

    it('calls handleGenerate when regenerate button clicked', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<SettingsPage />);

      const btn = screen.getByRole('button', { name: /重新生成/ });
      fireEvent.click(btn);

      expect(mockHandleGenerate).toHaveBeenCalledOnce();
    });

    it('calls handleRevoke when revoke button clicked', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<SettingsPage />);

      const btn = screen.getByRole('button', { name: /撤销令牌/ });
      fireEvent.click(btn);

      expect(mockHandleRevoke).toHaveBeenCalledOnce();
    });

    it('shows revoking state', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      mockWebhookVm.isRevoking = true;
      render(<SettingsPage />);

      expect(screen.getByText('撤销中...')).toBeInTheDocument();
    });

    it('shows copy buttons for token and webhook URL', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<SettingsPage />);

      // Should have copy buttons (via data-testid or aria-label)
      const copyButtons = screen.getAllByRole('button', { name: /复制/ });
      expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    });
  });
});
