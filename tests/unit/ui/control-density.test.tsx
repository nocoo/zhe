// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

afterEach(() => cleanup());

describe("dialog typography", () => {
  it("keeps confirmation typography at the same project scale", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>删除收藏？</AlertDialogTitle>
          <AlertDialogDescription>此操作不可撤销</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByRole("heading", { name: "删除收藏？" })).toHaveClass("text-lg", "leading-6");
    expect(screen.getByText("此操作不可撤销")).toHaveClass("text-sm", "leading-5");
  });
  it("uses a distinct modal heading and consistent body scale", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>编辑收藏</DialogTitle>
          <DialogDescription>修改标题和备注</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const heading = screen.getByRole("heading", { name: "编辑收藏" });
    expect(heading.className).toMatch(/\btext-lg\b/);
    expect(heading.className).toMatch(/\bleading-6\b/);
    const description = screen.getByText("修改标题和备注");
    expect(description.className).toMatch(/\btext-sm\b/);
    expect(description.className).toMatch(/\bleading-5\b/);
    expect(screen.getByRole("dialog")).toHaveAttribute("data-basalt-surface-root");
  });
});

describe("control density — Input", () => {
  it("lg size uses the package large action role", () => {
    render(<Input size="lg" aria-label="lg-input" />);
    const el = screen.getByLabelText("lg-input");
    expect(el).toHaveClass("basalt-action", "basalt-action-lg");
    expect(el).not.toHaveClass("basalt-action-sm");
  });

  it("default size uses the package action role", () => {
    render(<Input aria-label="default-input" />);
    const el = screen.getByLabelText("default-input");
    expect(el).toHaveClass("basalt-action");
    expect(el).not.toHaveClass("basalt-action-sm", "basalt-action-lg");
  });

  it("sm size uses the compact action role", () => {
    render(<Input size="sm" aria-label="sm-input" />);
    const el = screen.getByLabelText("sm-input");
    expect(el).toHaveClass("basalt-action", "basalt-action-sm");
  });

  it("className overrides win over size defaults (title-style text-base)", () => {
    render(<Input size="sm" aria-label="title" className="text-base font-medium" />);
    const el = screen.getByLabelText("title");
    expect(el.className).toMatch(/\btext-base\b/);
    expect(el).toHaveClass("basalt-action-sm");
  });
});

describe("control density — Button", () => {
  it("lg uses the large action role", () => {
    render(<Button size="lg">创建</Button>);
    const el = screen.getByRole("button", { name: "创建" });
    expect(el).toHaveClass("basalt-action", "basalt-action-lg");
  });

  it("default uses the standard action role", () => {
    render(<Button size="default">保存</Button>);
    const el = screen.getByRole("button", { name: "保存" });
    expect(el).toHaveClass("basalt-action");
    expect(el).not.toHaveClass("basalt-action-sm", "basalt-action-lg");
  });

  it("sm uses the compact action role", () => {
    render(<Button size="sm">新建</Button>);
    const el = screen.getByRole("button", { name: "新建" });
    expect(el).toHaveClass("basalt-action", "basalt-action-sm");
  });

  it("icon is a square control", () => {
    render(
      <Button size="icon" aria-label="menu">
        ·
      </Button>,
    );
    const el = screen.getByRole("button", { name: "menu" });
    expect(el).toHaveClass("basalt-action", "basalt-action-icon");
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
    expect(el).toHaveClass("basalt-action", "basalt-action-sm");
    expect(el.className).toMatch(/\bbg-basalt-control\b/);
  });
});

describe("control density — Checkbox", () => {
  it("sm is compact", () => {
    render(<Checkbox size="sm" aria-label="cb" />);
    expect(screen.getByRole("checkbox")).toHaveClass("h-basalt-check-sm", "w-basalt-check-sm");
  });
});
