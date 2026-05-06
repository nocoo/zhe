// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockVm = {
  keys: [] as { id: string; name: string; prefix: string; scopes: string[]; createdAt: Date; lastUsedAt: Date | null }[],
  isLoading: false,
  isCreating: false,
  newlyCreatedKey: null as string | null,
  handleCreate: vi.fn(),
  handleRevoke: vi.fn(),
  clearNewKey: vi.fn(),
  availableScopes: [
    { value: "links:read", label: "读取链接", description: "" },
    { value: "links:write", label: "创建/修改链接", description: "" },
  ],
};

vi.mock("@/viewmodels/useApiKeysViewModel", () => ({
  useApiKeysViewModel: () => mockVm,
}));

import { ApiKeysPage } from "@/components/dashboard/api-keys-page";

// ---------------------------------------------------------------------------
// Tests — clipboard success/failure paths (#10.2 regression)
// ---------------------------------------------------------------------------

describe("ApiKeysPage — clipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVm.keys = [];
    mockVm.isLoading = false;
    mockVm.isCreating = false;
    mockVm.newlyCreatedKey = null;
  });

  it("shows toast.success when copying newly created key succeeds", async () => {
    mockVm.newlyCreatedKey = "zhe_live_abc123secret";

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    render(<ApiKeysPage />);

    fireEvent.click(screen.getByTestId("copy-new-key-btn"));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("已复制到剪贴板");
    }, { interval: 5 });

    expect(writeTextMock).toHaveBeenCalledWith("zhe_live_abc123secret");
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("shows toast.error when clipboard write rejects", async () => {
    mockVm.newlyCreatedKey = "zhe_live_abc123secret";

    const writeTextMock = vi.fn().mockRejectedValue(new Error("Permission denied"));
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    render(<ApiKeysPage />);

    fireEvent.click(screen.getByTestId("copy-new-key-btn"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("复制失败");
    }, { interval: 5 });

    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});
