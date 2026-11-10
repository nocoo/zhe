// @vitest-environment happy-dom

import { PageHeader } from "@nocoo/basalt/components/page-header";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeaderSkeleton } from "@/components/ui/page-header";

afterEach(() => cleanup());

describe("PageHeader", () => {
  it("renders title, description below, and actions on the title row", () => {
    const { container } = render(
      <PageHeader
        title="想法"
        description="共 3 条"
        actions={
          <button type="button" data-testid="filter-trigger">
            筛选
          </button>
        }
      />,
    );
    expect(screen.getByRole("heading", { name: "想法" })).toBeInTheDocument();
    expect(screen.getByText("共 3 条")).toBeInTheDocument();
    const header = container.querySelector("header");
    expect(header).toBeTruthy();
    const title = screen.getByRole("heading", { name: "想法" });
    const description = screen.getByText("共 3 条");
    expect(
      title.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("filter-trigger")).toBeInTheDocument();
  });

  it("matches header density with a pulse placeholder", () => {
    render(<PageHeaderSkeleton />);
    const skeleton = screen.getByTestId("page-header-skeleton");
    expect(skeleton.querySelector(".h-8")).toBeTruthy();
    expect(skeleton.querySelector(".h-4")).toBeTruthy();
  });
});
