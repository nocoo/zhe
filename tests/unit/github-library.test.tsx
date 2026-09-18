// @vitest-environment happy-dom
vi.mock("@/actions/link-organization", () => ({ applyLinkOrganization: vi.fn() }));
vi.mock("@/actions/tags", () => ({ createTag: vi.fn() }));
vi.mock("@/actions/links", () => ({ createLink: vi.fn() }));

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadGitHubBookmarks,
  loadGitHubReadme,
  retryGitHubBookmarkAction,
} from "@/actions/github-connector";
import { createLink } from "@/actions/links";
import type { GitHubRepository } from "@/cli/src/connector/github-core";
import { GitHubLibraryPage } from "@/components/dashboard/github-library-page";
import { GitHubRepositoryCard } from "@/components/dashboard/github-repository-card";
import { type DashboardService, useDashboardService } from "@/contexts/dashboard-service";
import type { GitHubBookmark } from "@/lib/connector/github-jobs";
import { githubReadmeUrl } from "@/models/github-bookmarks";
import { makeFolder, makeLink, makeTag } from "../fixtures";

vi.mock("@/actions/github-connector", () => ({
  loadGitHubBookmarks: vi.fn(),
  loadGitHubReadme: vi.fn(),
  retryGitHubBookmarkAction: vi.fn(),
}));
vi.mock("@/contexts/dashboard-service", () => ({ useDashboardService: vi.fn() }));
const { copyLink } = vi.hoisted(() => ({ copyLink: vi.fn() }));
vi.mock("@/viewmodels/useLinksViewModel", async () => ({
  ...(await vi.importActual("@/viewmodels/useCreateLinkViewModel")),
  useLinkCardViewModel: () => ({ isDeleting: false, handleDelete: vi.fn(), handleCopy: copyLink }),
}));
vi.mock("@/components/dashboard/link-card-parts/inline-edit-area", () => ({
  InlineEditArea: ({ onCloseEdit }: { onCloseEdit: () => void }) => (
    <div>
      编辑仓库分类和标签
      <button type="button" onClick={onCloseEdit}>
        收起
      </button>
    </div>
  ),
}));

const repository: GitHubRepository = {
  sourceFullName: "octocat/hello",
  fullName: "octocat/hello",
  description: "Repository description",
  stars: 1234,
  commits: 76,
  forks: 5,
  language: "TypeScript",
  defaultBranch: "main",
  pushedAt: "2026-09-12T00:00:00Z",
  archived: false,
  license: "MIT",
  topics: ["bookmarks"],
  readmePath: ".github/README.md",
  readme: `# Full README\n\n[Guide](../guide.md)\n\n![Diagram](images/diagram.png)\n\n[Unsafe](javascript:alert(1))\n\n${"Paragraph of README content.\n\n".repeat(80)}END OF README`,
};
const link = makeLink({
  id: 1,
  originalUrl: "https://github.com/octocat/hello",
  folderId: "tools",
  note: "My repo note",
});
const second = makeLink({ id: 2, originalUrl: "https://github.com/example/second" });
const folder = makeFolder({ id: "tools", name: "工具" });
const tag = makeTag({ id: "t1", name: "已读" });
const { readme: _readme, ...summary } = repository;
const bookmark: GitHubBookmark = {
  linkId: 1,
  sourceUrl: link.originalUrl,
  state: "complete",
  repository: summary,
  hasReadme: true,
  capturedAt: 1789171200000,
  updatedAt: 1,
  note: link.note,
  errorCode: null,
};
const callbacks = {
  onLinkUpdated: vi.fn(),
  onTagCreated: vi.fn(),
  onLinkTagAdded: vi.fn(),
  onLinkTagRemoved: vi.fn(),
};
const service = {
  links: [link, second, makeLink({ id: 3, originalUrl: "https://github.com/topics/notes" })],
  folders: [folder],
  tags: [tag],
  linkTags: [{ linkId: 1, tagId: "t1" }],
  loading: false,
  siteUrl: "https://zhe.to",
  handleLinkCreated: vi.fn(),
  refreshLinks: vi.fn(),
  handleLinkUpdated: callbacks.onLinkUpdated,
  handleLinkDeleted: vi.fn(),
  handleTagCreated: callbacks.onTagCreated,
  handleLinkTagAdded: callbacks.onLinkTagAdded,
  handleLinkTagRemoved: callbacks.onLinkTagRemoved,
} as unknown as DashboardService;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(service.refreshLinks).mockResolvedValue({ success: true });
  vi.mocked(createLink).mockResolvedValue({ success: true, data: link });
  vi.spyOn(HTMLElement.prototype, "animate").mockReturnValue({
    finished: Promise.resolve(),
    cancel: vi.fn(),
  } as unknown as Animation);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.mocked(useDashboardService).mockReturnValue(service);
  vi.mocked(loadGitHubBookmarks).mockResolvedValue({ success: true, data: [bookmark] });
  vi.mocked(loadGitHubReadme).mockResolvedValue({ success: true, data: repository });
  vi.mocked(retryGitHubBookmarkAction).mockResolvedValue({ success: true });
});

describe("GitHub collection", () => {
  it("shows repository statistics, categories and named tags in its own layout", async () => {
    render(<GitHubLibraryPage />);
    expect(await screen.findByText("1.2K")).toBeVisible();
    expect(screen.getByTitle("默认分支 main 的 commit 总数 · 76")).toBeVisible();
    expect(screen.getByText("TypeScript")).toBeVisible();
    expect(screen.getByText("工具")).toBeVisible();
    expect(screen.getByText("已读")).toBeVisible();
    expect(screen.getByText("main", { exact: true })).toBeVisible();
    expect(screen.getAllByTitle("来源：GitHub")).toHaveLength(2);
    expect(screen.getAllByTestId("github-repository")).toHaveLength(2);
    expect(loadGitHubReadme).not.toHaveBeenCalled();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
  it("combines folder and tag filters and supports metric sorting", async () => {
    const user = userEvent.setup();
    render(<GitHubLibraryPage />);
    await screen.findByText("1.2K");
    await user.click(screen.getByRole("button", { name: "文件夹" }));
    await user.click(screen.getByRole("option", { name: "工具" }));
    expect(screen.getAllByTestId("github-repository")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "标签" }));
    await user.click(screen.getByRole("option", { name: "已读" }));
    await user.keyboard("{Escape}");
    expect(screen.getAllByTestId("github-repository")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getAllByTestId("github-repository")).toHaveLength(2);
    await user.click(screen.getByRole("combobox", { name: "仓库排序" }));
    await user.click(screen.getByRole("option", { name: "最多 stars" }));
    expect(screen.getAllByTestId("github-repository")[0]).toHaveAttribute("data-link-id", "1");
    await user.click(screen.getByRole("combobox", { name: "仓库排序" }));
    await user.click(screen.getByRole("option", { name: "最多 commits" }));
    expect(screen.getAllByTestId("github-repository")[0]).toHaveAttribute("data-link-id", "1");
  });
  it("creates an ordinary URL from the shared dialog and refreshes links plus repository snapshots", async () => {
    const user = userEvent.setup();
    render(<GitHubLibraryPage />);
    await screen.findByText("1.2K");
    await user.click(screen.getByRole("button", { name: "新建链接" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("原始链接"), "https://example.com/article");
    await user.click(within(dialog).getByRole("button", { name: "创建链接" }));
    expect(createLink).toHaveBeenCalledWith(
      expect.objectContaining({ originalUrl: "https://example.com/article" }),
    );
    expect(service.handleLinkCreated).toHaveBeenCalledWith(link);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    vi.mocked(loadGitHubBookmarks).mockClear();
    await user.click(screen.getByRole("button", { name: "刷新链接" }));
    await waitFor(() => expect(loadGitHubBookmarks).toHaveBeenCalled());
    expect(service.refreshLinks).toHaveBeenCalledOnce();
  });
  it.each(["failed", "rejected"])("re-enables refresh after a %s request", async (outcome) => {
    const user = userEvent.setup();
    render(<GitHubLibraryPage />);
    await screen.findByText("1.2K");
    vi.mocked(loadGitHubBookmarks).mockClear();
    let finish: () => void = () => {};
    vi.mocked(service.refreshLinks).mockReturnValue(
      new Promise((resolve, reject) => {
        finish = () =>
          outcome === "rejected"
            ? reject(new Error("offline"))
            : resolve({ success: false, error: "offline" });
      }),
    );
    const button = screen.getByRole("button", { name: "刷新链接" });
    await user.click(button);
    expect(button).toBeDisabled();
    finish();
    await waitFor(() => expect(button).toBeEnabled());
    expect(loadGitHubBookmarks).not.toHaveBeenCalled();
  });
  it("handles initial loading, empty collections and pending repositories", async () => {
    vi.mocked(useDashboardService).mockReturnValue({ ...service, loading: true });
    const { rerender } = render(<GitHubLibraryPage />);
    expect(screen.getByTestId("page-header-skeleton")).toBeVisible();
    vi.mocked(useDashboardService).mockReturnValue({ ...service, links: [] });
    rerender(<GitHubLibraryPage />);
    expect(screen.getByText("还没有 GitHub 收藏")).toBeVisible();
    vi.mocked(useDashboardService).mockReturnValue({ ...service, links: [second] });
    rerender(<GitHubLibraryPage />);
    expect(screen.getByText("等待补全")).toBeVisible();
    expect(screen.getByRole("button", { name: "阅读 README" })).toBeDisabled();
  });
});

function renderCard(value: GitHubBookmark | undefined = bookmark, savedLink = link) {
  const refresh = vi.fn();
  return {
    refresh,
    ...render(
      <GitHubRepositoryCard
        link={savedLink}
        bookmark={value}
        folders={[folder]}
        tags={[tag]}
        linkTags={[{ linkId: 1, tagId: tag.id }]}
        siteUrl="https://zhe.to"
        editCallbacks={callbacks}
        onDelete={vi.fn()}
        onRefresh={refresh}
        onSuggest={vi.fn()}
      />,
    ),
  };
}
describe("README reading", () => {
  it("loads the entire README on demand and resolves links without enabling scripts", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "阅读 README" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("END OF README")).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Guide" })).toHaveAttribute(
      "href",
      "https://github.com/octocat/hello/blob/main/guide.md",
    );
    expect(within(dialog).getByRole("img", { name: "Diagram" })).toHaveAttribute(
      "src",
      "https://raw.githubusercontent.com/octocat/hello/main/.github/images/diagram.png",
    );
    expect(dialog.querySelector('a[href^="javascript:"]')).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Markdown 原文" }));
    expect(dialog.querySelector("pre code")?.textContent).toBe(repository.readme);
    await user.click(within(dialog).getByRole("button", { name: "阅读视图" }));
    expect(within(dialog).getByRole("heading", { name: "Full README" })).toBeVisible();
  });
  it.each(["missing", "empty", "failed", "rejected", "stale"])(
    "handles a %s README",
    async (kind) => {
      if (kind === "rejected") vi.mocked(loadGitHubReadme).mockRejectedValue(new Error("offline"));
      else
        vi.mocked(loadGitHubReadme).mockResolvedValue(
          kind === "failed"
            ? { success: false }
            : {
                success: true,
                data: {
                  ...repository,
                  ...(kind === "stale"
                    ? { sourceFullName: "another/repo" }
                    : { readme: kind === "empty" ? "" : null }),
                },
              },
        );
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "阅读 README" }));
      expect(
        await screen.findByText(
          kind === "missing"
            ? "这个仓库没有 README。"
            : kind === "empty"
              ? "README 文件为空"
              : "README 暂时无法读取，请关闭后重试。",
        ),
      ).toBeVisible();
    },
  );
  it("offers editing and explicit retry without losing a prior snapshot", async () => {
    const user = userEvent.setup();
    const { refresh } = renderCard({
      ...bookmark,
      state: "failed",
      errorCode: "github_rate_limited",
      repository: { ...summary, archived: true },
    });
    await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
    await user.click(screen.getByRole("menuitem", { name: "编辑收藏" }));
    await waitFor(() =>
      expect(screen.getByTestId("card-edit-dialog")).toHaveAttribute("data-phase", "editing"),
    );
    expect(screen.getByText("编辑仓库分类和标签")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("已归档")).toBeVisible();
    expect(screen.getByText("GitHub 暂时限制访问，稍后重试")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
    await user.click(screen.getByRole("menuitem", { name: "重新采集 GitHub 仓库" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByText("1.2K")).toBeVisible();
  });
  it.each([false, "reject"])(
    "keeps the retry control usable after a failure: %s",
    async (outcome) => {
      const user = userEvent.setup();
      if (outcome === "reject")
        vi.mocked(retryGitHubBookmarkAction).mockRejectedValue(new Error("offline"));
      else vi.mocked(retryGitHubBookmarkAction).mockResolvedValue({ success: false });
      const { refresh } = renderCard();
      await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
      await user.click(screen.getByRole("menuitem", { name: "重新采集 GitHub 仓库" }));
      await waitFor(() => expect(retryGitHubBookmarkAction).toHaveBeenCalledOnce());
      await user.click(screen.getByRole("button", { name: "更多收藏操作" }));
      expect(screen.getByRole("menuitem", { name: "重新采集 GitHub 仓库" })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(refresh).not.toHaveBeenCalled();
    },
  );
  it("resolves root and relative URLs while dropping unsafe schemes and credentials", () => {
    expect(githubReadmeUrl("/LICENSE", false, summary)).toBe(
      "https://github.com/octocat/hello/blob/main/LICENSE",
    );
    expect(githubReadmeUrl("#install", false, summary)).toContain("README.md#install");
    expect(githubReadmeUrl("https://example.com/docs", false, summary)).toBe(
      "https://example.com/docs",
    );
    for (const raw of [
      "javascript:alert(1)",
      "data:text/html,bad",
      "https://user:secret@example.com",
      "http://[",
      "",
    ])
      expect(githubReadmeUrl(raw, false, summary)).toBe("");
    expect(githubReadmeUrl("#bad-image", true, summary)).toBe("");
  });
});

describe("shared AI organization entry", () => {
  it("prioritizes the note and keeps source details in the reader with common actions in the footer", async () => {
    const user = userEvent.setup();
    const analysis = {
      summary: "旧 AI 简介",
      features: ["全文归档"],
      useCases: [],
      techStack: [],
      tags: ["历史主题"],
      model: "test",
      provider: "custom",
      generatedAt: 1,
    };
    renderCard({ ...bookmark, analysis }, { ...link, title: "整理标题", note: "当前手改备注" });
    expect(screen.getByText("整理标题")).toBeVisible();
    expect(screen.getByText("当前手改备注")).toBeVisible();
    expect(screen.queryByText("旧 AI 简介")).not.toBeInTheDocument();
    expect(screen.queryByText("Repository description")).not.toBeInTheDocument();
    const footer = within(screen.getByTestId("github-card-footer"));
    expect(footer.getByText("工具")).toBeVisible();
    await user.click(footer.getByRole("button", { name: "更多收藏操作" }));
    for (const name of ["AI 整理", "编辑收藏", "重新采集 GitHub 仓库"])
      expect(screen.getByRole("menuitem", { name })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "打开原仓库" })).toHaveAttribute(
      "href",
      link.originalUrl,
    );
    await user.click(screen.getByRole("menuitem", { name: "复制短链接" }));
    expect(copyLink).toHaveBeenCalledOnce();
    await user.click(footer.getByRole("button", { name: "阅读 README" }));
    expect(within(screen.getByRole("dialog")).getByText("Repository description")).toBeVisible();
  });
  it.each([null, "   "])("uses the source description when the note is %s", (note) => {
    renderCard(
      { ...bookmark, repository: { ...summary, license: "NOASSERTION" } },
      { ...link, note },
    );
    expect(screen.getByTestId("github-card-description")).toHaveTextContent(
      "Repository description",
    );
    expect(screen.queryByText("NOASSERTION")).not.toBeInTheDocument();
  });
  it("keeps every repository label beside saved tags, distinct from the footer actions", () => {
    const topics = Array.from({ length: 12 }, (_, index) => `repository-label-${index}`);
    renderCard({ ...bookmark, repository: { ...summary, topics } });
    const labels = within(screen.getByTestId("github-card-tags"));
    expect(labels.getByTestId("tag-badge")).toHaveTextContent("已读");
    expect(
      labels.getAllByTestId("github-repository-label").map((label) => label.textContent),
    ).toEqual(topics);
    expect(screen.queryByText("主题")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("github-card-footer")).queryByTestId("tag-badge")).toBeNull();
  });
  it("opens the unified editor without requiring README", async () => {
    const user = userEvent.setup();
    vi.mocked(loadGitHubBookmarks).mockResolvedValue({
      success: true,
      data: [{ ...bookmark, hasReadme: false }],
    });
    const events = [
      {
        type: "context",
        revision: 1,
        supplied: ["URL"],
        notices: ["README 未收录"],
        current: { title: "", note: "", folderId: null, tagIds: [] },
        catalogs: { folders: [], tags: [] },
        historicalAnalysis: null,
        prompt: "input",
        model: "test",
        provider: "custom",
      },
      {
        type: "result",
        result: {
          title: "短标题",
          note: "共享备注",
          folders: [{ folderId: null, name: "Inbox", reason: "暂存" }],
          tags: [],
        },
        rawText: "output",
        durationMs: 1,
      },
    ];
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) =>
        String(url).includes("settings")
          ? new Response('{"hasApiKey":true}')
          : new Response(events.map((e) => JSON.stringify(e)).join("\n")),
      );
    try {
      render(<GitHubLibraryPage />);
      await screen.findByText("1.2K");
      await user.click(
        within(screen.getAllByTestId("github-repository")[0] as HTMLElement).getByRole("button", {
          name: "更多收藏操作",
        }),
      );
      await user.click(screen.getByRole("menuitem", { name: "AI 整理" }));
      await waitFor(() => expect(screen.getByTestId("suggest-title")).toHaveValue("短标题"));
      expect(screen.getByTestId("suggest-note")).toHaveValue("共享备注");
      expect(screen.getByText("README 未收录")).toBeVisible();
      expect(mock).toHaveBeenCalledWith(
        "/api/ai/suggest-link-org",
        expect.objectContaining({ body: JSON.stringify({ linkId: 1 }) }),
      );
    } finally {
      mock.mockRestore();
    }
  });
});
