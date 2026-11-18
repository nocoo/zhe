// @vitest-environment happy-dom

import { Sheet, SheetContent, SheetTitle } from "@nocoo/basalt/components/sheet";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => cleanup());

describe("Sheet overlay surface", () => {
  it("starts a Basalt L1 surface root instead of painting L0", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>待办详情</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.hasAttribute("data-basalt-surface-root")).toBe(true);
    expect(panel.className).not.toMatch(/\bbg-basalt-background\b/);
  });
});
