// @vitest-environment happy-dom
import "../helpers/card-width";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinkCard } from "@/components/dashboard/link-card";
import type { Link, Tag } from "@/models/types";
import { useInlineLinkEditViewModel } from "@/viewmodels/useLinksViewModel";
import { unwrap } from "../test-utils";

vi.mock("@/actions/connector", () => ({ retryXBookmarkAction: vi.fn() }));

const mockVm = {
  shortUrl: "https://zhe.to/abc123",
  copied: false,
  copiedOriginalUrl: false,
  isDeleting: false,
  isSavingVisibility: false,
  showAnalytics: false,
  analyticsStats: null,
  isLoadingAnalytics: false,
  handleCopy: vi.fn(),
  handleCopyOriginalUrl: vi.fn(),
  handleDelete: vi.fn(),
  handleToggleHidden: vi.fn(),
  handleToggleAnalytics: vi.fn(),
  screenshotUrl: null as string | null,
  faviconUrl: null as string | null,
  faviconError: false,
  handleFaviconError: vi.fn(),
};

const mockEditVm = {
  editUrl: "https://example.com/very-long-url",
  setEditUrl: vi.fn(),
  editSlug: "abc123",
  setEditSlug: vi.fn(),
  editFolderId: undefined as string | undefined,
  setEditFolderId: vi.fn(),
  editNote: "",
  setEditNote: vi.fn(),
  editTitle: "",
  setEditTitle: vi.fn(),
  editScreenshotUrl: "",
  setEditScreenshotUrl: vi.fn(),
  isSaving: false,
  isDeletingScreenshot: false,
  screenshotAction: null,
  error: "",
  assignedTagIds: new Set<string>(),
  assignedTags: [] as Tag[],
  saveEdit: vi.fn().mockResolvedValue(true),
  addTag: vi.fn(),
  removeTag: vi.fn(),
  createAndAssignTag: vi.fn(),
};

vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useLinkCardViewModel: () => mockVm,
  useInlineLinkEditViewModel: vi.fn(() => mockEditVm),
}));

const baseLink: Link = {
  id: 1,
  userId: "user-1",
  slug: "abc123",
  originalUrl: "https://example.com/very-long-url",
  isHidden: false,
  isCustom: false,
  clicks: 42,
  createdAt: new Date("2026-01-15"),
  expiresAt: null,
  folderId: null,
  title: null,
  metaTitle: null,
  metaDescription: "A description of the page",
  metaFavicon: null,
  screenshotUrl: null,
  note: null,
};

const editCallbacks = {
  onLinkUpdated: vi.fn(),
  onTagCreated: vi.fn(),
  onLinkTagAdded: vi.fn(),
  onLinkTagRemoved: vi.fn(),
};

function props(link = baseLink) {
  return {
    link,
    siteUrl: "https://zhe.to",
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    editCallbacks,
  };
}

describe("LinkCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, "animate").mockReturnValue({
      finished: Promise.resolve(),
      cancel: vi.fn(),
    } as unknown as Animation);
    Object.assign(mockVm, {
      shortUrl: "https://zhe.to/abc123",
      copied: false,
      copiedOriginalUrl: false,
      isDeleting: false,
      isSavingVisibility: false,
      showAnalytics: false,
      analyticsStats: null,
      isLoadingAnalytics: false,
      screenshotUrl: null,
      faviconUrl: null,
      faviconError: false,
    });
    Object.assign(mockEditVm, {
      isSaving: false,
      isDeletingScreenshot: false,
      screenshotAction: null,
      error: "",
      assignedTagIds: new Set(),
      assignedTags: [],
    });
    mockEditVm.saveEdit.mockResolvedValue(true);
  });

  it.each(["list", "grid"] as const)("renders the small %s link preview", (viewMode) => {
    render(<LinkCard {...props({ ...baseLink, metaTitle: "Example Page" })} viewMode={viewMode} />);
    expect(screen.getByRole("link", { name: "Example Page" })).toHaveAttribute(
      "href",
      baseLink.originalUrl,
    );
    expect(screen.getByRole("link", { name: "/abc123" })).toHaveAttribute(
      "href",
      "https://zhe.to/abc123",
    );
    expect(screen.getByRole("button", { name: "查看收藏内容" })).toHaveTextContent(
      "A description of the page",
    );
    expect(screen.queryByRole("button", { name: "AI 整理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制链接" })).toBeInTheDocument();
  });

  it("uses the source hostname when no title metadata exists", () => {
    render(<LinkCard {...props()} />);
    expect(screen.getAllByRole("link", { name: "example.com" })[0]).toHaveAttribute(
      "href",
      baseLink.originalUrl,
    );
  });

  it("keeps the unified actions on the shared card footer", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...props()} onSuggest={vi.fn()} />);
    expect(screen.getByRole("button", { name: "AI 整理" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "复制链接" }));
    expect(screen.getByRole("menuitem", { name: "复制原链接" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "复制短链接" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
    for (const label of ["修改收藏", "数据采集", "访问统计", "隐藏帖子", "删除收藏"])
      expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument();
  });

  it("opens and closes the editor from the unified menu while preserving the source card", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...props()} />);
    await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
    await user.click(screen.getByRole("menuitem", { name: "修改收藏" }));
    expect(await screen.findByRole("region", { name: "编辑收藏" })).toBeInTheDocument();
    expect(screen.getByTestId("link-card")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() => expect(screen.queryByTestId("edit-area")).not.toBeInTheDocument());
    expect(mockEditVm.saveEdit).not.toHaveBeenCalled();
  });

  it("retains deferred updates until the editor flight lands", async () => {
    render(<LinkCard {...props()} viewMode="grid" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
    await user.click(screen.getByRole("menuitem", { name: "修改收藏" }));
    await waitFor(() =>
      expect(screen.getByTestId("card-edit-dialog")).toHaveAttribute("data-phase", "editing"),
    );
    const callbacks = unwrap(vi.mocked(useInlineLinkEditViewModel).mock.lastCall)[3];
    const landing = Promise.withResolvers<Animation>();
    vi.mocked(HTMLElement.prototype.animate).mockReturnValue({
      finished: landing.promise,
      cancel: vi.fn(),
    } as unknown as Animation);
    const updated = { ...baseLink, folderId: "f1" };
    mockEditVm.saveEdit.mockImplementation(async () => {
      callbacks.onLinkUpdated(updated);
      return true;
    });
    callbacks.onLinkTagRemoved(baseLink.id, "t1");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(screen.getByTestId("card-edit-dialog")).toHaveAttribute("data-phase", "returning"),
    );
    expect(editCallbacks.onLinkUpdated).not.toHaveBeenCalled();
    expect(editCallbacks.onLinkTagRemoved).not.toHaveBeenCalled();
    await landing.resolve({} as Animation);
    await waitFor(() => expect(screen.queryByTestId("card-edit-dialog")).not.toBeInTheDocument());
    expect(editCallbacks.onLinkUpdated).toHaveBeenCalledWith(updated);
    expect(editCallbacks.onLinkTagRemoved).toHaveBeenCalledWith(baseLink.id, "t1");
  });

  it("keeps the edit form error visible when saving fails", async () => {
    mockEditVm.saveEdit.mockResolvedValue(false);
    mockEditVm.error = "无法保存链接";
    render(<LinkCard {...props()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
    await user.click(screen.getByRole("menuitem", { name: "修改收藏" }));
    await user.click(await screen.findByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("无法保存链接");
  });

  it("shows the bounded X feed preview and opens full details on demand", async () => {
    const link = {
      ...baseLink,
      originalUrl: "https://x.com/example/status/12345",
      note: "Saved note",
    };
    render(<LinkCard {...props(link)} viewMode="feed" />);
    expect(screen.getByTestId("x-bookmark-preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看帖子正文" })).toHaveTextContent("Saved note");
    expect(screen.queryByTestId("x-bookmark-content")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "查看帖子详情" }));
    expect(await screen.findByRole("dialog", { name: "X 帖子" })).toBeInTheDocument();
  });
});
