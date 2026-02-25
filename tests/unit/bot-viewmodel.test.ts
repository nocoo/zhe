import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetDiscordBotConfig = vi.fn();
const mockSaveDiscordBotConfig = vi.fn();

vi.mock('@/actions/bot', () => ({
  getDiscordBotConfig: (...args: unknown[]) => mockGetDiscordBotConfig(...args),
  saveDiscordBotConfig: (...args: unknown[]) => mockSaveDiscordBotConfig(...args),
}));

import { useBotViewModel } from '@/viewmodels/useBotViewModel';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const validToken = 'FAKE_ID.FAKE_TS.FAKE_HMAC_FOR_TESTING';
const validPublicKey = 'a'.repeat(64);
const validAppId = '123456789012345678';

const maskedToken = 'FAKE••••••••••••••••••••••••••••••TING';
const maskedKey = 'aaaa••••••••••••••••••••••••••••••••••••••••••••••••••••aaaa';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBotViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no config
    mockGetDiscordBotConfig.mockResolvedValue({ success: true, data: undefined });
  });

  // ==================================================================
  // Initial state
  // ==================================================================
  it('returns initial loading state', () => {
    mockGetDiscordBotConfig.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useBotViewModel());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isConfigured).toBe(false);
    expect(result.current.botToken).toBe('');
    expect(result.current.publicKey).toBe('');
    expect(result.current.applicationId).toBe('');
    expect(result.current.maskedBotToken).toBeNull();
    expect(result.current.maskedPublicKey).toBeNull();
    expect(result.current.savedApplicationId).toBeNull();
    expect(result.current.isEditing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loads config on mount when configured', async () => {
    mockGetDiscordBotConfig.mockResolvedValue({
      success: true,
      data: {
        maskedBotToken: maskedToken,
        maskedPublicKey: maskedKey,
        applicationId: validAppId,
      },
    });

    const { result } = renderHook(() => useBotViewModel());
    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isConfigured).toBe(true);
    expect(result.current.maskedBotToken).toBe(maskedToken);
    expect(result.current.maskedPublicKey).toBe(maskedKey);
    expect(result.current.savedApplicationId).toBe(validAppId);
  });

  it('loads without config on mount when not configured', async () => {
    mockGetDiscordBotConfig.mockResolvedValue({ success: true, data: undefined });

    const { result } = renderHook(() => useBotViewModel());
    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isConfigured).toBe(false);
  });

  // ==================================================================
  // handleSave
  // ==================================================================
  it('saves config successfully', async () => {
    const { result } = renderHook(() => useBotViewModel());
    await act(async () => {});

    // Set form values
    act(() => {
      result.current.setBotToken(validToken);
      result.current.setPublicKey(validPublicKey);
      result.current.setApplicationId(validAppId);
    });

    mockSaveDiscordBotConfig.mockResolvedValue({
      success: true,
      data: {
        maskedBotToken: maskedToken,
        maskedPublicKey: maskedKey,
        applicationId: validAppId,
      },
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.isConfigured).toBe(true);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.maskedBotToken).toBe(maskedToken);
    expect(result.current.maskedPublicKey).toBe(maskedKey);
    expect(result.current.savedApplicationId).toBe(validAppId);
    // Fields cleared after save
    expect(result.current.botToken).toBe('');
    expect(result.current.publicKey).toBe('');
    expect(result.current.applicationId).toBe('');
  });

  it('shows error on save failure', async () => {
    const { result } = renderHook(() => useBotViewModel());
    await act(async () => {});

    act(() => {
      result.current.setBotToken('invalid');
      result.current.setPublicKey(validPublicKey);
      result.current.setApplicationId(validAppId);
    });

    mockSaveDiscordBotConfig.mockResolvedValue({
      success: false,
      error: 'Bot Token 格式无效',
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.error).toBe('Bot Token 格式无效');
    expect(result.current.isConfigured).toBe(false);
  });

  it('shows default error when error is empty', async () => {
    const { result } = renderHook(() => useBotViewModel());
    await act(async () => {});

    mockSaveDiscordBotConfig.mockResolvedValue({ success: false });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.error).toBe('保存失败');
  });

  // ==================================================================
  // Editing mode
  // ==================================================================
  it('startEditing enters edit mode and clears fields', async () => {
    mockGetDiscordBotConfig.mockResolvedValue({
      success: true,
      data: {
        maskedBotToken: maskedToken,
        maskedPublicKey: maskedKey,
        applicationId: validAppId,
      },
    });

    const { result } = renderHook(() => useBotViewModel());
    await act(async () => {});

    act(() => {
      result.current.startEditing();
    });

    expect(result.current.isEditing).toBe(true);
    expect(result.current.botToken).toBe('');
    expect(result.current.publicKey).toBe('');
    expect(result.current.applicationId).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('cancelEditing exits edit mode and clears error', async () => {
    const { result } = renderHook(() => useBotViewModel());
    await act(async () => {});

    act(() => {
      result.current.startEditing();
      result.current.setBotToken('some-token');
    });

    act(() => {
      result.current.cancelEditing();
    });

    expect(result.current.isEditing).toBe(false);
    expect(result.current.botToken).toBe('');
    expect(result.current.publicKey).toBe('');
    expect(result.current.applicationId).toBe('');
    expect(result.current.error).toBeNull();
  });

  // ==================================================================
  // isSaving flag
  // ==================================================================
  it('sets isSaving during save', async () => {
    const { result } = renderHook(() => useBotViewModel());
    await act(async () => {});

    let resolveSave: (v: unknown) => void;
    mockSaveDiscordBotConfig.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );

    act(() => {
      result.current.setBotToken(validToken);
      result.current.setPublicKey(validPublicKey);
      result.current.setApplicationId(validAppId);
    });

    // Start save but don't resolve yet
    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.handleSave();
    });

    expect(result.current.isSaving).toBe(true);

    // Resolve and finish
    await act(async () => {
      resolveSave!({ success: true, data: { maskedBotToken: maskedToken, maskedPublicKey: maskedKey, applicationId: validAppId } });
      await savePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });
});
