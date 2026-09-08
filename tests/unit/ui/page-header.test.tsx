// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader, PageHeaderSkeleton } from "@/components/ui/page-header";

afterEach(() => cleanup());

describe("PageHeader", () => {
  it("renders the content heading", () => {
    const { container } = render(<PageHeader title="想法" description="共 3 条想法" />);
    expect(screen.getByRole("heading", { name: "想法" })).toBeInTheDocument();
    expect(screen.getByText("共 3 条想法")).toBeInTheDocument();
    expect(container.firstElementChild?.className).toMatch(/\bmb-6\b/);
  });

  it("matches header density with a pulse placeholder", () => {
    render(<PageHeaderSkeleton />);
    expect(screen.getByTestId("page-header-skeleton").querySelector(".h-8")).toBeTruthy();
  });
});
