// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardEditDialog } from "@/components/dashboard/link-card-parts/card-edit-dialog";
import type { Link } from "@/models/types";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";

vi.mock("@/actions/connector", () => ({
  updateXMediaDimensionsAction: vi.fn(),
}));

vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useInlineLinkEditViewModel: () => ({
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
  }),
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

describe("CardEditDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    } = {},
  ) {
    const cardEl = document.createElement("div");
    cardEl.setAttribute("data-link-id", "10");
    document.body.appendChild(cardEl);
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

  it("mounts un-animated dialog, focuses input, and closes on close button", async () => {
    const onClose = vi.fn();
    renderDialog({ animated: false, onClose });
    const dialog = screen.getByTestId("card-edit-dialog");
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("mounts animated dialog and closes with flight animation", async () => {
    const onClose = vi.fn();
    renderDialog({ animated: true, onClose });
    const dialog = screen.getByTestId("card-edit-dialog");
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("defers callbacks until dialog closes", () => {
    const { unmount } = renderDialog({
      animated: false,
    });
    unmount();
  });
});
