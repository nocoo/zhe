// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TodoEmojiPicker } from "@/components/dashboard/todos-page-parts/todo-emoji-picker";

afterEach(() => cleanup());

/**
 * TodoEmojiPicker is a thin popover wrapper around a static emoji
 * palette. We drive the trigger + query + choice flow to make sure:
 *   • current emoji renders on the default trigger, "+" placeholder when null
 *   • the search input filters visibly rendered entries
 *   • picking an entry fires onChange with its char + closes the popover
 *   • the "清除" button only appears when a value is set, and clears via null
 */
describe("TodoEmojiPicker", () => {
  it("renders `+` placeholder when value is null", () => {
    render(<TodoEmojiPicker value={null} onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "选择 emoji" });
    expect(trigger.textContent).toBe("+");
  });

  it("renders the current glyph on the trigger when value is set", () => {
    render(<TodoEmojiPicker value="🎯" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "选择 emoji" }).textContent,
    ).toBe("🎯");
  });

  it("clicking a palette entry fires onChange with its glyph", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TodoEmojiPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "选择 emoji" }));
    // Pick from the "常用" group — "🎯" is the third default entry.
    const target = await screen.findByRole("button", { name: "target" });
    await user.click(target);
    expect(onChange).toHaveBeenCalledWith("🎯");
  });

  it("query filters entries and shows the empty label when nothing matches", async () => {
    const user = userEvent.setup();
    render(<TodoEmojiPicker value={null} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "选择 emoji" }));
    const search = screen.getByLabelText("搜索 emoji");
    fireEvent.change(search, { target: { value: "nomatch-xyz" } });
    expect(
      await screen.findByText("未找到匹配的 emoji"),
    ).toBeTruthy();
  });

  it("does not render 清除 when value is null; shows it and fires null when clicked", async () => {
    const user = userEvent.setup();
    const onChangeNull = vi.fn();
    render(<TodoEmojiPicker value={null} onChange={onChangeNull} />);
    await user.click(screen.getByRole("button", { name: "选择 emoji" }));
    expect(screen.queryByRole("button", { name: "清除 emoji" })).toBeNull();
    cleanup();

    // Fresh mount with a value present so the popover opens on a
    // component whose value is already set.
    const onChangeSet = vi.fn();
    render(<TodoEmojiPicker value="🎯" onChange={onChangeSet} />);
    await user.click(screen.getByRole("button", { name: "选择 emoji" }));
    const clear = await screen.findByRole("button", { name: "清除 emoji" });
    await user.click(clear);
    expect(onChangeSet).toHaveBeenCalledWith(null);
  });
});
