// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardEditDialog } from "@/components/dashboard/link-card-parts/card-edit-dialog";
import type { Link, LinkTag, Tag } from "@/models/types";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";

vi.mock("@/actions/connector", () => ({
  updateXMediaDimensionsAction: vi.fn(),
}));

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
      error: "",
    };
  },
}));

const baseLink: Link = {
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

const domCleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of domCleanups.splice(0)) cleanup();
});

describe("CardEditDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeCallbacks = undefined;
    vi.spyOn(HTMLElement.prototype, "animate").mockReturnValue({
      finished: Promise.resolve(),
      cancel: vi.fn(),
    } as unknown as Animation);
  });

  function renderDialog(
    options: {
      animated?: boolean;
      deleted?: boolean;
      onClose?: () => void;
      onDeleted?: () => void;
      customCallbacks?: Partial<EditLinkCallbacks>;
    } = {},
  ) {
    const cardEl = document.createElement("div");
    cardEl.setAttribute("data-link-id", "10");
    cardEl.style.width = "300px";
    cardEl.style.height = "200px";
    document.body.appendChild(cardEl);
    domCleanups.push(() => cardEl.remove());

    const triggerEl = document.createElement("button");
    triggerEl.setAttribute("aria-label", "Edit link");
    cardEl.appendChild(triggerEl);

    const sourceRef = { current: cardEl };
    const triggerRef = { current: triggerEl };

    const editCallbacks: EditLinkCallbacks = {
      onLinkUpdated: vi.fn(),
      onTagCreated: vi.fn(),
      onLinkTagAdded: vi.fn(),
      onLinkTagRemoved: vi.fn(),
      ...options.customCallbacks,
    };

    const result = render(
      <CardEditDialog
        source={sourceRef}
        trigger={triggerRef}
        animated={options.animated ?? false}
        deleted={options.deleted ?? false}
        onClose={options.onClose ?? vi.fn()}
        onDeleted={options.onDeleted ?? vi.fn()}
        link={baseLink}
        tags={[]}
        linkTags={[]}
        folders={[]}
        editCallbacks={editCallbacks}
        isDeleting={false}
        handleDelete={vi.fn()}
      />,
    );

    return { ...result, cardEl, triggerEl, editCallbacks };
  }

  it("mounts un-animated dialog, auto-focuses input, and closes on button", async () => {
    const onClose = vi.fn();
    renderDialog({ animated: false, onClose });
    const dialog = screen.getByTestId("card-edit-dialog");
    expect(dialog).toBeInTheDocument();

    await waitFor(() => {
      const input = dialog.querySelector("input");
      expect(document.activeElement).toBe(input);
    });

    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("mounts animated dialog with element animation and closes with flight", async () => {
    const onClose = vi.fn();
    const animateSpy = vi.spyOn(HTMLElement.prototype, "animate");
    renderDialog({ animated: true, onClose });
    const dialog = screen.getByTestId("card-edit-dialog");
    expect(dialog).toBeInTheDocument();

    await waitFor(() => {
      expect(animateSpy).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("defers callbacks during editing and flushes them when dialog closes", async () => {
    const onLinkUpdated = vi.fn();
    const onTagCreated = vi.fn();
    const onClose = vi.fn();

    renderDialog({
      animated: false,
      onClose,
      customCallbacks: { onLinkUpdated, onTagCreated },
    });

    expect(activeCallbacks).toBeDefined();

    const tag: Tag = {
      id: "t-new",
      userId: "user-1",
      name: "new tag",
      color: "#333",
      createdAt: new Date(),
    };

    activeCallbacks?.onLinkUpdated(baseLink);
    activeCallbacks?.onTagCreated(tag);
    activeCallbacks?.onLinkTagAdded({ linkId: 10, tagId: "t-new" });
    activeCallbacks?.onLinkTagRemoved(10, "t-new");

    // Callbacks must NOT fire while dialog is open (deferred)
    expect(onLinkUpdated).not.toHaveBeenCalled();
    expect(onTagCreated).not.toHaveBeenCalled();

    // Close the dialog -> deferred callbacks flush
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() => {
      expect(onLinkUpdated).toHaveBeenCalledWith(baseLink);
      expect(onTagCreated).toHaveBeenCalledWith(tag);
      expect(onClose).toHaveBeenCalled();
    });

    // Callbacks after dialog was closed flush immediately
    activeCallbacks?.onLinkUpdated(baseLink);
    expect(onLinkUpdated).toHaveBeenCalledTimes(2);
    activeCallbacks?.onTagCreated(tag);
    expect(onTagCreated).toHaveBeenCalledTimes(2);
    activeCallbacks?.onLinkTagAdded({ linkId: 10, tagId: "t-new" });
    activeCallbacks?.onLinkTagRemoved(10, "t-new");
  });

  it("prevents close when editProps.isDeleting or panel is aria-busy", async () => {
    const onClose = vi.fn();
    const cardEl = document.createElement("div");
    cardEl.setAttribute("data-link-id", "10");
    document.body.appendChild(cardEl);
    domCleanups.push(() => cardEl.remove());

    const { rerender } = render(
      <CardEditDialog
        source={{ current: cardEl }}
        trigger={{ current: null }}
        animated={false}
        deleted={false}
        onClose={onClose}
        onDeleted={vi.fn()}
        link={baseLink}
        tags={[]}
        linkTags={[]}
        folders={[]}
        editCallbacks={{
          onLinkUpdated: vi.fn(),
          onTagCreated: vi.fn(),
          onLinkTagAdded: vi.fn(),
          onLinkTagRemoved: vi.fn(),
        }}
        isDeleting={true}
        handleDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(onClose).not.toHaveBeenCalled();

    // Now busy element inside panel
    rerender(
      <CardEditDialog
        source={{ current: cardEl }}
        trigger={{ current: null }}
        animated={false}
        deleted={false}
        onClose={onClose}
        onDeleted={vi.fn()}
        link={baseLink}
        tags={[]}
        linkTags={[]}
        folders={[]}
        editCallbacks={{
          onLinkUpdated: vi.fn(),
          onTagCreated: vi.fn(),
          onLinkTagAdded: vi.fn(),
          onLinkTagRemoved: vi.fn(),
        }}
        isDeleting={false}
        handleDelete={vi.fn()}
      />,
    );

    const dialog = screen.getByTestId("card-edit-dialog");
    const busyChild = document.createElement("div");
    busyChild.setAttribute("aria-busy", "true");
    dialog.appendChild(busyChild);

    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handles deleted prop triggering card destruction transition and onDeleted callback", async () => {
    const onDeleted = vi.fn();
    const { rerender, cardEl } = renderDialog({ animated: false, onDeleted, deleted: false });

    rerender(
      <CardEditDialog
        source={{ current: cardEl }}
        trigger={{ current: null }}
        animated={false}
        deleted={true}
        onClose={vi.fn()}
        onDeleted={onDeleted}
        link={baseLink}
        tags={[]}
        linkTags={[]}
        folders={[]}
        editCallbacks={{
          onLinkUpdated: vi.fn(),
          onTagCreated: vi.fn(),
          onLinkTagAdded: vi.fn(),
          onLinkTagRemoved: vi.fn(),
        }}
        isDeleting={false}
        handleDelete={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
  });
});
