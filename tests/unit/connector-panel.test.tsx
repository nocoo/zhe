// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConnectorSummary } from "@/actions/connector";
import { ApiKeyRow } from "@/components/dashboard/api-keys-page-parts/api-key-row";
import { ConnectorPanel } from "@/components/dashboard/connector-panel";
import { getFileCategory } from "@/models/storage";

vi.mock("@/actions/connector", () => ({ loadConnectorSummary: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadConnectorSummary).mockResolvedValue({
    states: [{ state: "complete", count: 3 }],
    lastSeenAt: Date.now(),
  });
});
describe("shared installation and storage", () => {
  it("shows the shared key's Connector expiry and revokes it through the existing control", async () => {
    const revoke = vi.fn();
    render(
      <ApiKeyRow
        apiKey={{
          id: "shared-key",
          prefix: "zhe_example",
          name: "Shared CLI",
          scopes: "links:read,connector:write",
          createdAt: new Date("2026-08-01T12:00:00Z"),
          lastUsedAt: new Date("2026-08-02T12:00:00Z"),
        }}
        onRevoke={revoke}
      />,
    );
    expect(screen.getByText(/Connector 有效至/)).toHaveTextContent("2026年8月31日");
    expect(screen.getByText("connector:write")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("revoke-key-shared-key"));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("所有应用将立即失去访问权限");
    fireEvent.click(screen.getByTestId("confirm-revoke-shared-key"));
    expect(revoke).toHaveBeenCalledWith("shared-key");
  });
  it("uses the existing zhe installation and login and shows the automatic queue", async () => {
    render(<ConnectorPanel />);
    expect(screen.getByText(/npm install -g @nocoo\/zhe/)).toBeInTheDocument();
    expect(screen.getByText(/zhe login/)).toBeInTheDocument();
    expect(screen.getByText(/zhe connector start/)).toBeInTheDocument();
    expect(screen.getByText(/connector:write/)).toBeInTheDocument();
    expect(await screen.findByText("已补全 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新 Connector 状态" }));
    await waitFor(() => expect(loadConnectorSummary).toHaveBeenCalledTimes(2));
  });
  it("classifies stored videos separately from documents", () => {
    expect(getFileCategory("user/x/123/1/file.mp4")).toBe("video");
    expect(getFileCategory("user/x/123/1/file.webm")).toBe("video");
  });
});
