// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader, PageHeaderSkeleton } from "@/components/ui/page-header";

afterEach(() => cleanup());

describe("PageHeader wrapper", () => {
  it("keeps the space below the header before page content", () => {
    const { container } = render(<PageHeader title="想法" />);
    expect(screen.getByRole("heading", { name: "想法" })).toBeInTheDocument();
    expect(container.firstElementChild?.className).toMatch(/\bmb-6\b/);
  });

  it("aligns title and actions on one row at dashboard density", () => {
    const { container } = render(
      <PageHeader
        title="想法"
        description="共 3 条想法"
        actions={<button type="button">新想法</button>}
      />,
    );
    const row = container.querySelector("header > div");
    expect(row?.className).toMatch(/\bmd:items-center\b/);
    expect(screen.getByRole("heading", { name: "想法" }).className).toMatch(/\btext-lg\b/);
  });

  it("matches header density with a pulse placeholder", () => {
    const { container } = render(<PageHeaderSkeleton />);
    expect(container.firstElementChild?.className).toMatch(/\bmb-6\b/);
    expect(screen.getByTestId("page-header-skeleton").querySelector(".h-7")).toBeTruthy();
    expect(screen.getByTestId("page-header-skeleton").querySelector(".h-8")).toBeTruthy();
  });
});
