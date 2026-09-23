// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LinkVisibilityButton, ShowHiddenButton } from "@/components/dashboard/link-visibility";

describe("LinkVisibilityButton", () => {
  it("offers hiding with an unpressed state when the post is visible", () => {
    const onToggle = vi.fn();
    render(<LinkVisibilityButton hidden={false} pending={false} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "隐藏帖子" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("offers unhiding with a pressed state when the post is hidden", () => {
    const onToggle = vi.fn();
    render(<LinkVisibilityButton hidden={true} pending={false} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "取消隐藏" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("spins the loader and blocks toggling while pending", () => {
    const onToggle = vi.fn();
    render(<LinkVisibilityButton hidden={true} pending={true} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "取消隐藏" });
    expect(button).toBeDisabled();
    const icon = button.querySelector("svg");
    expect(icon).toHaveClass("animate-spin");
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("ShowHiddenButton", () => {
  it("reflects the pressed state and toggles hidden post display", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ShowHiddenButton showHidden={false} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "展示隐藏" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    rerender(<ShowHiddenButton showHidden={true} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "展示隐藏" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
