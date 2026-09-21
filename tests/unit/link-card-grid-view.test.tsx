// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/connector", () => ({ retryXBookmarkAction: vi.fn() }));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    return <img alt="" {...props} />;
  },
}));

import { normalizeXPost } from "@/cli/src/connector/core";
import { GridView } from "@/components/dashboard/link-card-parts/grid-view";
import type { XBookmark } from "@/lib/connector/jobs";
import type { Link, Tag } from "@/models/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const baseLink: Link = {
  id: 1,
  userId: "u1",
  slug: "test-slug",
  originalUrl: "https://example.com/test",
  title: "Test Link",
  note: null,
  folderId: null,
  metaTitle: "Meta Title",
  metaDescription: "Meta Description",
  metaFavicon: "https://example.com/favicon.ico",
  screenshotUrl: null,
  clicks: 42,
  createdAt: new Date(1700000000000),
  expiresAt: null,
  isCustom: false,
  isHidden: false,
};

function renderGridView(overrides: Partial<React.ComponentProps<typeof GridView>> = {}) {
  const defaultProps: React.ComponentProps<typeof GridView> = {
    link: baseLink,
    titleText: "Test Title",
    showFaviconImage: true,
    shortUrl: "https://zhe.to/test-slug",
    screenshotUrl: null,
    faviconUrl: null,
    cardTags: [],
    copied: false,
    copiedOriginalUrl: false,
    canDeleteScreenshot: false,
    isDeletingScreenshot: false,
    isRefreshingMetadata: false,
    onFaviconError: vi.fn(),
    onCopy: vi.fn(),
    onCopyOriginalUrl: vi.fn(),
    onDeleteScreenshot: vi.fn(),
    onToggleEdit: vi.fn(),
    onRefreshMetadata: vi.fn(),
  };

  return render(<GridView {...defaultProps} {...overrides} />);
}

describe("GridView", () => {
  it("renders basic link card with fallback image icon when no preview", () => {
    renderGridView();
    expect(screen.getByText("test-slug")).toBeInTheDocument();
    expect(screen.getByTestId("click-count")).toHaveTextContent("42");
  });

  it("handles opening original link via click and keyboard", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderGridView();

    const openBtn = screen.getByRole("button", { name: "打开链接 https://example.com/test" });
    fireEvent.click(openBtn);
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/test",
      "_blank",
      "noopener,noreferrer",
    );

    fireEvent.keyDown(openBtn, { key: "Enter" });
    expect(openSpy).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(openBtn, { key: " " });
    expect(openSpy).toHaveBeenCalledTimes(3);

    fireEvent.keyDown(openBtn, { key: "ArrowDown" });
    expect(openSpy).toHaveBeenCalledTimes(3);
  });

  it("renders screenshot when screenshotUrl is provided", () => {
    renderGridView({ screenshotUrl: "https://example.com/shot.png" });
    const img = screen.getByAltText("Screenshot");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/shot.png");
  });

  it("renders favicon when faviconUrl is provided and no screenshot", () => {
    renderGridView({ faviconUrl: "https://example.com/favicon.png" });
    const fav = screen.getByAltText("Site favicon");
    expect(fav).toBeInTheDocument();
  });

  it("handles canDeleteScreenshot and deleting state", () => {
    const onDelete = vi.fn();
    const { rerender } = renderGridView({
      screenshotUrl: "https://example.com/shot.png",
      canDeleteScreenshot: true,
      onDeleteScreenshot: onDelete,
    });

    const delBtn = screen.getByRole("button", { name: "删除截图" });
    expect(delBtn).toBeInTheDocument();
    fireEvent.click(delBtn);
    expect(onDelete).toHaveBeenCalled();

    // Rerender as deleting
    rerender(
      <GridView
        link={baseLink}
        titleText="Test Title"
        showFaviconImage={true}
        shortUrl="https://zhe.to/test-slug"
        screenshotUrl="https://example.com/shot.png"
        faviconUrl={null}
        cardTags={[]}
        copied={false}
        copiedOriginalUrl={false}
        canDeleteScreenshot={true}
        isDeletingScreenshot={true}
        isRefreshingMetadata={false}
        onFaviconError={vi.fn()}
        onCopy={vi.fn()}
        onCopyOriginalUrl={vi.fn()}
        onDeleteScreenshot={onDelete}
        onToggleEdit={vi.fn()}
        onRefreshMetadata={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "删除截图" })).toBeDisabled();
  });

  it("handles onSuggest and suggestDisabled state", () => {
    const onSuggest = vi.fn();
    renderGridView({
      onSuggest,
      suggestDisabled: false,
    });

    const aiBtn = screen.getByRole("button", { name: "AI 整理" });
    expect(aiBtn).toBeInTheDocument();
    expect(aiBtn).not.toBeDisabled();
    fireEvent.click(aiBtn);
    expect(onSuggest).toHaveBeenCalled();
  });

  it("handles onToggleEdit click", () => {
    const onToggleEdit = vi.fn();
    renderGridView({ onToggleEdit });

    const editBtn = screen.getByRole("button", { name: "Edit link" });
    fireEvent.click(editBtn);
    expect(onToggleEdit).toHaveBeenCalled();
  });

  it("handles X bookmark details, media preview, badges and attachments count", () => {
    const onOpenDetails = vi.fn();
    const rawTweet = normalizeXPost(
      {
        rest_id: "123",
        legacy: {
          full_text: "Tweet with video",
          created_at: "2026-09-12T00:00:00Z",
          entities: { urls: [] },
          extended_entities: {
            media: [
              {
                id_str: "1001",
                type: "video",
                media_url_https: "https://pbs.twimg.com/tweet_video_thumb/thumb.jpg",
                video_info: {
                  aspect_ratio: [16, 9],
                  variants: [
                    {
                      content_type: "video/mp4",
                      url: "https://video.twimg.com/tweet_video/test.mp4",
                    },
                  ],
                },
              },
              {
                id_str: "1002",
                type: "photo",
                media_url_https: "https://pbs.twimg.com/media/test.jpg",
              },
            ],
          },
        },
        core: {
          user_results: {
            result: {
              rest_id: "u1",
              legacy: { screen_name: "testuser", name: "Test User" },
            },
          },
        },
      },
      "123",
    )?.tweet;
    if (!rawTweet) throw new Error("Expected valid normalized tweet");

    const xBookmark: XBookmark = {
      linkId: 1,
      state: "complete",
      tweet: rawTweet,
      errorCode: null,
      updatedAt: Date.now(),
    };

    renderGridView({
      onOpenDetails,
      xBookmark,
    });

    // Open button has specific X label
    const openBtn = screen.getByRole("button", { name: "查看 X 帖子" });
    fireEvent.click(openBtn);
    expect(onOpenDetails).toHaveBeenCalled();

    // Attachments badge
    expect(screen.getByText("2 个附件")).toBeInTheDocument();
  });

  it("renders card tags and copy buttons", () => {
    const onCopy = vi.fn();
    const cardTags: Tag[] = [
      { id: "t1", name: "AI", color: "#111", userId: "u1", createdAt: new Date() },
      { id: "t2", name: "Dev", color: "#222", userId: "u1", createdAt: new Date() },
    ];

    renderGridView({
      cardTags,
      copied: true,
      onCopy,
    });

    // Both tags in aria-label
    expect(screen.getByLabelText("标签：AI、Dev")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: "Copy link" });
    fireEvent.click(copyBtn);
    expect(onCopy).toHaveBeenCalled();
  });
});
