// @vitest-environment happy-dom

/**
 * Locks Basalt control-density:
 *   Button/Input default → h-9
 *   Button/Input sm      → h-8 toolbar compact
 *   Button/Input lg      → h-10 form primary
 *
 * See docs/22-design-tokens.md.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

afterEach(() => cleanup());

describe("control density — Input", () => {
  it("default size is form scale (h-9)", () => {
    render(<Input aria-label="default-input" />);
    const el = screen.getByLabelText("default-input");
    expect(el.className).toMatch(/\bh-9\b/);
    expect(el.className).toMatch(/\btext-sm\b/);
    expect(el.className).not.toMatch(/\bh-8\b/);
  });

  it("sm size is compact toolbar scale (h-8, text-xs)", () => {
    render(<Input size="sm" aria-label="sm-input" />);
    const el = screen.getByLabelText("sm-input");
    expect(el.className).toMatch(/\bh-8\b/);
    expect(el.className).toMatch(/\btext-xs\b/);
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
  it("default is form secondary (h-9)", () => {
    render(<Button size="default">保存</Button>);
    const el = screen.getByRole("button", { name: "保存" });
    expect(el.className).toMatch(/\bh-9\b/);
    expect(el.className).not.toMatch(/\bh-8\b/);
    expect(el.className).not.toMatch(/\btext-xs\b/);
  });

  it("sm is toolbar compact (h-8, text-xs)", () => {
    render(<Button size="sm">新建</Button>);
    const el = screen.getByRole("button", { name: "新建" });
    expect(el.className).toMatch(/\bh-8\b/);
    expect(el.className).toMatch(/\btext-xs\b/);
  });

  it("icon is a square control", () => {
    render(
      <Button size="icon" aria-label="menu">
        ·
      </Button>,
    );
    const el = screen.getByRole("button", { name: "menu" });
    expect(el.className).toMatch(/\bh-9\b/);
    expect(el.className).toMatch(/\bw-9\b/);
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
    expect(el.className).toMatch(/\bh-8\b/);
    expect(el.className).toMatch(/\btext-xs\b/);
    expect(el.className).toMatch(/\bbg-basalt-control\b/);
  });
});

describe("control density — Checkbox", () => {
  it("sm is compact", () => {
    render(<Checkbox size="sm" aria-label="cb" />);
    expect(screen.getByRole("checkbox").className).toMatch(/\bh-3\b/);
  });
});
