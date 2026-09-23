// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorToolbar } from "@/components/dashboard/idea-editor-page-parts/editor-toolbar";
import type { Tag } from "@/models/types";

function tag(id: string, name: string): Tag {
  return { id, name, color: "#123456", userId: "u", createdAt: new Date(0) };
}

function props(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: "First idea",
    setTitle: vi.fn(),
    tags: [tag("t1", "产品"), tag("t2", "阅读")],
    selectedTagIds: ["t2"],
    toggleTag: vi.fn(),
    dirty: true,
    isSaving: false,
    onSave: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

describe("EditorToolbar", () => {
  it("navigates back and edits the optional title, mapping empty to null", async () => {
    const p = props();
    const user = userEvent.setup();
    render(<EditorToolbar {...p} />);
    await user.click(screen.getByRole("button", { name: "返回想法列表" }));
    expect(p.onBack).toHaveBeenCalledOnce();

    const input = screen.getByPlaceholderText("标题 (可选)") as HTMLInputElement;
    expect(input.value).toBe("First idea");
    fireEvent.change(input, { target: { value: "Rewritten" } });
    expect(p.setTitle).toHaveBeenLastCalledWith("Rewritten");
    fireEvent.change(input, { target: { value: "" } });
    expect(p.setTitle).toHaveBeenLastCalledWith(null);
  });

  it("toggles tags and hides the badges when none exist", async () => {
    const p = props();
    const user = userEvent.setup();
    const { rerender } = render(<EditorToolbar {...p} />);
    expect(screen.getByText("产品")).toBeInTheDocument();
    expect(screen.getByText("阅读")).toBeInTheDocument();
    await user.click(screen.getByText("阅读"));
    expect(p.toggleTag).toHaveBeenCalledWith("t2");

    rerender(<EditorToolbar {...props({ tags: [] })} />);
    expect(screen.queryByText("产品")).not.toBeInTheDocument();
  });

  it("keeps save disabled until dirty and shows the saving spinner", () => {
    const p = props({ dirty: false });
    const { rerender } = render(<EditorToolbar {...p} />);
    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();
    expect(screen.queryByText("未保存")).not.toBeInTheDocument();
    fireEvent.click(save);
    expect(p.onSave).not.toHaveBeenCalled();

    const dirty = props();
    rerender(<EditorToolbar {...dirty} />);
    expect(screen.getByText("未保存")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(dirty.onSave).toHaveBeenCalledOnce();

    rerender(<EditorToolbar {...props({ isSaving: true })} />);
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "保存" }).querySelector(".animate-spin"),
    ).not.toBeNull();
  });
});
