// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

afterEach(() => cleanup());

describe("Dialog overlay surface", () => {
  it("starts a Basalt L1 surface root instead of painting L0", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>创建想法</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.hasAttribute("data-basalt-surface-root")).toBe(true);
    expect(panel.className).not.toMatch(/\bbg-background\b/);
  });
});
