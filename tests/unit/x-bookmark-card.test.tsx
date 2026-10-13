// @vitest-environment happy-dom
import { LayerCard } from "@nocoo/basalt";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeXPost } from "@/cli/src/connector/core";
import { LinkCard } from "@/components/dashboard/link-card";
import { XBookmarkContent } from "@/components/dashboard/x-bookmark-content";
import { XBookmarksContext } from "@/contexts/x-bookmarks";
import type { XBookmark } from "@/lib/connector/jobs";
import type { Link } from "@/models/types";

vi.mock("@/actions/connector", () => ({ updateXMediaDimensionsAction: vi.fn() }));
vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useLinkCardViewModel: () => ({
    shortUrl: "https://zhe.to/test",
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
    screenshotUrl: null,
    faviconUrl: null,
    faviconError: false,
    handleFaviconError: vi.fn(),
  }),
  useInlineLinkEditViewModel: vi.fn(),
}));
const tweet = normalizeXPost(
  {
    rest_id: "12345",
    legacy: {
      full_text: "Saved content <script> is plain text. ".repeat(50),
      created_at: "2026-09-12T00:00:00Z",
      favorite_count: 7,
    },
    core: {
      user_results: {
        result: {
          rest_id: "1",
          legacy: { screen_name: "example", name: "Example Author" },
          is_blue_verified: true,
        },
      },
    },
  },
  "12345",
)?.tweet;
if (!tweet) throw new Error("Invalid synthetic tweet");
const bookmark: XBookmark = {
  linkId: 1,
  state: "complete",
  tweet,
  errorCode: null,
  updatedAt: Date.now(),
};
const link: Link = {
  id: 1,
  userId: "owner",
  originalUrl: "https://x.com/example/status/12345",
  slug: "test",
  isHidden: false,
  isCustom: false,
  clicks: 0,
  createdAt: new Date(),
  expiresAt: null,
  folderId: null,
  note: "Keep this saved note after enrichment",
  screenshotUrl: null,
  title: null,
  metaTitle: null,
  metaDescription: null,
  metaFavicon: null,
};
beforeEach(() => {
  vi.clearAllMocks();
});

describe("X bookmark presentation", () => {
  it("shows archived resolution and decimal file size below the video", () => {
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              media: [
                {
                  id: "123",
                  type: "VIDEO",
                  url: "https://cdn.example.com/video.mp4",
                  width: 9,
                  height: 16,
                  resolution: "720p",
                  size: 32088091,
                },
              ],
            },
          }}
          compact
        />
      </LayerCard>,
    );
    const info = screen.getByTestId("x-video-archive-info");
    expect(info).toHaveTextContent("已归档720p32.1 MB");
    expect(info.previousElementSibling).toHaveAttribute("data-testid", "x-media-grid");
  });
  it("shows all rejected versions and the size limit directly on a compact card", () => {
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            state: "partial",
            mediaErrors: [
              {
                mediaId: "123",
                type: "VIDEO",
                code: "media_too_large",
                attempts: [
                  { width: 3840, height: 2160, size: 564200241 },
                  { width: 1920, height: 1080, size: 120845059 },
                  { width: 1280, height: 720, size: 100000001 },
                ],
              },
            ],
          }}
          compact
        />
      </LayerCard>,
    );
    expect(screen.getByTestId("x-video-archive-info")).toHaveTextContent(
      "视频未归档：4K 564.2 MB、1080p 120.8 MB、720p 100 MB，均超过 100 MB 上限。",
    );
  });
  it("uses the saved headline for a standalone article without repeating raw URLs", () => {
    const url = "https://x.com/i/article/2037129045423341568";
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              text: "https://t.co/KW3rQbdBJT",
              entities: { ...tweet.entities, urls: [url] },
            },
          }}
          note="I want to build an AI agent today"
          originalTitle="Example Author (@example)"
        />
      </LayerCard>,
    );
    const preview = screen.getByTestId("x-link-preview");
    expect(preview).toHaveAttribute("href", url);
    expect(preview).not.toHaveTextContent("I want to build an AI agent today");
    expect(screen.getByText("I want to build an AI agent today").closest("details")).toHaveClass(
      "bg-primary/5",
    );
    expect(preview).toHaveTextContent("阅读全文");
    expect(screen.queryByText("https://t.co/KW3rQbdBJT")).not.toBeInTheDocument();
    expect(screen.queryByText(url)).not.toBeInTheDocument();
  });
  it.each([
    ["Example Author (@example)", "阅读 X 文章"],
    ["  Example Author (@example)  ", "阅读 X 文章"],
    ["  A saved article headline  ", "A saved article headline"],
  ])("uses article metadata without mistaking %s for a headline", (title, expected) => {
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              text: "https://t.co/article",
              entities: { ...tweet.entities, urls: ["https://x.com/i/article/12345"] },
            },
          }}
          originalTitle={title}
          note="  "
        />
      </LayerCard>,
    );
    const preview = screen.getByTestId("x-link-preview");
    expect(preview).toHaveTextContent(expected);
    expect(preview).not.toHaveTextContent("Example Author (@example)");
  });
  it.each(["grid", "list", "feed"] as const)(
    "keeps %s compact after enrichment and opens the full post on demand",
    async (viewMode) => {
      const card = (
        <LinkCard
          link={link}
          siteUrl="https://zhe.to"
          onDelete={vi.fn()}
          onUpdate={vi.fn()}
          editCallbacks={{
            onLinkUpdated: vi.fn(),
            onTagCreated: vi.fn(),
            onLinkTagAdded: vi.fn(),
            onLinkTagRemoved: vi.fn(),
          }}
          onSuggest={vi.fn()}
          viewMode={viewMode}
        />
      );
      const { rerender } = render(
        <XBookmarksContext.Provider value={new Map()}>{card}</XBookmarksContext.Provider>,
      );
      if (viewMode === "feed")
        expect(screen.getByRole("button", { name: "查看帖子正文" })).toHaveTextContent(
          "Keep this saved note after enrichment",
        );
      rerender(
        <XBookmarksContext.Provider value={new Map([[1, bookmark]])}>
          {card}
        </XBookmarksContext.Provider>,
      );
      expect(screen.queryByTestId("x-bookmark-content")).not.toBeInTheDocument();
      expect(
        screen.getByTestId(viewMode === "feed" ? "x-bookmark-preview" : "link-card"),
      ).toBeInTheDocument();
      expect(screen.queryByText("喜欢 7")).not.toBeInTheDocument();
      expect(screen.queryByText("已补全", { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByText("阅读帖子")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "展开全文" })).not.toBeInTheDocument();
      const user = userEvent.setup();
      if (viewMode === "feed") {
        await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
        expect(screen.getByRole("menuitem", { name: "修改收藏" })).toBeInTheDocument();
        await user.keyboard("{Escape}");
        await user.click(screen.getByRole("button", { name: "复制链接" }));
        expect(screen.getByRole("menuitem", { name: "复制短链接" })).toBeInTheDocument();
        await user.keyboard("{Escape}");
      } else {
        await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
        expect(screen.getByRole("menuitem", { name: "修改收藏" })).toBeInTheDocument();
        await user.keyboard("{Escape}");
      }
      if (viewMode === "feed")
        expect(screen.getByRole("button", { name: "查看帖子正文" })).toHaveTextContent(
          "Keep this saved note after enrichment",
        );
      const toolbar = within(document.querySelector("[data-bookmark-actions]") as HTMLElement);
      expect(
        toolbar.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
      ).toEqual(
        viewMode === "feed"
          ? ["查看 X 全文", "AI 整理", "复制链接", "更多收藏操作"]
          : ["AI 整理", "复制链接", "更多收藏操作"],
      );
      const trigger = screen.getByRole("button", {
        name: viewMode === "feed" ? "查看 X 全文" : "查看帖子详情",
      });
      if (viewMode === "feed") expect(trigger).toHaveAccessibleDescription("已补全");
      await user.click(trigger);
      const dialog = await screen.findByRole("dialog", { name: "X 帖子" });
      expect(within(dialog).getByTestId("x-bookmark-content")).toBeInTheDocument();
      expect(within(dialog).getByText("喜欢 7")).toBeInTheDocument();
      expect(within(dialog).getByRole("link", { name: "Example Author" })).toHaveAttribute(
        "href",
        "https://x.com/example",
      );
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "X 帖子" })).not.toBeInTheDocument(),
      );
      expect(trigger).toHaveFocus();
    },
  );
  it("shows author, real date, metrics and expandable escaped text", () => {
    const { container } = render(
      <LayerCard>
        <XBookmarkContent bookmark={bookmark} />
      </LayerCard>,
    );
    expect(screen.getByRole("link", { name: "Example Author" })).toHaveAttribute(
      "href",
      "https://x.com/example",
    );
    expect(container.querySelector("time")).toHaveAttribute("dateTime", "2026-09-12T00:00:00.000Z");
    expect(screen.getByText("喜欢 7")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "展开全文" }));
    expect(screen.getByRole("button", { name: "收起全文" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
  it.each(["一\n二\n三\n四\n五\n六\n末行", "移动端短帖子内容。".repeat(30)])(
    "never clips text when there is no expansion control: %s",
    (text) => {
      render(
        <LayerCard>
          <XBookmarkContent bookmark={{ ...bookmark, tweet: { ...tweet, text } }} />
        </LayerCard>,
      );
      expect(screen.queryByRole("button", { name: "展开全文" })).not.toBeInTheDocument();
      const paragraph = screen
        .getByTestId("x-bookmark-content")
        .querySelector("p.whitespace-pre-wrap");
      expect(paragraph?.textContent).toBe(text);
      expect(paragraph).not.toHaveClass("line-clamp-6");
    },
  );
  it.each(["VIDEO"] as const)(
    "loads an archived %s only after clicking its poster and opens photos with the public dialog",
    async (type) => {
      const data = {
        ...bookmark,
        tweet: {
          ...tweet,
          media: [
            {
              id: "v",
              type,
              url: "https://cdn.example.com/video.mp4",
              thumbnail_url: "https://cdn.example.com/poster.jpg",
              width: 720,
              height: 1280,
            },
            { id: "p", type: "PHOTO" as const, url: "https://cdn.example.com/photo.jpg" },
          ],
        },
      };
      const { container } = render(
        <LayerCard>
          <XBookmarkContent bookmark={data} />
        </LayerCard>,
      );
      expect(container.querySelector("video")).toBeNull();
      const preview = screen.getByRole("button", {
        name: "播放视频 1",
      });
      expect(preview.querySelector("img")).toHaveAttribute(
        "src",
        "https://cdn.example.com/poster.jpg",
      );
      const label = "视频";
      expect(within(preview).getByTestId("x-media-type-badge")).toHaveTextContent(label);
      expect(within(preview).getByTestId("x-media-type-badge")).toHaveClass("top-3", "left-3");
      fireEvent.click(preview);
      expect(screen.getByTestId("x-media-type-badge")).toHaveTextContent(label);
      expect(container.querySelector("video")?.loop).toBe(false);
      expect(container.querySelector("video")?.muted).toBe(false);
      expect(container.querySelector("video")).toHaveAttribute("controls");
      expect(container.querySelector("video")).toHaveAttribute("autoplay");
      expect(container.querySelector("video")).toHaveAttribute("preload", "none");
      expect(container.querySelector("video")).toHaveAttribute(
        "src",
        "https://cdn.example.com/video.mp4",
      );
      fireEvent.click(screen.getByRole("button", { name: "查看图片 2" }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "图片预览" })).toBeInTheDocument();
    },
  );
  it("autoplays visible GIFs, pauses hidden ones, and does not fetch offscreen files", async () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let notify: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    try {
      const { container, unmount } = render(
        <LayerCard>
          <XBookmarkContent
            compact
            bookmark={{
              ...bookmark,
              tweet: {
                ...tweet,
                media: [
                  {
                    id: "gif",
                    type: "GIF",
                    url: "https://cdn.example.com/animated.mp4",
                    thumbnail_url: "https://cdn.example.com/poster.jpg",
                    size: 254000,
                  },
                ],
              },
            }}
          />
        </LayerCard>,
      );
      const video = container.querySelector("video");
      expect(video).not.toHaveAttribute("src");
      expect(observe).toHaveBeenCalledWith(video);
      expect(screen.getByTestId("x-media-type-badge")).toHaveTextContent("GIF");
      expect(screen.getByTestId("x-video-archive-info")).toHaveTextContent("254 KB");
      const intersect = (isIntersecting: boolean) =>
        notify([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
      intersect(true);
      expect(video).toHaveAttribute("src", "https://cdn.example.com/animated.mp4");
      expect(video?.muted).toBe(true);
      expect(video?.loop).toBe(true);
      expect(play).toHaveBeenCalledOnce();
      intersect(false);
      expect(pause).toHaveBeenCalledOnce();
      visibility.mockReturnValue("hidden");
      intersect(true);
      expect(play).toHaveBeenCalledOnce();
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(play).toHaveBeenCalledTimes(2);
      unmount();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      play.mockRestore();
      pause.mockRestore();
      visibility.mockRestore();
    }
  });
  it("keeps feed videos as posters and plays only in the detail dialog", async () => {
    const data: XBookmark = {
      ...bookmark,
      tweet: {
        ...tweet,
        media: [
          {
            id: "video",
            type: "VIDEO",
            url: "https://cdn.example.com/video.mp4",
            thumbnail_url: "https://cdn.example.com/poster.jpg",
          },
        ],
      },
    };
    render(
      <XBookmarksContext.Provider value={new Map([[1, data]])}>
        <LinkCard
          link={link}
          siteUrl="https://zhe.to"
          onDelete={vi.fn()}
          onUpdate={vi.fn()}
          viewMode="feed"
        />
      </XBookmarksContext.Provider>,
    );
    const card = screen.getByTestId("link-card");
    const preview = within(card).getByRole("button", { name: "播放帖子视频" });
    const user = userEvent.setup();
    expect(card.querySelector("video")).toBeNull();
    await user.click(preview);
    const dialog = await screen.findByRole("dialog", { name: "X 帖子" });
    expect(within(dialog).getByLabelText("已归档的 X 视频")).toHaveAttribute("autoplay");
    expect(card.querySelector("video")).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(preview).toHaveFocus();
    expect(screen.queryByLabelText("已归档的 X 视频")).not.toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "查看 X 全文" }));
    expect(screen.queryByLabelText("已归档的 X 视频")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "播放视频 1" }),
    ).toBeVisible();
  });
  it("keeps playback available when a poster cannot load", () => {
    const { container } = render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              media: [
                {
                  id: "video",
                  type: "VIDEO",
                  url: "https://cdn.example.com/video.mp4",
                  thumbnail_url: "https://cdn.example.com/missing.jpg",
                },
              ],
            },
          }}
        />
      </LayerCard>,
    );
    const preview = screen.getByRole("button", { name: "播放视频 1" });
    fireEvent.error(within(preview).getByAltText(""));
    expect(preview.querySelector("img")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
    fireEvent.click(preview);
    expect(screen.getByLabelText("已归档的 X 视频")).toHaveAttribute(
      "src",
      "https://cdn.example.com/video.mp4",
    );
  });
  it("renders quoted text without pretending the quote's media belongs to this post", () => {
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              quoted_tweet: { ...tweet, id: "99", text: "Quoted context", media: [] },
            },
          }}
        />
      </LayerCard>,
    );
    expect(screen.getByText("Quoted context")).toBeInTheDocument();
  });
  it.each(["VIDEO", "PHOTO"] as const)(
    "can retry a failed archived %s without losing text",
    (type) => {
      render(
        <LayerCard>
          <XBookmarkContent
            bookmark={{
              ...bookmark,
              tweet: {
                ...tweet,
                text: "Saved body remains readable",
                media: [{ id: "media", type, url: "https://cdn.example.com/media" }],
              },
            }}
          />
        </LayerCard>,
      );
      const media = () =>
        type === "VIDEO"
          ? screen.getByLabelText("已归档的 X 视频")
          : screen.getByAltText("帖子图片 1");
      if (type === "VIDEO") fireEvent.click(screen.getByRole("button", { name: "播放视频 1" }));
      fireEvent.error(media());
      expect(
        screen.getByText(type === "PHOTO" ? "图片暂时无法加载" : "媒体暂时无法播放"),
      ).toBeInTheDocument();
      expect(screen.getByText("Saved body remains readable")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "重试" }));
      expect(media()).toBeInTheDocument();
    },
  );
});
