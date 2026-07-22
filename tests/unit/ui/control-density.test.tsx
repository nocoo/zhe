// @vitest-environment happy-dom

/**
 * Locks the dashboard control-density contract:
 *   default     → h-10 form scale
 *   Button sm   → h-9 form secondary (settings / API keys / Backy)
 *   Button xs   → h-8 toolbar compact
 *   Input/Select/Checkbox sm → h-8 compact fields
 *
 * See docs/22-design-tokens.md and CLAUDE.md.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

afterEach(() => cleanup());

describe("control density — Input", () => {
  it("default size is form scale (h-10)", () => {
    render(<Input aria-label="default-input" />);
    const el = screen.getByLabelText("default-input");
    expect(el.className).toMatch(/\bh-10\b/);
    expect(el.className).not.toMatch(/\bh-8\b/);
  });

  it("sm size is compact toolbar scale (h-8, text-xs, rounded-widget)", () => {
    render(<Input size="sm" aria-label="sm-input" />);
    const el = screen.getByLabelText("sm-input");
    expect(el.className).toMatch(/\bh-8\b/);
    expect(el.className).toMatch(/\btext-xs\b/);
    expect(el.className).toMatch(/\brounded-widget\b/);
  });

  it("className overrides win over size defaults (title-style text-base)", () => {
    render(<Input size="sm" aria-label="title" className="text-base font-medium" />);
    const el = screen.getByLabelText("title");
    expect(el.className).toMatch(/\btext-base\b/);
    // tailwind-merge drops the body text-xs from size=sm; file:text-xs may remain.
    expect(el.className).not.toMatch(/(?<!file:)\btext-xs\b/);
  });
});

describe("control density — Button", () => {
  it("sm is form secondary (h-9, text-sm) — not toolbar compact", () => {
    render(<Button size="sm">保存</Button>);
    const el = screen.getByRole("button", { name: "保存" });
    expect(el.className).toMatch(/\bh-9\b/);
    expect(el.className).not.toMatch(/\bh-8\b/);
    // base cva sets text-sm; xs is the only compact text-xs tier
    expect(el.className).not.toMatch(/\btext-xs\b/);
  });

  it("xs is toolbar compact (h-8, text-xs, rounded-widget)", () => {
    render(<Button size="xs">新建</Button>);
    const el = screen.getByRole("button", { name: "新建" });
    expect(el.className).toMatch(/\bh-8\b/);
    expect(el.className).toMatch(/\btext-xs\b/);
    expect(el.className).toMatch(/\brounded-widget\b/);
  });

  it("icon-sm is a 32px square", () => {
    render(
      <Button size="icon-sm" aria-label="menu">
        ·
      </Button>,
    );
    const el = screen.getByRole("button", { name: "menu" });
    expect(el.className).toMatch(/\bh-8\b/);
    expect(el.className).toMatch(/\bw-8\b/);
  });
});

describe("control density — SelectTrigger", () => {
  it("sm is compact", () => {
    render(
      <Select>
        <SelectTrigger size="sm" aria-label="due-filter">
          <SelectValue placeholder="全部" />
        </SelectTrigger>
      </Select>,
    );
    const el = screen.getByLabelText("due-filter");
    expect(el.getAttribute("data-size")).toBe("sm");
    expect(el.className).toMatch(/\bh-8\b/);
    expect(el.className).toMatch(/\brounded-widget\b/);
    expect(el.className).toMatch(/\btext-xs\b/);
  });
});

describe("control density — Checkbox", () => {
  it("default and sm expose data-size", () => {
    const { rerender } = render(<Checkbox aria-label="cb" />);
    expect(screen.getByRole("checkbox").getAttribute("data-size")).toBe("default");
    rerender(<Checkbox size="sm" aria-label="cb" />);
    expect(screen.getByRole("checkbox").getAttribute("data-size")).toBe("sm");
    expect(screen.getByRole("checkbox").className).toMatch(/\bh-3\.5\b/);
  });
});
