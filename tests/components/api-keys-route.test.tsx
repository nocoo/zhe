// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import ApiKeysRoute from "@/app/(dashboard)/dashboard/api-keys/page";

// Mock the page component
vi.mock("@/components/dashboard/api-keys-page", () => ({
  ApiKeysPage: () => <div data-testid="api-keys-page">API Keys Page</div>,
}));

describe("ApiKeysRoute", () => {
  it("renders ApiKeysPage component", () => {
    const { getByTestId } = render(<ApiKeysRoute />);
    expect(getByTestId("api-keys-page")).toBeInTheDocument();
  });
});