// @vitest-environment happy-dom
import { LayerCard } from "@nocoo/basalt";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retryXBookmarkAction } from "@/actions/connector";
import { normalizeXPost } from "@/cli/src/connector/core";
import {
  XBookmarkContent,
  XBookmarkDetailsButton,
  XBookmarkPending,
  XBookmarkStatus,
  XSourceBadge,
} from "@/components/dashboard/x-bookmark-content";
import type { XBookmark } from "@/lib/connector/jobs";
import type { Link } from "@/models/types";

vi.mock("@/actions/connector", () => ({ retryXBookmarkAction: vi.fn() }));

const tweet = normalizeXPost(
  {
    rest_id: "12345",
    legacy: {
      full_text: "Normal text body",
      created_at: "2026-09-12T00:00:00Z",
      favorite_count: 7,
      retweet_count: 3,
      reply_count: 2,
    },
    core: {
      user_results: {
        result: {
          rest_id: "1",
          legacy: { screen_name: "example", name: "Example Author" },
          is_blue_verified: false,
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
  note: "My note",
  screenshotUrl: null,
  title: null,
  metaTitle: null,
  metaDescription: null,
  metaFavicon: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(retryXBookmarkAction).mockResolvedValue({ success: true });
});

describe("XBookmarkDetailsButton & XSourceBadge", () => {
  it.each([
    ["complete", "已补全", false],
    ["running", "正在补全", true],
    ["partial", "正文已保存，媒体待补全", true],
    ["failed", "补全暂未完成", true],
    ["unavailable", "原帖暂不可访问", true],
    ["pending", "等待补全", true],
  ] as const)("renders details button state=%s with description=%s", (state, desc, hasDot) => {
    const onClick = vi.fn();
    const { container } = render(
      <XBookmarkDetailsButton
        bookmark={{ ...bookmark, state }}
        onClick={onClick}
        className="test-class"
      />,
    );
    const btn = screen.getByRole("button", { name: "查看帖子详情" });
    expect(btn).toHaveAccessibleDescription(desc);
    expect(btn).toHaveClass("test-class");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
    const dot = container.querySelector("span[aria-hidden]");
    if (hasDot) {
      expect(dot).toBeInTheDocument();
      if (state === "running") expect(dot).toHaveClass("bg-primary");
      if (["partial", "failed", "unavailable"].includes(state))
        expect(dot).toHaveClass("bg-warning");
    } else {
      expect(dot).toBeNull();
    }
  });

  it("handles undefined bookmark in details button defaulting to pending", () => {
    render(<XBookmarkDetailsButton bookmark={undefined} onClick={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAccessibleDescription("等待补全");
  });

  it("renders XSourceBadge in both compact and full mode for each content type", () => {
    const { rerender } = render(<XSourceBadge type="text" compact={false} />);
    expect(screen.getByTitle("来源：X")).toBeInTheDocument();
    expect(screen.getByText("文字")).toBeInTheDocument();

    rerender(<XSourceBadge type="image" compact={true} />);
    expect(screen.getByTitle("来源：X")).toBeInTheDocument();
    expect(screen.getByText("图片")).toHaveClass("sr-only");
  });
});

describe("XBookmarkContent branches", () => {
  it("returns null when tweet is missing", () => {
    const { container } = render(
      <XBookmarkContent bookmark={{ ...bookmark, tweet: null as unknown as typeof tweet }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders custom title and author fallback without author verified badge", () => {
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              author: { ...tweet.author, name: "", is_verified: false },
            },
          }}
          title="Custom Title Here"
        />
      </LayerCard>,
    );
    expect(screen.getByText("Custom Title Here")).toBeInTheDocument();
    expect(screen.queryByLabelText("认证账号")).not.toBeInTheDocument();
    expect(screen.getByText("X")).toBeInTheDocument();
  });

  it("renders duration badge on video with duration", () => {
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              media: [
                {
                  id: "v1",
                  type: "VIDEO",
                  url: "https://example.com/v.mp4",
                  thumbnail_url: "https://example.com/thumb.jpg",
                  duration: 125, // 2:05
                },
              ],
            },
          }}
        />
      </LayerCard>,
    );
    expect(screen.getByText("视频 · 2:05")).toBeInTheDocument();
  });

  it("renders multiple photo collage in compact mode with overflow count indicator", () => {
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              media: [
                { id: "p1", type: "PHOTO", url: "https://example.com/1.jpg" },
                { id: "p2", type: "PHOTO", url: "https://example.com/2.jpg" },
                { id: "p3", type: "PHOTO", url: "https://example.com/3.jpg" },
                { id: "p4", type: "PHOTO", url: "https://example.com/4.jpg" },
                { id: "p5", type: "PHOTO", url: "https://example.com/5.jpg" },
              ],
            },
          }}
          compact
        />
      </LayerCard>,
    );
    expect(screen.getByText("5 个附件")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /查看图片/ })).toHaveLength(4);
  });

  it("renders post links with standalone root path url falling back to 外部网站", () => {
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              text: "",
              entities: {
                ...tweet.entities,
                urls: ["https://mysite.com/"],
              },
            },
          }}
        />
      </LayerCard>,
    );
    const preview = screen.getByTestId("x-link-preview");
    expect(preview).toHaveTextContent("外部网站");
    expect(preview).toHaveTextContent("分享链接");
  });

  it("renders video without resolution using fallback videoResolution calculation", () => {
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              media: [
                {
                  id: "v2",
                  type: "VIDEO",
                  url: "https://example.com/v2.mp4",
                  width: 1920,
                  height: 1080,
                  size: 5000000,
                },
              ],
            },
          }}
        />
      </LayerCard>,
    );
    expect(screen.getByTestId("x-video-archive-info")).toHaveTextContent("1080p");
  });

  it("renders quote without media even in compact view", () => {
    render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              media: [],
              quoted_tweet: {
                ...tweet,
                id: "q1",
                text: "Quoted in compact",
                media: [],
              },
            },
          }}
          compact
        />
      </LayerCard>,
    );
    expect(screen.getByText("Quoted in compact")).toBeInTheDocument();
  });
});

describe("XBookmarkPending", () => {
  it("renders with custom title and metaTitle", () => {
    render(
      <LayerCard>
        <XBookmarkPending
          link={{
            ...link,
            title: "Saved custom link title",
            metaTitle: "Original Meta Title",
            metaDescription: "Pending body explanation",
          }}
          compact={false}
        />
      </LayerCard>,
    );
    expect(screen.getByText("已保存的 X 帖子")).toBeInTheDocument();
    expect(screen.getByText("Saved custom link title")).toBeInTheDocument();
    expect(screen.getByText("Pending body explanation")).toBeInTheDocument();
  });

  it("renders compact mode with default description", () => {
    render(
      <LayerCard>
        <XBookmarkPending
          link={{ ...link, title: null, metaTitle: null, metaDescription: null }}
          compact
        />
      </LayerCard>,
    );
    expect(screen.getByText("帖子内容尚未补全，可以先打开原帖查看。")).toBeInTheDocument();
  });
});

describe("XBookmarkStatus compact & action branches", () => {
  it("renders compact status with custom error message", () => {
    render(
      <XBookmarkStatus
        bookmark={{ ...bookmark, state: "failed", errorCode: "needs_login" }}
        linkId={1}
        compact
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("本地浏览器尚未登录 X");
  });

  it("exercises PostLinks branches: multiple links, X article, non-root URL, headline presence", () => {
    // 1. Full mode without headline: X article and ordinary non-root URL
    const { rerender } = render(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              text: "Check these articles",
              entities: {
                hashtags: [],
                mentioned_users: [],
                urls: ["https://x.com/i/article/999", "https://example.com/deep/page"],
              },
              media: [],
            },
          }}
          compact={false}
        />
      </LayerCard>,
    );

    const previews = screen.getAllByTestId("x-link-preview");
    expect(previews).toHaveLength(2);
    expect(screen.getByText("X 文章")).toBeInTheDocument();
    expect(screen.getByText("阅读 X 文章")).toBeInTheDocument();
    expect(screen.getAllByText("阅读全文")).toHaveLength(2);
    expect(screen.getByText("/deep/page")).toBeInTheDocument();

    // 2. Compact mode with multiple links: only displays the first link
    rerender(
      <LayerCard>
        <XBookmarkContent
          bookmark={{
            ...bookmark,
            tweet: {
              ...tweet,
              text: "Check these articles",
              entities: {
                hashtags: [],
                mentioned_users: [],
                urls: ["https://x.com/i/article/999", "https://example.com/deep/page"],
              },
              media: [],
            },
          }}
          compact={true}
        />
      </LayerCard>,
    );
    expect(screen.getAllByTestId("x-link-preview")).toHaveLength(1);
    expect(screen.queryByText("打开链接")).not.toBeInTheDocument(); // compact hides CTA text
  });

  it("renders compact partial status as 媒体待补全", () => {
    render(
      <XBookmarkStatus
        bookmark={{ ...bookmark, state: "partial", errorCode: null }}
        linkId={1}
        compact
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("媒体待补全");
  });

  it("exercises compact XBookmarkStatus without error in non-partial state (line 699)", () => {
    render(
      <XBookmarkStatus
        bookmark={{ ...bookmark, state: "complete", errorCode: null }}
        linkId={1}
        compact={true}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("已补全");
  });

  it("renders action buttons in full status and lets caller pass custom actions", () => {
    render(
      <XBookmarkStatus
        bookmark={{ ...bookmark, state: "failed", errorCode: "fetch_failed" }}
        linkId={1}
        compact={false}
        actions={<button type="button">CustomAction</button>}
      />,
    );
    expect(screen.getByText("CustomAction")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新补全" })).toBeInTheDocument();
  });

  it("handles retry click success feedback in full status mode", async () => {
    vi.mocked(retryXBookmarkAction).mockResolvedValueOnce({ success: true });
    render(
      <XBookmarkStatus
        bookmark={{ ...bookmark, state: "failed", errorCode: "fetch_failed" }}
        linkId={1}
        compact={false}
      />,
    );

    const retryBtn = screen.getByRole("button", { name: "重新补全" });
    fireEvent.click(retryBtn);

    expect(await screen.findByText("已重新排队")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新补全" })).not.toBeInTheDocument();
  });

  it("handles retry click failure and exception feedback in full status mode", async () => {
    // 1. Returns { success: false }
    vi.mocked(retryXBookmarkAction).mockResolvedValueOnce({ success: false });
    const { rerender } = render(
      <XBookmarkStatus
        bookmark={{ ...bookmark, state: "failed", errorCode: "fetch_failed" }}
        linkId={1}
        compact={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重新补全" }));
    expect(await screen.findByText("暂时无法重试")).toBeInTheDocument();

    // 2. Re-render with new updatedAt/version to reset feedback, and throw
    vi.mocked(retryXBookmarkAction).mockRejectedValueOnce(new Error("offline"));
    rerender(
      <XBookmarkStatus
        bookmark={{
          ...bookmark,
          state: "failed",
          errorCode: "fetch_failed",
          updatedAt: Date.now() + 1000,
        }}
        linkId={1}
        compact={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重新补全" }));
    expect(await screen.findByText("暂时无法重试")).toBeInTheDocument();
  });
});
