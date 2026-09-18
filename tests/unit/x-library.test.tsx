// @vitest-environment happy-dom
vi.mock("@/actions/link-organization", () => ({ applyLinkOrganization: vi.fn() }));
vi.mock("@/actions/tags", () => ({ createTag: vi.fn() }));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeXPost, type XPost } from "@/cli/src/connector/core";
import { XLibraryPage } from "@/components/dashboard/x-library-page";
import { useDashboardService } from "@/contexts/dashboard-service";
import { XBookmarksContext } from "@/contexts/x-bookmarks";
import type { XBookmark } from "@/lib/connector/jobs";
import type { Folder, Link } from "@/models/types";
import { getXBookmarkForLink, getXContentTypes, getXPostPresentation } from "@/models/x-bookmarks";
import { makeTag } from "../fixtures";

vi.mock("@/contexts/dashboard-service", () => ({ useDashboardService: vi.fn() }));
vi.mock("@/components/dashboard/link-card", () => ({
  LinkCard: ({ link, viewMode }: { link: Link; viewMode: string }) => (
    <article aria-label={link.note ?? ""} data-view={viewMode}>
      {link.note}
    </article>
  ),
}));

function post(id: number, overrides: Partial<XPost> = {}): XPost {
  const capture = normalizeXPost(
    {
      rest_id: String(id),
      legacy: { full_text: "A saved post", created_at: "2026-09-12T00:00:00Z" },
      core: {
        user_results: { result: { rest_id: "10", legacy: { name: "Lin", screen_name: "lin" } } },
      },
    },
    String(id),
  );
  if (!capture) throw new Error("Invalid fixture");
  return { ...capture.tweet, ...overrides };
}

function link(id: number, note: string, folderId: string | null = "design"): Link {
  return {
    id,
    userId: "owner",
    originalUrl: `https://x.com/lin/status/${id}`,
    slug: `x-${id}`,
    note,
    folderId,
    isCustom: false,
    clicks: 0,
    createdAt: new Date(2026, 8, id),
    expiresAt: null,
    screenshotUrl: null,
    title: null,
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
  };
}

const links = [
  link(1, "Mixed media"),
  link(2, "Architecture photo", "reading"),
  link(3, "Research article", "reading"),
  link(4, "Simple note", null),
  link(5, "Waiting", "design"),
  { ...link(6, "Normal website"), originalUrl: "https://example.com" },
  link(7, "Animation", "design"),
];
const tweets = [
  post(1, {
    media: [
      { id: "v", type: "VIDEO", url: "/video.mp4" },
      { id: "p", type: "PHOTO", url: "/image.jpg" },
    ],
  }),
  post(2, { media: [{ id: "p", type: "PHOTO", url: "/image.jpg" }] }),
  post(3, {
    entities: { hashtags: [], mentioned_users: [], urls: ["https://example.org/research"] },
  }),
  post(4),
  post(7, { media: [{ id: "g", type: "GIF", url: "/animation.mp4" }] }),
];
const bookmarks = new Map<number, XBookmark>(
  tweets.map((tweet) => [
    Number(tweet.id),
    { linkId: Number(tweet.id), tweet, state: "complete", errorCode: null, updatedAt: 1 },
  ]),
);
const folders: Folder[] = [
  { id: "design", name: "设计", userId: "owner", icon: "folder", createdAt: new Date() },
  { id: "reading", name: "阅读", userId: "owner", icon: "folder", createdAt: new Date() },
];

function renderPage(value = bookmarks) {
  return render(
    <XBookmarksContext.Provider value={value}>
      <XLibraryPage />
    </XBookmarksContext.Provider>,
  );
}

let service: ReturnType<typeof useDashboardService>;
beforeEach(() => {
  vi.clearAllMocks();
  service = {
    links,
    folders,
    tags: [],
    linkTags: [{ linkId: 1, tagId: "tag", createdAt: new Date() }],
    loading: false,
    siteUrl: "https://zhe.to",
    handleLinkDeleted: vi.fn(),
    handleLinkUpdated: vi.fn(),
    handleTagCreated: vi.fn(),
    handleLinkTagAdded: vi.fn(),
    handleLinkTagRemoved: vi.fn(),
  } as unknown as ReturnType<typeof useDashboardService>;
  vi.mocked(useDashboardService).mockReturnValue(service);
});

describe("X content classification", () => {
  it("replaces only unambiguous URL-only bodies with an expanded preview", () => {
    const article = "https://x.com/i/article/123";
    const short = "https://t.co/abc";
    const capture = post(9, {
      text: short,
      entities: { hashtags: [], mentioned_users: [], urls: [article] },
    });
    expect(getXPostPresentation(capture).text).toBe("");
    expect(getXPostPresentation({ ...capture, text: article }).text).toBe("");
    const prose = `Read this first. ${short}`;
    expect(getXPostPresentation({ ...capture, text: prose }).text).toBe(prose);
    const ambiguous = {
      ...capture,
      entities: { ...capture.entities, urls: [article, "https://example.org"] },
    };
    expect(getXPostPresentation(ambiguous).text).toBe(short);
    expect(getXPostPresentation({ ...capture, text: "https://t.co.evil.example/abc" }).text).toBe(
      "https://t.co.evil.example/abc",
    );
  });
  it("deduplicates previews, rejects unsafe URLs and identifies native X articles", () => {
    const native = "https://mobile.twitter.com/i/article/123";
    const result = getXPostPresentation(
      post(9, {
        text: "Useful reading",
        entities: {
          hashtags: [],
          mentioned_users: [],
          urls: [native, native, "javascript:alert(1)", "invalid", "https://example.org/reading"],
        },
      }),
    );
    expect(result.links).toEqual([
      { url: native, hostname: "twitter.com", isXArticle: true, isArticle: true },
      {
        url: "https://example.org/reading",
        hostname: "example.org",
        isXArticle: false,
        isArticle: true,
      },
    ]);
    expect(result.text).toBe("Useful reading");
  });
  it("matches every media type in a mixed post and keeps unprocessed links separate", () => {
    expect(getXContentTypes(tweets[0])).toEqual(["video", "image"]);
    expect(getXContentTypes(tweets[4])).toEqual(["gif"]);
    expect(getXContentTypes(null)).toEqual(["pending"]);
    expect(getXContentTypes(post(9))).toEqual(["text"]);
    expect(getXContentTypes(post(9, { text: "Long text ".repeat(70) }))).toEqual(["article"]);
  });
  it.each([
    ["https://example.com/article", "article"],
    ["https://x.com/i/article/123", "article"],
    ["https://mobile.twitter.com/lin/status/9", "text"],
    ["https://x.com/lin/status/9", "text"],
    ["https://t.co/abc", "text"],
    ["https://pic.twitter.com/abc", "text"],
    ["javascript:alert(1)", "text"],
    ["invalid", "text"],
  ])("classifies expanded link %s as %s", (url, expected) => {
    expect(
      getXContentTypes(post(9, { entities: { hashtags: [], mentioned_users: [], urls: [url] } })),
    ).toEqual([expected]);
  });
  it("rejects stale captures after a saved URL changes", () => {
    expect(
      getXBookmarkForLink({ originalUrl: "https://x.com/lin/status/999" }, bookmarks.get(1)),
    ).toBeUndefined();
    expect(
      getXBookmarkForLink({ originalUrl: "https://example.com" }, bookmarks.get(1)),
    ).toBeUndefined();
    expect(
      getXBookmarkForLink({ originalUrl: "https://x.com/lin/status/1" }, bookmarks.get(1)),
    ).toBe(bookmarks.get(1));
  });
});

async function selectType(name: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "内容类型" }));
  await userEvent.click(screen.getByRole("option", { name: new RegExp(`^${name}`) }));
}

describe("X library", () => {
  it("combines all categories and keeps pending posts visible without including normal links", () => {
    renderPage();
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.queryByRole("article", { name: "Normal website" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Waiting" })).toHaveAttribute("data-view", "feed");
    expect(screen.getByRole("article", { name: "Mixed media" })).toHaveAttribute(
      "data-view",
      "feed",
    );
    expect(screen.getByRole("status")).toHaveTextContent("共 6 条收藏");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
  it("intersects the category and media filters, supports mixed posts, and clears filters", async () => {
    renderPage();
    const user = userEvent.setup();
    await selectType("图片");
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await user.click(screen.getByRole("combobox", { name: "筛选分类" }));
    await user.click(screen.getByRole("option", { name: "阅读" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Architecture photo" })).toBeInTheDocument();
    await selectType("视频");
    expect(screen.getByText("没有符合条件的 X 收藏")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "清除筛选" })[0] as HTMLElement);
    expect(screen.getAllByRole("article")).toHaveLength(6);
    await user.click(screen.getByRole("combobox", { name: "筛选分类" }));
    await user.click(screen.getByRole("option", { name: "Inbox · 未分类" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Simple note" })).toBeInTheDocument();
  });
  it("filters articles using the compact header control", async () => {
    renderPage();
    await selectType("文章");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Research article" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
  it("intersects named tags and supports deselection", async () => {
    service.tags = [
      makeTag({ id: "design-tag", name: "设计规范" }),
      makeTag({ id: "read-tag", name: "待读" }),
    ];
    service.linkTags = [
      { linkId: 1, tagId: "design-tag" },
      { linkId: 1, tagId: "read-tag" },
      { linkId: 2, tagId: "design-tag" },
      { linkId: 3, tagId: "read-tag" },
    ];
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "标签" }));
    await user.click(screen.getByRole("option", { name: "设计规范" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await user.click(screen.getByRole("option", { name: "待读" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Mixed media" })).toBeVisible();
    await user.click(screen.getByRole("option", { name: "设计规范" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("article", { name: "Research article" })).toBeVisible();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getAllByRole("article")).toHaveLength(6);
  });
  it("updates media filtering when the shared capture changes", async () => {
    const { rerender } = renderPage();
    await selectType("待补全");
    expect(screen.getByRole("article", { name: "Waiting" })).toBeInTheDocument();
    const updated = new Map(bookmarks);
    updated.set(5, { linkId: 5, tweet: post(5), state: "complete", errorCode: null, updatedAt: 2 });
    rerender(
      <XBookmarksContext.Provider value={updated}>
        <XLibraryPage />
      </XBookmarksContext.Provider>,
    );
    expect(screen.queryByRole("article", { name: "Waiting" })).not.toBeInTheDocument();
    await selectType("文字");
    expect(screen.getByRole("article", { name: "Waiting" })).toBeInTheDocument();
  });
  it("shows initial loading and an actionable empty state", () => {
    vi.mocked(useDashboardService).mockReturnValue({
      ...service,
      links: [],
      folders: [],
      linkTags: [],
      loading: true,
    });
    const { rerender } = renderPage();
    expect(screen.getByTestId("page-header-skeleton")).toBeInTheDocument();
    vi.mocked(useDashboardService).mockReturnValue({
      ...service,
      links: [],
      folders: [],
      linkTags: [],
      loading: false,
    });
    rerender(<XLibraryPage />);
    expect(screen.getByText("还没有 X 收藏")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "管理链接" })).toHaveAttribute("href", "/dashboard");
  });
});
