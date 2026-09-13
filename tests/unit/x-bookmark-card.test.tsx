// @vitest-environment happy-dom
import { LayerCard } from "@nocoo/basalt";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retryXBookmarkAction } from "@/actions/connector";
import { normalizeXPost } from "@/cli/src/connector/core";
import { LinkCard } from "@/components/dashboard/link-card";
import { XBookmarkContent, XBookmarkStatus } from "@/components/dashboard/x-bookmark-content";
import { XBookmarksContext } from "@/contexts/x-bookmarks";
import type { XBookmark } from "@/lib/connector/jobs";
import type { Link } from "@/models/types";

vi.mock("@/actions/connector", () => ({ retryXBookmarkAction: vi.fn() }));
vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useLinkCardViewModel: () => ({
    shortUrl: "https://zhe.to/test",
    copied: false,
    faviconError: false,
    handleCopy: vi.fn(),
    handleToggleAnalytics: vi.fn(),
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
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(retryXBookmarkAction).mockResolvedValue({ success: true });
});

describe("X bookmark presentation", () => {
  it("replaces the ordinary bookmark preview with enriched X content while preserving edit controls", () => {
    const link: Link = {
      id: 1,
      userId: "owner",
      originalUrl: "https://x.com/example/status/12345",
      slug: "test",
      isCustom: false,
      clicks: 0,
      createdAt: new Date(),
      expiresAt: null,
      folderId: null,
      note: "Keep this saved note after enrichment",
      screenshotUrl: null,
      metaTitle: null,
      metaDescription: null,
      metaFavicon: null,
    };
    const card = (
      <LinkCard link={link} siteUrl="https://zhe.to" onDelete={vi.fn()} onUpdate={vi.fn()} />
    );
    const { rerender } = render(
      <XBookmarksContext.Provider value={new Map()}>{card}</XBookmarksContext.Provider>,
    );
    expect(screen.getByText("Keep this saved note after enrichment")).toBeInTheDocument();
    rerender(
      <XBookmarksContext.Provider value={new Map([[1, bookmark]])}>
        {card}
      </XBookmarksContext.Provider>,
    );
    expect(screen.getByTestId("x-bookmark-content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit link" })).toBeInTheDocument();
    expect(screen.getByText("Keep this saved note after enrichment")).toBeInTheDocument();
  });
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
  it("plays an archived video inline and opens photos with the public dialog", async () => {
    const data = {
      ...bookmark,
      tweet: {
        ...tweet,
        media: [
          {
            id: "v",
            type: "VIDEO" as const,
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
    expect(container.querySelector("video")).toHaveAttribute("controls");
    expect(container.querySelector("video")).toHaveAttribute("preload", "none");
    expect(container.querySelector("video")).toHaveAttribute(
      "src",
      "https://cdn.example.com/video.mp4",
    );
    fireEvent.click(screen.getByRole("button", { name: "查看图片 2" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "图片预览" })).toBeInTheDocument();
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
      fireEvent.error(media());
      expect(screen.getByText("媒体暂时无法播放")).toBeInTheDocument();
      expect(screen.getByText("Saved body remains readable")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "重试" }));
      expect(media()).toBeInTheDocument();
    },
  );
  it("keeps pending and partial states visible and lets the owner retry a failed job", async () => {
    const { rerender } = render(<XBookmarkStatus bookmark={undefined} linkId={1} />);
    expect(screen.getByText("等待补全")).toBeInTheDocument();
    rerender(
      <XBookmarkStatus
        bookmark={{ ...bookmark, state: "partial", errorCode: "media_incomplete" }}
        linkId={1}
      />,
    );
    expect(screen.getByText("正文已保存，媒体待补全")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新补全" }));
    await waitFor(() => expect(retryXBookmarkAction).toHaveBeenCalledWith(1));
    expect(await screen.findByText("已重新排队")).toBeInTheDocument();
  });
  it.each([
    ["pending", "等待补全"],
    ["running", "正在补全"],
    ["complete", "已补全"],
    ["partial", "正文已保存，媒体待补全"],
    ["failed", "补全暂未完成"],
  ] as const)("replaces retry feedback with the next %s state", async (state, label) => {
    const { rerender } = render(
      <XBookmarkStatus bookmark={{ ...bookmark, state: "partial" }} linkId={1} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "重新补全" }));
    expect(await screen.findByText("已重新排队")).toBeInTheDocument();
    rerender(
      <XBookmarkStatus
        bookmark={{ ...bookmark, state, updatedAt: bookmark.updatedAt + 1 }}
        linkId={1}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText("已重新排队")).not.toBeInTheDocument();
    if (["partial", "failed"].includes(state))
      expect(screen.getByRole("button", { name: "重新补全" })).toBeEnabled();
  });
  it.each([false, true])(
    "lets an unsuccessful retry be tried again (throws=%s)",
    async (throws) => {
      if (throws) vi.mocked(retryXBookmarkAction).mockRejectedValueOnce(new Error("offline"));
      else vi.mocked(retryXBookmarkAction).mockResolvedValueOnce({ success: false });
      render(<XBookmarkStatus bookmark={{ ...bookmark, state: "failed" }} linkId={1} />);
      fireEvent.click(screen.getByRole("button", { name: "重新补全" }));
      expect(await screen.findByText("暂时无法重试")).toBeInTheDocument();
      const retry = screen.getByRole("button", { name: "重新补全" });
      expect(retry).toBeEnabled();
      fireEvent.click(retry);
      expect(await screen.findByText("已重新排队")).toBeInTheDocument();
      expect(retryXBookmarkAction).toHaveBeenCalledTimes(2);
    },
  );
});
