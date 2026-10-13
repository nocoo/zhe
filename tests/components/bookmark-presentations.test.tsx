// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { normalizeXPost } from "@/cli/src/connector/core";
import { BookmarkCardFooter } from "@/components/dashboard/bookmark-card-footer";
import { XBookmarkPreview } from "@/components/dashboard/x-bookmark-preview";
import type { XBookmark } from "@/lib/connector/jobs";
import { makeLink, makeTag } from "../fixtures";

vi.mock("@/actions/connector", () => ({ retryXBookmarkAction: vi.fn() }));
const link = makeLink({ originalUrl: "https://x.com/author/status/123", title: null, note: null });
const tweet = normalizeXPost(
  {
    rest_id: "123",
    legacy: { full_text: "Saved post", created_at: "2026-10-13T00:00:00Z" },
    core: {
      user_results: { result: { rest_id: "1", legacy: { name: "Author", screen_name: "author" } } },
    },
  },
  "123",
)?.tweet;
if (!tweet) throw new Error("Missing test tweet");
const bookmark: XBookmark = {
  linkId: link.id,
  tweet,
  state: "complete",
  errorCode: null,
  updatedAt: 1,
};

describe("bounded bookmark content", () => {
  it("keeps empty metadata and long tags in the same fixed footer slots", () => {
    const { rerender } = render(
      <BookmarkCardFooter
        link={link}
        folder="未分类"
        tags={[]}
        actions={[]}
        triggerRef={createRef()}
        compact
      />,
    );
    expect(screen.getByText("未分类")).toBeVisible();
    expect(screen.queryByRole("list", { name: "收藏标签" })).not.toBeInTheDocument();
    rerender(
      <BookmarkCardFooter
        link={link}
        folder="Long folder"
        tags={[makeTag({ name: "long-tag".repeat(40) })]}
        actions={[]}
        triggerRef={createRef()}
      />,
    );
    const tags = screen.getByRole("list", { name: "收藏标签" });
    expect(tags).toHaveTextContent("long-tag".repeat(40));
    expect(tags).toHaveClass("min-w-0", "overflow-x-auto");
    expect(screen.getByRole("listitem")).toHaveClass("shrink-0");
    expect(document.querySelector("[data-bookmark-classification]")).toHaveClass("h-10");
    expect(tags).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(tags, { key: "ArrowRight" });
    expect(tags.scrollLeft).toBe(40);
    fireEvent.keyDown(tags, { key: "ArrowLeft" });
    expect(tags.scrollLeft).toBe(0);
    expect(fireEvent.keyDown(tags, { key: "Tab" })).toBe(true);
    expect(tags.scrollLeft).toBe(0);
  });

  it("keeps pending posts readable and opens the reader without expanding the card", () => {
    const open = vi.fn();
    render(
      <XBookmarkPreview
        link={{ ...link, metaDescription: null }}
        bookmark={undefined}
        shortUrl="https://zhe.to/test"
        onOpenDetails={open}
        onPlayMedia={vi.fn()}
      />,
    );
    expect(screen.getByText("尚未补全")).toBeVisible();
    expect(screen.queryByText("查看全文")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看帖子正文" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it("presents text-only posts and saved notes within the content budget", () => {
    const { rerender } = render(
      <XBookmarkPreview
        link={link}
        bookmark={bookmark}
        shortUrl="https://zhe.to/test"
        onOpenDetails={vi.fn()}
        onPlayMedia={vi.fn()}
      />,
    );
    expect(screen.getByText("Saved post")).toHaveClass("line-clamp-6");
    expect(screen.getByText("Author")).toHaveAttribute("href", link.originalUrl);
    rerender(
      <XBookmarkPreview
        link={{ ...link, note: "My note", title: "My title" }}
        bookmark={bookmark}
        shortUrl="https://zhe.to/test"
        onOpenDetails={vi.fn()}
        onPlayMedia={vi.fn()}
      />,
    );
    expect(screen.getByText("My title")).toBeVisible();
    expect(screen.getByText("My note")).toBeVisible();
  });

  it.each(["PHOTO", "VIDEO", "GIF"] as const)(
    "keeps %s media inside the preview and delegates viewing",
    (type) => {
      const open = vi.fn();
      const play = vi.fn();
      const media = {
        id: "media",
        type,
        url: "https://example.com/media",
        thumbnail_url: "https://example.com/poster",
        width: 9,
        height: 16,
      };
      render(
        <XBookmarkPreview
          link={link}
          bookmark={{
            ...bookmark,
            tweet: { ...tweet, media: [media, { ...media, id: "second" }] },
          }}
          shortUrl="https://zhe.to/test"
          onOpenDetails={open}
          onPlayMedia={play}
        />,
      );
      expect(screen.getByText("2 个附件")).toBeVisible();
      const preview = screen.getByRole("button", {
        name: type === "PHOTO" ? "查看帖子图片" : "播放帖子视频",
      });
      expect(preview).toHaveClass("min-h-0", "flex-1");
      expect(document.querySelector("video")).not.toBeInTheDocument();
      fireEvent.click(preview);
      if (type === "PHOTO") expect(open).toHaveBeenCalledOnce();
      else expect(play).toHaveBeenCalledWith("media");
    },
  );

  it("keeps a posterless video accessible", () => {
    render(
      <XBookmarkPreview
        link={link}
        bookmark={{
          ...bookmark,
          tweet: { ...tweet, media: [{ id: "v", type: "VIDEO", url: "https://example.com/v" }] },
        }}
        shortUrl="https://zhe.to/test"
        onOpenDetails={vi.fn()}
        onPlayMedia={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "播放帖子视频" })).toBeVisible();
  });
});
