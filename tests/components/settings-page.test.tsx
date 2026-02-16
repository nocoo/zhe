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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewModel.isExporting = false;
    mockViewModel.isImporting = false;
    mockViewModel.importResult = null;
  });

  it('renders page sections', () => {
    render(<SettingsPage />);

    expect(screen.getByText('数据导出')).toBeInTheDocument();
    expect(screen.getByText('数据导入')).toBeInTheDocument();
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
});
