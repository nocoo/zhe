// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSettingsPage } from "@/components/dashboard/ai-settings-page";

const mockVm = {
  settings: {
    provider: "",
    model: "",
    baseURL: "",
    sdkType: "",
    authType: "",
    hasApiKey: false,
    apiKeyLast4: "",
  },
  setSettings: vi.fn(),
  apiKeyInput: "",
  setApiKeyInput: vi.fn(),
  customModelInput: "",
  setCustomModelInput: vi.fn(),
  isCustomModel: false,
  setIsCustomModel: vi.fn(),
  isCustomProvider: false,
  providerInfo: null,
  presetModels: [] as string[],
  providerOptions: [
    { id: "anthropic", label: "Anthropic" },
    { id: "custom", label: "自定义" },
  ],
  loaded: true,
  saving: false,
  testStatus: "idle" as const,
  testError: "",
  canSubmit: false,
  handleProviderChange: vi.fn(),
  handleSdkTypeChange: vi.fn(),
  handleModelSelect: vi.fn(),
  handleSave: vi.fn(),
  handleTest: vi.fn(),
};

vi.mock("@/viewmodels/useAiSettingsViewModel", async () => {
  const actual = await vi.importActual<typeof import("@/viewmodels/useAiSettingsViewModel")>(
    "@/viewmodels/useAiSettingsViewModel",
  );
  return {
    ...actual,
    useAiSettingsViewModel: () => mockVm,
  };
});

describe("AiSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVm.canSubmit = false;
    mockVm.loaded = true;
    mockVm.testStatus = "idle";
    mockVm.testError = "";
    mockVm.settings = {
      provider: "",
      model: "",
      baseURL: "",
      sdkType: "",
      authType: "",
      hasApiKey: false,
      apiKeyLast4: "",
    };
  });

  it("renders the page header", () => {
    render(<AiSettingsPage />);
    expect(screen.getByTestId("ai-settings-page")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("disables save and test without a provider", () => {
    render(<AiSettingsPage />);
    expect(screen.getByTestId("ai-save")).toBeDisabled();
    expect(screen.getByTestId("ai-test")).toBeDisabled();
  });

  it("enables actions when a provider is selected", () => {
    mockVm.canSubmit = true;
    mockVm.settings = { ...mockVm.settings, provider: "anthropic" };
    render(<AiSettingsPage />);
    fireEvent.click(screen.getByTestId("ai-test"));
    expect(mockVm.handleTest).toHaveBeenCalled();
  });
});
