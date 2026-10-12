// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardEditDialog } from "@/components/dashboard/link-card-parts/card-edit-dialog";
import type { Link, LinkTag, Tag } from "@/models/types";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";

vi.mock("@/actions/connector", () => ({ updateXMediaDimensionsAction: vi.fn() }));

let activeCallbacks: EditLinkCallbacks | undefined;
vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useInlineLinkEditViewModel: (
    _link: Link,
    _tags: Tag[],
    _linkTags: LinkTag[],
    callbacks: EditLinkCallbacks,
  ) => {
    activeCallbacks = callbacks;
    return {
      editUrl: "https://example.com",
      setEditUrl: vi.fn(),
      editSlug: "test",
      setEditSlug: vi.fn(),
      editTitle: "Title",
      setEditTitle: vi.fn(),
      editNote: "Note",
      setEditNote: vi.fn(),
      editFolderId: null,
      setEditFolderId: vi.fn(),
      editScreenshotUrl: "",
      setEditScreenshotUrl: vi.fn(),
      assignedTags: [],
      assignedTagIds: new Set(),
      addTag: vi.fn(),
      removeTag: vi.fn(),
      createAndAssignTag: vi.fn(),
      saveEdit: vi.fn().mockResolvedValue(true),
      isSaving: false,
      isDeletingScreenshot: false,
      screenshotAction: null,
      error: "",
    };
  },
}));

const link: Link = {
  id: 10,
  userId: "user-1",
  originalUrl: "https://example.com",
  slug: "test",
  title: "Title",
  note: "Note",
  folderId: null,
  screenshotUrl: null,
  isHidden: false,
  isCustom: false,
  clicks: 0,
  createdAt: new Date(),
  expiresAt: null,
  metaTitle: null,
  metaDescription: null,
  metaFavicon: null,
};

const cleanupFns: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanupFns.splice(0)) cleanup();
});

function renderDialog({
  animated = false,
  onClose = vi.fn(),
  callbacks = {} as Partial<EditLinkCallbacks>,
} = {}) {
  const sourceEl = document.createElement("div");
  sourceEl.dataset.linkId = "10";
  sourceEl.style.width = "300px";
  sourceEl.style.height = "200px";
  document.body.appendChild(sourceEl);
  cleanupFns.push(() => sourceEl.remove());
  const triggerEl = document.createElement("button");
  triggerEl.setAttribute("aria-label", "更多收藏操作");
  sourceEl.appendChild(triggerEl);
  const editCallbacks: EditLinkCallbacks = {
    onLinkUpdated: vi.fn(),
    onTagCreated: vi.fn(),
    onLinkTagAdded: vi.fn(),
    onLinkTagRemoved: vi.fn(),
    ...callbacks,
  };
  const view = render(
    <CardEditDialog
      source={{ current: sourceEl }}
      trigger={{ current: triggerEl }}
      animated={animated}
      onClose={onClose}
      link={link}
      tags={[]}
      linkTags={[]}
      folders={[]}
      editCallbacks={editCallbacks}
    />,
  );
  return { ...view, sourceEl, triggerEl, editCallbacks };
}

describe("CardEditDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeCallbacks = undefined;
    vi.spyOn(HTMLElement.prototype, "animate").mockReturnValue({
      finished: Promise.resolve(),
      cancel: vi.fn(),
    } as unknown as Animation);
  });

  it("mounts a plain editor and closes through its close action", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    expect(screen.getByTestId("card-edit-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("runs the animated card flight", async () => {
    const animate = vi.spyOn(HTMLElement.prototype, "animate");
    renderDialog({ animated: true });
    await waitFor(() => expect(animate).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
  });

  it("defers editor callbacks until it closes, then forwards later updates immediately", async () => {
    const onLinkUpdated = vi.fn();
    const onTagCreated = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onClose, callbacks: { onLinkUpdated, onTagCreated } });
    const tag: Tag = {
      id: "t-new",
      userId: "user-1",
      name: "new tag",
      color: "#333",
      createdAt: new Date(),
    };
    activeCallbacks?.onLinkUpdated(link);
    activeCallbacks?.onTagCreated(tag);
    activeCallbacks?.onLinkTagAdded({ linkId: 10, tagId: "t-new" });
    activeCallbacks?.onLinkTagRemoved(10, "t-new");
    expect(onLinkUpdated).not.toHaveBeenCalled();
    expect(onTagCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() => {
      expect(onLinkUpdated).toHaveBeenCalledWith(link);
      expect(onTagCreated).toHaveBeenCalledWith(tag);
      expect(onClose).toHaveBeenCalled();
    });
    activeCallbacks?.onLinkUpdated(link);
    expect(onLinkUpdated).toHaveBeenCalledTimes(2);
    activeCallbacks?.onTagCreated(tag);
    activeCallbacks?.onLinkTagAdded({ linkId: 10, tagId: "t-new" });
    activeCallbacks?.onLinkTagRemoved(10, "t-new");
    expect(onTagCreated).toHaveBeenCalledTimes(2);
  });

  it("prevents closing while the edit panel is aria-busy, then allows it", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    await waitFor(() =>
      expect(screen.getByTestId("card-edit-dialog")).toHaveAttribute("data-phase", "editing"),
    );
    const area = screen.getByTestId("edit-area");
    area.setAttribute("aria-busy", "true");
    await userEvent.click(screen.getByRole("button", { name: "收起" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("card-edit-dialog")).toBeVisible();
    area.setAttribute("aria-busy", "false");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("ignores duplicate close requests during the return flight", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    await waitFor(() =>
      expect(screen.getByTestId("card-edit-dialog")).toHaveAttribute("data-phase", "editing"),
    );
    const close = screen.getByRole("button", { name: "收起" });
    await act(async () => {
      fireEvent.click(close);
      fireEvent.click(close);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("focuses the panel instead of opening the touch keyboard", async () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      renderDialog();
      await waitFor(() => expect(screen.getByTestId("card-edit-dialog")).toHaveFocus());
    } finally {
      matchMedia.mockRestore();
    }
  });

  it("keeps the editor usable without flight animations under reduced motion", async () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      const onClose = vi.fn();
      renderDialog({ animated: true, onClose });
      await waitFor(() =>
        expect(screen.getByTestId("card-edit-dialog")).toHaveAttribute("data-phase", "editing"),
      );
      expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "收起" }));
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    } finally {
      matchMedia.mockRestore();
    }
  });
});
