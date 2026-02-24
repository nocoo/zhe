import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhookPage } from '@/components/dashboard/webhook-page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockHandleGenerate = vi.fn();
const mockHandleRevoke = vi.fn();
const mockHandleRateLimitChange = vi.fn();
const mockSetRateLimit = vi.fn();

const mockWebhookVm = {
  token: null as string | null,
  createdAt: null as string | null,
  rateLimit: 5,
  setRateLimit: mockSetRateLimit,
  isLoading: false,
  isGenerating: false,
  isRevoking: false,
  webhookUrl: null as string | null,
  handleGenerate: mockHandleGenerate,
  handleRevoke: mockHandleRevoke,
  handleRateLimitChange: mockHandleRateLimitChange,
};

vi.mock('@/viewmodels/useWebhookViewModel', () => ({
  useWebhookViewModel: () => mockWebhookVm,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebhookVm.token = null;
    mockWebhookVm.createdAt = null;
    mockWebhookVm.rateLimit = 5;
    mockWebhookVm.isLoading = false;
    mockWebhookVm.isGenerating = false;
    mockWebhookVm.isRevoking = false;
    mockWebhookVm.webhookUrl = null;
  });

  it('renders webhook section', () => {
    render(<WebhookPage />);

    expect(screen.getByText('Webhook')).toBeInTheDocument();
  });

  it('copies token to clipboard when copy token button clicked', () => {
    mockWebhookVm.token = 'test-token-xyz';
    mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/test-token-xyz';

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<WebhookPage />);

    const copyButtons = screen.getAllByRole('button', { name: /复制/ });
    // First copy button is for the token
    fireEvent.click(copyButtons[0]);

    expect(writeTextMock).toHaveBeenCalledWith('test-token-xyz');
  });

  it('copies webhook URL to clipboard when copy URL button clicked', () => {
    mockWebhookVm.token = 'test-token-xyz';
    mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/test-token-xyz';

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<WebhookPage />);

    const copyButtons = screen.getAllByRole('button', { name: /复制/ });
    // Second copy button is for the webhook URL
    fireEvent.click(copyButtons[1]);

    expect(writeTextMock).toHaveBeenCalledWith('https://zhe.example.com/api/webhook/test-token-xyz');
  });

  // ====================================================================
  // Webhook card
  // ====================================================================

  describe('webhook card', () => {
    it('shows loading state when webhook is loading', () => {
      mockWebhookVm.isLoading = true;
      render(<WebhookPage />);

      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });

    it('shows generate button when no token exists', () => {
      render(<WebhookPage />);

      const btn = screen.getByRole('button', { name: /生成令牌/ });
      expect(btn).toBeInTheDocument();
    });

    it('calls handleGenerate when generate button clicked', () => {
      render(<WebhookPage />);

      const btn = screen.getByRole('button', { name: /生成令牌/ });
      fireEvent.click(btn);

      expect(mockHandleGenerate).toHaveBeenCalledOnce();
    });

    it('shows generating state', () => {
      mockWebhookVm.isGenerating = true;
      render(<WebhookPage />);

      expect(screen.getByText('生成中...')).toBeInTheDocument();
    });

    it('shows token and webhook URL when token exists', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      mockWebhookVm.createdAt = '2026-01-15T00:00:00.000Z';
      render(<WebhookPage />);

      // Token appears in the token display, webhook URL, and curl example
      const tokenMatches = screen.getAllByText(/abc-123-def/);
      expect(tokenMatches.length).toBeGreaterThanOrEqual(2);
      // Webhook URL appears in the URL display and the curl example
      const urlMatches = screen.getAllByText(/https:\/\/zhe\.example\.com\/api\/webhook/);
      expect(urlMatches.length).toBeGreaterThanOrEqual(1);
    });

    it('shows regenerate and revoke buttons when token exists', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      expect(screen.getByRole('button', { name: /重新生成/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /撤销令牌/ })).toBeInTheDocument();
    });

    it('calls handleGenerate when regenerate button clicked', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      const btn = screen.getByRole('button', { name: /重新生成/ });
      fireEvent.click(btn);

      expect(mockHandleGenerate).toHaveBeenCalledOnce();
    });

    it('calls handleRevoke when revoke button clicked', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      const btn = screen.getByRole('button', { name: /撤销令牌/ });
      fireEvent.click(btn);

      expect(mockHandleRevoke).toHaveBeenCalledOnce();
    });

    it('shows revoking state', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      mockWebhookVm.isRevoking = true;
      render(<WebhookPage />);

      expect(screen.getByText('撤销中...')).toBeInTheDocument();
    });

    it('shows copy buttons for token and webhook URL', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      // Should have copy buttons (via data-testid or aria-label)
      const copyButtons = screen.getAllByRole('button', { name: /复制/ });
      expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    });

    // ================================================================
    // Usage documentation section
    // ================================================================

    it('shows usage documentation section when token exists', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      expect(screen.getByText('使用说明')).toBeInTheDocument();
    });

    it('does not show usage documentation when no token exists', () => {
      render(<WebhookPage />);

      expect(screen.queryByText('使用说明')).not.toBeInTheDocument();
    });

    it('shows curl example in usage docs', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      expect(screen.getByText(/curl/)).toBeInTheDocument();
    });

    it('shows request parameters table', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      // Should show parameter names
      expect(screen.getByText('url')).toBeInTheDocument();
      expect(screen.getByText('customSlug')).toBeInTheDocument();
    });

    it('shows response format section', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      expect(screen.getByText('POST 响应格式')).toBeInTheDocument();
    });

    it('shows rate limit info', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      // 5 req/min (default) — appears in rate limit section and error table
      const matches = screen.getAllByText(/5/);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      // Check the specific rate limit text
      expect(screen.getByText(/次请求/)).toBeInTheDocument();
    });

    it('shows error codes section', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      expect(screen.getByText('错误码')).toBeInTheDocument();
      // Should show status codes
      expect(screen.getByText('400')).toBeInTheDocument();
      expect(screen.getByText('404')).toBeInTheDocument();
      expect(screen.getByText('409')).toBeInTheDocument();
      expect(screen.getByText('429')).toBeInTheDocument();
    });

    it('shows behavior notes section with idempotency info', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      expect(screen.getByText('行为说明')).toBeInTheDocument();
      expect(screen.getByText(/Idempotent/)).toBeInTheDocument();
    });

    // ================================================================
    // Rate limit slider
    // ================================================================

    it('shows rate limit slider when token exists', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      render(<WebhookPage />);

      expect(screen.getByTestId('rate-limit-slider')).toBeInTheDocument();
    });

    it('does not show rate limit slider when no token exists', () => {
      render(<WebhookPage />);

      expect(screen.queryByTestId('rate-limit-slider')).not.toBeInTheDocument();
    });

    it('displays current rate limit value', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      mockWebhookVm.rateLimit = 7;
      render(<WebhookPage />);

      const label = screen.getByTestId('rate-limit-value');
      expect(label).toHaveTextContent('7 次/分钟');
    });

    it('displays default rate limit value of 5', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      mockWebhookVm.rateLimit = 5;
      render(<WebhookPage />);

      const label = screen.getByTestId('rate-limit-value');
      expect(label).toHaveTextContent('5 次/分钟');
    });

    it('passes rateLimit to webhook documentation', () => {
      mockWebhookVm.token = 'abc-123-def';
      mockWebhookVm.webhookUrl = 'https://zhe.example.com/api/webhook/abc-123-def';
      mockWebhookVm.rateLimit = 9;
      render(<WebhookPage />);

      // The 429 error message includes the rate limit value
      expect(screen.getByText(/9 req\/min/)).toBeInTheDocument();
    });
  });
});
