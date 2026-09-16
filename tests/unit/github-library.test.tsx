// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadGitHubBookmarks,
  loadGitHubReadme,
  retryGitHubBookmarkAction,
} from "@/actions/github-connector";
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
vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useLinkCardViewModel: () => ({ isDeleting: false, handleDelete: vi.fn() }),
}));
vi.mock("@/components/dashboard/link-card-parts/inline-edit-area", () => ({
  InlineEditArea: () => <div>编辑仓库分类和标签</div>,
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
  handleLinkUpdated: callbacks.onLinkUpdated,
  handleLinkDeleted: vi.fn(),
  handleTagCreated: callbacks.onTagCreated,
  handleLinkTagAdded: callbacks.onLinkTagAdded,
  handleLinkTagRemoved: callbacks.onLinkTagRemoved,
} as unknown as DashboardService;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.mocked(useDashboardService).mockReturnValue(service);
  vi.mocked(loadGitHubBookmarks).mockResolvedValue({ success: true, data: [bookmark] });
  vi.mocked(loadGitHubReadme).mockResolvedValue({ success: true, data: repository });
  vi.mocked(retryGitHubBookmarkAction).mockResolvedValue({ success: true });
});

describe("GitHub collection", () => {
  it("shows repository statistics, categories and named tags in its own layout", async () => {
    render(<GitHubLibraryPage />);
    expect(await screen.findByText("1,234")).toBeVisible();
    expect(screen.getByText("76")).toBeVisible();
    expect(screen.getByText("TypeScript")).toBeVisible();
    expect(screen.getByText("工具")).toBeVisible();
    expect(screen.getByText("已读")).toBeVisible();
    expect(screen.getByText("分支 main")).toBeVisible();
    expect(screen.getAllByTestId("github-repository")).toHaveLength(2);
    expect(loadGitHubReadme).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索 GitHub 收藏" }), {
      target: { value: "TypeScript" },
    });
    expect(screen.getAllByTestId("github-repository")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "absent" } });
    expect(screen.getByText("没有符合条件的 GitHub 收藏")).toBeVisible();
  });
  it("combines folder and tag filters and supports metric sorting", async () => {
    const user = userEvent.setup();
    render(<GitHubLibraryPage />);
    await screen.findByText("1,234");
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

function renderCard(value: GitHubBookmark | undefined = bookmark) {
  const refresh = vi.fn();
  return {
    refresh,
    ...render(
      <GitHubRepositoryCard
        link={link}
        bookmark={value}
        folders={[folder]}
        tags={[tag]}
        linkTags={[{ linkId: 1, tagId: tag.id }]}
        siteUrl="https://zhe.to"
        editCallbacks={callbacks}
        onDelete={vi.fn()}
        onRefresh={refresh}
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
    const { refresh } = renderCard({
      ...bookmark,
      state: "failed",
      errorCode: "github_rate_limited",
      repository: { ...summary, archived: true },
    });
    fireEvent.click(screen.getByRole("button", { name: "编辑 GitHub 收藏" }));
    expect(screen.getByText("编辑仓库分类和标签")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭编辑" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("已归档")).toBeVisible();
    expect(screen.getByText("GitHub 暂时限制访问，稍后重试")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重新采集 GitHub 仓库" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByText("1,234")).toBeVisible();
  });
  it.each([false, "reject"])(
    "keeps the retry control usable after a failure: %s",
    async (outcome) => {
      if (outcome === "reject")
        vi.mocked(retryGitHubBookmarkAction).mockRejectedValue(new Error("offline"));
      else vi.mocked(retryGitHubBookmarkAction).mockResolvedValue({ success: false });
      const { refresh } = renderCard();
      const button = screen.getByRole("button", { name: "重新采集 GitHub 仓库" });
      fireEvent.click(button);
      await waitFor(() => expect(button).toBeEnabled());
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

describe("README AI analysis", () => {
  it("saves and displays the generated fields, then finds repositories by a use case", async () => {
    const analysis = {
      summary: "整理个人收藏的工具",
      features: ["全文归档"],
      useCases: ["离线研究"],
      techStack: ["SQLite"],
      tags: ["知识管理"],
      model: "test-model",
      provider: "custom",
      generatedAt: Date.now(),
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ analysis }), { status: 200 }));
    vi.mocked(loadGitHubBookmarks)
      .mockResolvedValueOnce({ success: true, data: [bookmark] })
      .mockResolvedValue({ success: true, data: [{ ...bookmark, analysis }] });
    try {
      render(<GitHubLibraryPage />);
      await screen.findByText("1,234");
      const firstCard = screen.getAllByTestId("github-repository")[0];
      if (!firstCard) throw new Error("Missing repository card");
      fireEvent.click(within(firstCard).getByRole("button", { name: "AI 分析" }));
      const dialog = await screen.findByRole("dialog");
      expect(await within(dialog).findByText("离线研究")).toBeVisible();
      expect(within(dialog).getByText("SQLite")).toBeVisible();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/analyze-github",
        expect.objectContaining({ body: JSON.stringify({ linkId: 1 }) }),
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "关闭 AI 分析" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "离线研究" } });
      expect(screen.getAllByTestId("github-repository")).toHaveLength(1);
      expect(screen.getByText(analysis.summary)).toBeVisible();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("keeps analysis retryable and links to AI settings when configuration is missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ reason: "no_ai_config", error: "请先配置 AI" }), {
        status: 400,
      }),
    );
    try {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "AI 分析" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("请先配置 AI");
      expect(screen.getByRole("link", { name: "前往 AI 设置" })).toHaveAttribute(
        "href",
        "/dashboard/settings/ai",
      );
      expect(screen.getByRole("button", { name: "重试分析" })).toBeEnabled();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
