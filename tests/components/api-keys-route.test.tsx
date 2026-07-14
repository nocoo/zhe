// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
