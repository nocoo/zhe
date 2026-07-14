// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/actions/xray", () => ({
  getXrayConfig: vi.fn().mockResolvedValue({ success: false }),
}));

vi.mock("@/components/dashboard/xray-page", () => ({
  XrayPage: ({ initialData }: { initialData?: unknown }) => (
    <div>XrayPage{initialData ? " with data" : ""}</div>
  ),
}));

import { getXrayConfig } from "@/actions/xray";
import XrayRoute from "@/app/(dashboard)/dashboard/xray/page";

describe("XrayRoute", () => {
  it("renders XrayPage with prefetched data", async () => {
    vi.mocked(getXrayConfig).mockResolvedValue({
      success: true,
      data: { apiUrl: "https://api.example.com", maskedToken: "sk-••••" },
    });

    const jsx = await XrayRoute();
    render(jsx);

    expect(screen.getByText("XrayPage with data")).toBeInTheDocument();
    expect(getXrayConfig).toHaveBeenCalledOnce();
  });

  it("renders XrayPage without data on failure", async () => {
    vi.mocked(getXrayConfig).mockResolvedValue({ success: false });

    const jsx = await XrayRoute();
    render(jsx);

    expect(screen.getByText("XrayPage")).toBeInTheDocument();
  });
});
