// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader } from "@/components/ui/page-header";

afterEach(() => cleanup());

describe("PageHeader wrapper", () => {
  it("keeps the space below the header before page content", () => {
    const { container } = render(<PageHeader title="想法" />);
    expect(screen.getByRole("heading", { name: "想法" })).toBeInTheDocument();
    expect(container.firstElementChild?.className).toMatch(/\bmb-6\b/);
  });
});
