// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/backy", () => ({
  getBackyConfig: vi.fn().mockResolvedValue({ success: false }),
  fetchBackyHistory: vi.fn().mockResolvedValue({ success: false }),
  getBackyPullWebhook: vi.fn().mockResolvedValue({ success: false }),
}));

vi.mock("@/components/dashboard/backy-page", () => ({
  BackyPage: ({ initialData }: { initialData?: unknown }) => (
    <div>BackyPage{initialData ? " with data" : ""}</div>
  ),
}));

import { fetchBackyHistory, getBackyConfig, getBackyPullWebhook } from "@/actions/backy";
import BackyRoute from "@/app/(dashboard)/dashboard/backy/page";

describe("BackyRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders BackyPage with prefetched config + history", async () => {
    vi.mocked(getBackyConfig).mockResolvedValue({
      success: true,
      data: { webhookUrl: "https://backy.example.com", maskedApiKey: "sk-••••" },
    });
    vi.mocked(fetchBackyHistory).mockResolvedValue({
      success: true,
      data: { project_name: "zhe", total_backups: 1, recent_backups: [], environment: null },
    });

    const jsx = await BackyRoute();
    render(jsx);

    expect(screen.getByText("BackyPage with data")).toBeInTheDocument();
    expect(getBackyConfig).toHaveBeenCalledOnce();
    expect(getBackyPullWebhook).toHaveBeenCalledOnce();
    expect(fetchBackyHistory).toHaveBeenCalledOnce();
  });

  it("renders BackyPage with initialData even when config not found", async () => {
    vi.mocked(getBackyConfig).mockResolvedValue({ success: false });

    const jsx = await BackyRoute();
    render(jsx);

    // Route always passes initialData object (with pullWebhook field)
    expect(screen.getByText("BackyPage with data")).toBeInTheDocument();
    expect(fetchBackyHistory).not.toHaveBeenCalled();
  });

  it("renders BackyPage with config but no history on history failure", async () => {
    vi.mocked(getBackyConfig).mockResolvedValue({
      success: true,
      data: { webhookUrl: "https://backy.example.com", maskedApiKey: "sk-••••" },
    });
    vi.mocked(fetchBackyHistory).mockResolvedValue({ success: false });

    const jsx = await BackyRoute();
    render(jsx);

    expect(screen.getByText("BackyPage with data")).toBeInTheDocument();
  });

  it("renders BackyPage with pull webhook data", async () => {
    vi.mocked(getBackyConfig).mockResolvedValue({ success: false });
    vi.mocked(getBackyPullWebhook).mockResolvedValue({
      success: true,
      data: { key: "test-key" },
    });

    const jsx = await BackyRoute();
    render(jsx);

    expect(screen.getByText("BackyPage with data")).toBeInTheDocument();
    expect(getBackyPullWebhook).toHaveBeenCalledOnce();
  });
});
