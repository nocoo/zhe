// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TodoTagChip } from "@/components/dashboard/todo-tag-chip";
import { todoTagColor } from "@/lib/todo-tag-color";

afterEach(() => cleanup());

/**
 * Note on `style` assertions: happy-dom's CSS parser rejects the modern
 * space-separated `hsl(H S% L%)` syntax (only comma form is accepted).
 * Real browsers accept both. We deliberately do NOT assert against
 * parsed `style.backgroundColor` etc. here — that would be a lie about
 * production behaviour. Instead we cross-check the pure helper's output
 * directly and verify the chip renders the derived name + affordances.
 */

describe("TodoTagChip", () => {
  it("renders the tag name and reports a colour triple from the pure helper", () => {
    const { container } = render(<TodoTagChip name="urgent" />);
    const chip = container.querySelector<HTMLElement>('[data-todo-tag="urgent"]');
    if (!chip) throw new Error("expected chip element");
    // No onClick → renders as <span>, not <button>.
    expect(chip.tagName).toBe("SPAN");
    expect(chip.textContent).toContain("urgent");
    // Cross-check: the helper the component uses produces the three
    // HSL tokens the design contract calls for.
    const colours = todoTagColor("urgent");
    expect(colours.bg).toMatch(/^hsl\(\d{1,3} 60% 92%\)$/);
    expect(colours.fg).toMatch(/^hsl\(\d{1,3} 45% 25%\)$/);
    expect(colours.border).toMatch(/^hsl\(\d{1,3} 55% 70%\)$/);
  });

  it("hash colour is deterministic across renders (same name → same helper output)", () => {
    const first = todoTagColor("work");
    const second = todoTagColor("Work"); // normalisation
    const other = todoTagColor("home");
    expect(second).toEqual(first);
    expect(other.bg).not.toBe(first.bg);
  });

  it("swaps to a <button> when onClick is provided and forwards the click", () => {
    const onClick = vi.fn();
    render(<TodoTagChip name="work" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: /work/i });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("trims the display name so ` Urgent ` renders as `Urgent`", () => {
    render(<TodoTagChip name="  urgent  " />);
    expect(screen.getByText("urgent")).toBeTruthy();
  });

  it("renders a remove affordance that stops propagation to the outer chip", () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    render(<TodoTagChip name="work" onClick={onClick} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText("Remove tag work"));
    expect(onRemove).toHaveBeenCalledTimes(1);
    // Main label's click handler must not fire when the ✕ was clicked.
    expect(onClick).not.toHaveBeenCalled();
  });

  it("never nests interactive controls (regression: onClick + onRemove used to render a <button> inside a <button>)", () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    const { container } = render(
      <TodoTagChip name="work" onClick={onClick} onRemove={onRemove} />,
    );
    // Nested <button> inside another <button> is invalid HTML and breaks
    // keyboard / screen-reader semantics; the layout must peel the
    // remove affordance out as a sibling instead.
    expect(container.querySelector("button button")).toBeNull();
    // Both controls remain independently clickable.
    fireEvent.click(screen.getByRole("button", { name: /^work$/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("onRemove without onClick still keeps the outer container non-interactive", () => {
    const onRemove = vi.fn();
    const { container } = render(<TodoTagChip name="work" onRemove={onRemove} />);
    const chip = container.querySelector<HTMLElement>('[data-todo-tag="work"]');
    if (!chip) throw new Error("expected chip");
    // Outer wrapper is a plain span so the ✕ button is not nested.
    expect(chip.tagName).toBe("SPAN");
    expect(container.querySelector("button button")).toBeNull();
  });
});
