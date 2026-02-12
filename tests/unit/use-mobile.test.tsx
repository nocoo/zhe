import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

describe('useIsMobile', () => {
  let addEventListenerSpy: ReturnType<typeof vi.fn>;
  let removeEventListenerSpy: ReturnType<typeof vi.fn>;

  function mockMatchMedia(innerWidth: number) {
    addEventListenerSpy = vi.fn();
    removeEventListenerSpy = vi.fn();

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: innerWidth,
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: innerWidth < 768,
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
      }),
    });
  }

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
  });

  it('returns false (desktop) when innerWidth >= 768', async () => {
    mockMatchMedia(1024);
    const { useIsMobile } = await import('@/hooks/use-mobile');
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it('returns true (mobile) when innerWidth < 768', async () => {
    mockMatchMedia(375);
    const { useIsMobile } = await import('@/hooks/use-mobile');
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it('initially returns false before effect runs (!!undefined === false)', async () => {
    mockMatchMedia(375);
    const { useIsMobile } = await import('@/hooks/use-mobile');

    // Capture the first synchronous render value
    let initialValue: boolean | undefined;
    renderHook(() => {
      const val = useIsMobile();
      if (initialValue === undefined) initialValue = val;
      return val;
    });

    // !!undefined === false
    expect(initialValue).toBe(false);
  });

  it('registers and cleans up matchMedia listener', async () => {
    mockMatchMedia(1024);
    const { useIsMobile } = await import('@/hooks/use-mobile');
    const { unmount } = renderHook(() => useIsMobile());

    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('responds to matchMedia change events', async () => {
    mockMatchMedia(1024);
    const { useIsMobile } = await import('@/hooks/use-mobile');
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);

    // Simulate resize to mobile
    const changeHandler = addEventListenerSpy.mock.calls[0][1];
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true, configurable: true });
      changeHandler();
    });

    expect(result.current).toBe(true);
  });
});
