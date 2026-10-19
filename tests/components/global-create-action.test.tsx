// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GlobalCreateAction } from "@/components/global-create-action";
import { CreateActionProvider, usePageCreateAction } from "@/contexts/create-action";

vi.mock("@/actions/links", () => ({ createLink: vi.fn() }));
vi.mock("@/actions/tags", () => ({ createTag: vi.fn() }));
vi.mock("@/viewmodels/useLinksViewModel", () =>
  vi.importActual("@/viewmodels/useCreateLinkViewModel"),
);
vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardService: () => ({
    siteUrl: "https://zhe.to",
    folders: [],
    tags: [],
    handleLinkCreated: vi.fn(),
    handleTagCreated: vi.fn(),
  }),
}));

function PageAction(props: { onClick: () => void; disabled?: boolean; expanded?: boolean }) {
  usePageCreateAction({ label: "New item", ...props });
  return null;
}

function pressShortcut(overrides: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "J",
    metaKey: true,
    bubbles: true,
    cancelable: true,
    ...overrides,
  });
  fireEvent(document, event);
  return event;
}

describe("global creation shortcut", () => {
  it.each([{ metaKey: true }, { metaKey: false, ctrlKey: true }])(
    "opens the link dialog with %j and preserves its draft on repeated activation",
    async (modifiers) => {
      render(<GlobalCreateAction />);
      expect(pressShortcut(modifiers).defaultPrevented).toBe(true);
      const input = screen.getByLabelText("原始链接");
      await waitFor(() => expect(input).toHaveFocus());
      fireEvent.change(input, { target: { value: "https://example.com/draft" } });
      expect(pressShortcut(modifiers).defaultPrevented).toBe(true);
      expect(input).toHaveValue("https://example.com/draft");
      expect(input).toHaveFocus();
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: "新建链接" })).toHaveFocus();
    },
  );

  it.each([
    { key: "k" },
    { key: "K", shiftKey: true },
    { metaKey: false },
    { shiftKey: true },
    { altKey: true },
    { isComposing: true },
  ])("ignores unrelated or unsafe keys: %j", (modifiers) => {
    render(<GlobalCreateAction />);
    expect(pressShortcut(modifiers).defaultPrevented).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores consumed events and removes its listener on unmount", () => {
    const { unmount } = render(<GlobalCreateAction />);
    const event = new KeyboardEvent("keydown", {
      key: "J",
      metaKey: true,
      cancelable: true,
    });
    event.preventDefault();
    fireEvent(document, event);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();
    expect(pressShortcut().defaultPrevented).toBe(false);
  });

  it("blocks the browser shortcut on key repeats without creating again", () => {
    render(<GlobalCreateAction />);
    expect(pressShortcut({ repeat: true }).defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses the current page action and respects disabled and expanded state", () => {
    const onClick = vi.fn();
    const tree = (disabled = false, expanded = false) => (
      <CreateActionProvider>
        <PageAction onClick={onClick} disabled={disabled} expanded={expanded} />
        <GlobalCreateAction />
      </CreateActionProvider>
    );
    const { rerender } = render(tree());
    pressShortcut({ key: "j" });
    expect(onClick).toHaveBeenCalledOnce();
    rerender(tree(true));
    expect(pressShortcut().defaultPrevented).toBe(true);
    rerender(tree(false, true));
    expect(pressShortcut().defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each(["dialog", "alertdialog"])("does not open over another %s", (role) => {
    render(
      <>
        <div role={role}>Existing dialog</div>
        <GlobalCreateAction />
      </>,
    );
    expect(pressShortcut().defaultPrevented).toBe(true);
    expect(screen.queryByLabelText("原始链接")).not.toBeInTheDocument();
  });

  it("exposes the shortcut in the tooltip without changing the action name", async () => {
    render(<GlobalCreateAction />);
    const button = screen.getByRole("button", { name: "新建链接" });
    expect(button).toHaveAttribute("aria-keyshortcuts", "Meta+J Control+J");
    await userEvent.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("⌘J / Ctrl+J");
  });
});
