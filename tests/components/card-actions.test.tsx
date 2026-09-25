// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Eye, Trash2 } from "lucide-react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CardActions } from "@/components/dashboard/card-actions";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

let resize: ResizeObserverCallback;
const disconnect = vi.fn();
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        if (target.hasAttribute("data-card-actions-container")) resize = this.callback;
      }
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function width(value: number) {
  act(() =>
    resize([{ contentRect: { width: value } } as ResizeObserverEntry], {} as ResizeObserver),
  );
}
const primary = <Button aria-label="Edit">Edit</Button>;

it("moves secondary actions based on container width and keeps the primary visible", async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  const { unmount } = render(
    <div data-card-actions-container>
      <CardActions primary={primary} secondary={[{ label: "Hide", icon: Eye, onSelect: action }]} />
    </div>,
  );
  expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Hide" })).toBeNull();
  const more = screen.getByRole("button", { name: "更多收藏操作" });
  await user.click(more);
  await user.click(screen.getByRole("menuitem", { name: "Hide" }));
  expect(action).toHaveBeenCalledTimes(1);
  expect(more).toHaveFocus();
  width(640);
  await user.click(screen.getByRole("button", { name: "Hide" }));
  expect(action).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("button", { name: "更多收藏操作" })).toBeNull();
  width(320);
  await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
  width(640);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();
  unmount();
  expect(disconnect).toHaveBeenCalled();
});

it("keeps pending and disabled actions inert, with readable menu labels", async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  render(
    <div data-card-actions-container>
      <CardActions
        primary={primary}
        secondary={[
          {
            label: "Delete a saved item with a very long title",
            icon: Trash2,
            onSelect: action,
            destructive: true,
            disabled: true,
            pending: true,
          },
          { label: "Hide", icon: Eye, onSelect: action },
        ]}
        menuItems={<DropdownMenuItem>Extra</DropdownMenuItem>}
      />
    </div>,
  );
  await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
  expect(screen.getByRole("menuitem", { name: /Delete/ })).toHaveAttribute("aria-disabled", "true");
  await user.keyboard("{ArrowDown}{Escape}");
  expect(action).not.toHaveBeenCalled();
  width(640);
  expect(screen.getByRole("button", { name: /Delete/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Delete/ })).toHaveAttribute("aria-busy", "true");
  await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
  expect(screen.queryByRole("menuitem", { name: "Hide" })).toBeNull();
  expect(screen.getByRole("menuitem", { name: "Extra" })).toBeVisible();
});

it("does not invent a menu for a card with only a primary action", () => {
  render(<CardActions primary={primary} secondary={[]} />);
  expect(screen.queryByRole("button", { name: "更多收藏操作" })).toBeNull();
});
