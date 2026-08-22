// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TagsRoute from "@/app/(dashboard)/dashboard/tags/page";

vi.mock("@/components/dashboard/tags-page", () => ({
  TagsPage: () => <div data-testid="tags-page">Tags Page</div>,
}));

describe("TagsRoute", () => {
  it("renders TagsPage component", () => {
    const { getByTestId } = render(<TagsRoute />);
    expect(getByTestId("tags-page")).toBeInTheDocument();
  });
});
