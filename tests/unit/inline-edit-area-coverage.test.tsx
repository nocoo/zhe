// @vitest-environment happy-dom

import { Dialog, DialogContent } from "@nocoo/basalt/components/dialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Dispatch, SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateXMediaDimensionsAction } from "@/actions/connector";
import { normalizeXPost } from "@/cli/src/connector/core";
import { InlineEditArea } from "@/components/dashboard/link-card-parts/inline-edit-area";
import { XBookmarksContext, XBookmarksUpdateContext } from "@/contexts/x-bookmarks";
import type { XBookmark } from "@/lib/connector/jobs";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";

vi.mock("@/actions/connector", () => ({
  updateXMediaDimensionsAction: vi.fn(),
}));

const mockSaveEdit = vi.fn();
const mockSetEditUrl = vi.fn();
const mockSetEditSlug = vi.fn();
const mockSetEditTitle = vi.fn();
const mockSetEditNote = vi.fn();
const mockSetEditFolderId = vi.fn();
const mockSetEditScreenshotUrl = vi.fn();
const mockAddTag = vi.fn();
const mockRemoveTag = vi.fn();
const mockCreateAndAssignTag = vi.fn();

vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useInlineLinkEditViewModel: () => ({
    editUrl: "https://initial.com",
    setEditUrl: mockSetEditUrl,
    editSlug: "initial-slug",
    setEditSlug: mockSetEditSlug,
    editTitle: "Initial Title",
    setEditTitle: mockSetEditTitle,
    editNote: "Initial note",
    setEditNote: mockSetEditNote,
    editFolderId: "f1",
    setEditFolderId: mockSetEditFolderId,
    editScreenshotUrl: "https://initial.com/shot.png",
    setEditScreenshotUrl: mockSetEditScreenshotUrl,
    assignedTags: [
      { id: "tag-1", name: "dev", color: "#111111", userId: "u", createdAt: new Date() },
    ],
    assignedTagIds: new Set(["tag-1"]),
    addTag: mockAddTag,
    removeTag: mockRemoveTag,
    createAndAssignTag: mockCreateAndAssignTag,
    saveEdit: mockSaveEdit,
    isSaving: false,
    error: "",
  }),
}));

const baseLink: Link = {
  id: 10,
  userId: "user-1",
  originalUrl: "https://x.com/user/status/123",
  slug: "initial-slug",
  title: "Initial Title",
  note: "Initial note",
  folderId: "f1",
  screenshotUrl: "https://initial.com/shot.png",
  isHidden: false,
  isCustom: false,
  clicks: 0,
  createdAt: new Date(),
  expiresAt: null,
  metaTitle: null,
  metaDescription: null,
  metaFavicon: null,
};

const sampleFolders: Folder[] = [
  { id: "f1", userId: "user-1", name: "Folder 1", icon: "folder", createdAt: new Date() },
  { id: "f2", userId: "user-1", name: "Folder 2", icon: "folder", createdAt: new Date() },
];

const sampleTags: Tag[] = [
  { id: "tag-1", userId: "user-1", name: "dev", color: "#111111", createdAt: new Date() },
  { id: "tag-2", userId: "user-1", name: "design", color: "#222222", createdAt: new Date() },
];

const sampleLinkTags: LinkTag[] = [{ linkId: 10, tagId: "tag-1" }];

const mockEditCallbacks: EditLinkCallbacks = {
  onLinkUpdated: vi.fn(),
  onTagCreated: vi.fn(),
  onLinkTagAdded: vi.fn(),
  onLinkTagRemoved: vi.fn(),
};

function fakeTweet(
  media: Array<{ id: string; type: "PHOTO" | "VIDEO"; url: string; width: number; height: number }>,
) {
  const normalized = normalizeXPost(
    {
      rest_id: "123",
      legacy: {
        full_text: "hello",
        created_at: "2026-09-12T00:00:00Z",
      },
      core: {
        user_results: {
          result: {
            rest_id: "1",
            legacy: { screen_name: "user", name: "User" },
            is_blue_verified: false,
          },
        },
      },
    },
    "123",
  )?.tweet;
  if (!normalized) throw new Error("failed to normalize");
  return {
    ...normalized,
    media,
  };
}

describe("InlineEditArea", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveEdit.mockResolvedValue(true);
    vi.mocked(updateXMediaDimensionsAction).mockResolvedValue({ success: true, updatedAt: 1000 });
  });

  function renderArea(
    options: {
      bookmark?: XBookmark;
      onCloseEdit?: () => void;
      onSaved?: (() => void) | undefined;
      handleDelete?: () => void;
      setBookmarks?: Dispatch<SetStateAction<Map<number, XBookmark>>>;
    } = {},
  ) {
    const bookmarksMap = new Map<number, XBookmark>();
    if (options.bookmark) {
      bookmarksMap.set(baseLink.id, options.bookmark);
    }
    const setBookmarks =
      options.setBookmarks ??
      (vi.fn() as unknown as Dispatch<SetStateAction<Map<number, XBookmark>>>);

    const onSavedProps = options.onSaved ? { onSaved: options.onSaved } : {};

    return render(
      <Dialog open>
        <DialogContent>
          <XBookmarksContext.Provider value={bookmarksMap}>
            <XBookmarksUpdateContext.Provider value={setBookmarks}>
              <InlineEditArea
                link={baseLink}
                tags={sampleTags}
                linkTags={sampleLinkTags}
                folders={sampleFolders}
                editCallbacks={mockEditCallbacks}
                isDeleting={false}
                handleDelete={options.handleDelete ?? vi.fn()}
                onCloseEdit={options.onCloseEdit ?? vi.fn()}
                {...onSavedProps}
              />
            </XBookmarksUpdateContext.Provider>
          </XBookmarksContext.Provider>
        </DialogContent>
      </Dialog>,
    );
  }

  it("modifies text fields and calls ViewModel setters", async () => {
    const user = userEvent.setup();
    renderArea();

    const urlInput = screen.getByPlaceholderText("https://example.com");
    await user.type(urlInput, "a");
    expect(mockSetEditUrl).toHaveBeenCalled();

    const slugInput = screen.getByPlaceholderText("custom-slug");
    await user.type(slugInput, "b");
    expect(mockSetEditSlug).toHaveBeenCalled();

    const titleInput = screen.getByPlaceholderText("标题（可选）");
    await user.type(titleInput, "c");
    expect(mockSetEditTitle).toHaveBeenCalled();

    const noteInput = screen.getByPlaceholderText("添加备注...");
    await user.type(noteInput, "d");
    expect(mockSetEditNote).toHaveBeenCalled();

    const shotInput = screen.getByPlaceholderText("https://example.com/screenshot.png");
    await user.type(shotInput, "e");
    expect(mockSetEditScreenshotUrl).toHaveBeenCalled();
  });

  it("selects folders including unclassified __inbox__ option", async () => {
    const user = userEvent.setup();
    renderArea();

    const folderTrigger = screen.getByRole("combobox");
    await user.click(folderTrigger);
    await user.click(screen.getByRole("option", { name: "未分类" }));
    expect(mockSetEditFolderId).toHaveBeenCalledWith(null);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Folder 2" }));
    expect(mockSetEditFolderId).toHaveBeenCalledWith("f2");
  });

  it("validates invalid media ratio inputs without saving", async () => {
    const bookmarkWithMedia: XBookmark = {
      linkId: 10,
      state: "complete",
      updatedAt: 500,
      errorCode: null,
      tweet: fakeTweet([
        { id: "m1", type: "VIDEO", url: "https://x.com/v.mp4", width: 16, height: 9 },
      ]),
    };

    renderArea({ bookmark: bookmarkWithMedia });
    const ratioInput = screen.getByPlaceholderText("16:9");
    fireEvent.change(ratioInput, { target: { value: "invalid" } });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "请输入有效的宽高比，如 16:9 或 9:16",
    );
    expect(mockSaveEdit).not.toHaveBeenCalled();
  });

  it("saves valid media ratio and updates bookmark context", async () => {
    const bookmarkWithMedia: XBookmark = {
      linkId: 10,
      state: "complete",
      updatedAt: 500,
      errorCode: null,
      tweet: fakeTweet([
        { id: "m1", type: "PHOTO", url: "https://x.com/p.jpg", width: 16, height: 9 },
      ]),
    };

    let updaterFn: ((current: Map<number, XBookmark>) => Map<number, XBookmark>) | null = null;
    const mockSetBookmarks = vi.fn((fn) => {
      updaterFn = fn;
    });
    const onSaved = vi.fn();

    renderArea({
      bookmark: bookmarkWithMedia,
      onSaved,
      setBookmarks: mockSetBookmarks,
    });

    const ratioInput = screen.getByPlaceholderText("16:9");
    fireEvent.change(ratioInput, { target: { value: "4:3" } });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockSaveEdit).toHaveBeenCalled();
      expect(updateXMediaDimensionsAction).toHaveBeenCalledWith(10, [
        { id: "m1", width: 4, height: 3 },
      ]);
      expect(onSaved).toHaveBeenCalled();
    });

    if (!updaterFn) throw new Error("expected updater function");
    const map = new Map([[10, bookmarkWithMedia]]);
    const nextMap = (updaterFn as (current: Map<number, XBookmark>) => Map<number, XBookmark>)(map);
    const updated = nextMap.get(10);
    expect(updated?.updatedAt).toBe(1000);
    expect(updated?.tweet?.media[0]?.width).toBe(4);
    expect(updated?.tweet?.media[0]?.height).toBe(3);
  });

  it("handles media dimension save server failure", async () => {
    const bookmarkWithMedia: XBookmark = {
      linkId: 10,
      state: "complete",
      updatedAt: 500,
      errorCode: null,
      tweet: fakeTweet([
        { id: "m1", type: "PHOTO", url: "https://x.com/p.jpg", width: 16, height: 9 },
      ]),
    };

    vi.mocked(updateXMediaDimensionsAction).mockResolvedValueOnce({ success: false });

    renderArea({ bookmark: bookmarkWithMedia });
    const ratioInput = screen.getByPlaceholderText("16:9");
    fireEvent.change(ratioInput, { target: { value: "1:1" } });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("媒体比例未保存，请稍后重试");
  });

  it("handles exception thrown during save", async () => {
    mockSaveEdit.mockRejectedValueOnce(new Error("network error"));
    renderArea();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试");
  });

  it("calls onCloseEdit when cancel button clicked", () => {
    const onClose = vi.fn();
    renderArea({ onCloseEdit: onClose });
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
