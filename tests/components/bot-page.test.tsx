import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BotPage } from '@/components/dashboard/bot-page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBotHandleSave = vi.fn();
const mockBotStartEditing = vi.fn();
const mockBotCancelEditing = vi.fn();

const mockBotViewModel = {
  botToken: '',
  setBotToken: vi.fn(),
  publicKey: '',
  setPublicKey: vi.fn(),
  applicationId: '',
  setApplicationId: vi.fn(),
  maskedBotToken: null as string | null,
  maskedPublicKey: null as string | null,
  savedApplicationId: null as string | null,
  isConfigured: false,
  isEditing: false,
  isLoading: false,
  isSaving: false,
  error: null as string | null,
  handleSave: mockBotHandleSave,
  startEditing: mockBotStartEditing,
  cancelEditing: mockBotCancelEditing,
};

vi.mock('@/viewmodels/useBotViewModel', () => ({
  useBotViewModel: () => mockBotViewModel,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BotPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBotViewModel.botToken = '';
    mockBotViewModel.publicKey = '';
    mockBotViewModel.applicationId = '';
    mockBotViewModel.maskedBotToken = null;
    mockBotViewModel.maskedPublicKey = null;
    mockBotViewModel.savedApplicationId = null;
    mockBotViewModel.isConfigured = false;
    mockBotViewModel.isEditing = false;
    mockBotViewModel.isLoading = false;
    mockBotViewModel.isSaving = false;
    mockBotViewModel.error = null;
  });

  it('renders page heading', () => {
    render(<BotPage />);

    expect(screen.getByText('Discord Bot')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockBotViewModel.isLoading = true;
    render(<BotPage />);

    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows config form when not configured', () => {
    mockBotViewModel.isConfigured = false;
    render(<BotPage />);

    expect(screen.getByTestId('bot-token')).toBeInTheDocument();
    expect(screen.getByTestId('bot-public-key')).toBeInTheDocument();
    expect(screen.getByTestId('bot-application-id')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /保存/ })).toBeInTheDocument();
  });

  it('shows save button disabled when saving', () => {
    mockBotViewModel.isConfigured = false;
    mockBotViewModel.isSaving = true;
    render(<BotPage />);

    const saveBtn = screen.getByRole('button', { name: /保存/ });
    expect(saveBtn).toBeDisabled();
  });

  it('shows error message', () => {
    mockBotViewModel.isConfigured = false;
    mockBotViewModel.error = 'Bot Token 格式无效';
    render(<BotPage />);

    expect(screen.getByTestId('bot-error')).toHaveTextContent('Bot Token 格式无效');
  });

  it('calls handleSave when save button clicked', () => {
    mockBotViewModel.isConfigured = false;
    render(<BotPage />);

    const saveBtn = screen.getByRole('button', { name: /保存/ });
    fireEvent.click(saveBtn);

    expect(mockBotHandleSave).toHaveBeenCalled();
  });

  it('shows cancel button in edit mode', () => {
    mockBotViewModel.isConfigured = true;
    mockBotViewModel.isEditing = true;
    render(<BotPage />);

    const cancelBtn = screen.getByRole('button', { name: /取消/ });
    fireEvent.click(cancelBtn);

    expect(mockBotCancelEditing).toHaveBeenCalled();
  });

  it('shows configured state with masked values', () => {
    mockBotViewModel.isConfigured = true;
    mockBotViewModel.maskedBotToken = 'MTIz••••xyz';
    mockBotViewModel.maskedPublicKey = 'abc1••••9def';
    mockBotViewModel.savedApplicationId = '123456789012345678';
    render(<BotPage />);

    expect(screen.getByText('MTIz••••xyz')).toBeInTheDocument();
    expect(screen.getByText('abc1••••9def')).toBeInTheDocument();
    expect(screen.getByText('123456789012345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /编辑配置/ })).toBeInTheDocument();
  });

  it('calls startEditing when edit button clicked', () => {
    mockBotViewModel.isConfigured = true;
    mockBotViewModel.maskedBotToken = 'MTIz••••xyz';
    mockBotViewModel.maskedPublicKey = 'abc1••••9def';
    mockBotViewModel.savedApplicationId = '123456789012345678';
    render(<BotPage />);

    const editBtn = screen.getByRole('button', { name: /编辑配置/ });
    fireEvent.click(editBtn);

    expect(mockBotStartEditing).toHaveBeenCalled();
  });
});
