// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollapsibleNavGroup } from "@/components/sidebar-parts/collapsible-nav-group";

afterEach(() => cleanup());

describe("CollapsibleNavGroup", () => {
  it("exposes group links when open", () => {
    render(
      <CollapsibleNavGroup label="概览" open onOpenChange={vi.fn()}>
        <a href="/dashboard/ideas">想法</a>
      </CollapsibleNavGroup>,
    );
    expect(screen.getByRole("link", { name: "想法" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse 概览" })).toBeInTheDocument();
  });

  it("removes closed group links from the accessibility tree", () => {
    render(
      <CollapsibleNavGroup label="概览" open={false} onOpenChange={vi.fn()}>
        <a href="/dashboard/ideas">想法</a>
      </CollapsibleNavGroup>,
    );
    expect(screen.queryByRole("link", { name: "想法" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand 概览" })).toBeInTheDocument();
  });
});
