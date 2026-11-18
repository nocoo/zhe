// @vitest-environment happy-dom

import { Dialog, DialogContent, DialogTitle } from "@nocoo/basalt/components/dialog";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
    expect(panel.className).not.toMatch(/\bbg-basalt-background\b/);
  });

  it("preserves the Basalt dialog surface", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>创建想法</DialogTitle>
          <p>body</p>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("data-basalt-surface-root");
  });
});
