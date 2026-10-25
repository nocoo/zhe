// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader, PageHeaderSkeleton } from "@/components/ui/page-header";

afterEach(() => cleanup());

describe("PageHeader", () => {
  it("keeps title, inline meta and actions on a single row", () => {
    const { container } = render(
      <PageHeader
        title="想法"
        meta="共 3 条"
        actions={
          <button type="button" data-testid="filter-trigger">
            筛选
          </button>
        }
      />,
    );
    expect(screen.getByRole("heading", { name: "想法" })).toBeInTheDocument();
    expect(screen.getByText("共 3 条")).toBeInTheDocument();
    const header = container.firstElementChild as HTMLElement;
    expect(header.className).toMatch(/\bmb-4\b/);
    expect(header.className).toMatch(/md:flex-row/);
    expect(header.children).toHaveLength(2);
    expect(header.children[1]?.contains(screen.getByTestId("filter-trigger"))).toBe(true);
  });

  it("gives the inline meta the full value on hover", () => {
    render(<PageHeader title="标签" meta="共 12 个" />);
    expect(screen.getByText("共 12 个")).toHaveAttribute("title", "共 12 个");
  });

  it("matches header density with a pulse placeholder", () => {
    render(<PageHeaderSkeleton />);
    const skeleton = screen.getByTestId("page-header-skeleton");
    expect(skeleton.querySelector(".h-6")).toBeTruthy();
    expect(skeleton.className).toMatch(/\bmb-4\b/);
  });
});
