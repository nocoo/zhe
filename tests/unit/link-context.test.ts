import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadLinkOrgContext } from "@/lib/ai/link-context";
import { executeD1Query } from "@/lib/db/d1-client";
import type { ScopedDB } from "@/lib/db/scoped";

vi.mock("@/lib/db/d1-client", () => ({
  executeD1Query: vi.fn(),
}));

describe("loadLinkOrgContext", () => {
  const mockDb = {
    getFolders: vi.fn(),
    getTags: vi.fn(),
    getTagsForLink: vi.fn(),
  } as unknown as ScopedDB;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockDb.getFolders).mockResolvedValue([
      { id: "f1", name: "Work", userId: "u1", icon: "folder", createdAt: new Date(1) },
      { id: "f2", name: "Reading", userId: "u1", icon: "folder", createdAt: new Date(1) },
    ]);
    vi.mocked(mockDb.getTags).mockResolvedValue([
      { id: "t1", name: "ai", color: "#111", userId: "u1", createdAt: new Date(1) },
      { id: "t2", name: "tools", color: "#222", userId: "u1", createdAt: new Date(1) },
    ]);
    vi.mocked(mockDb.getTagsForLink).mockResolvedValue([
      { id: "t1", name: "ai", color: "#111", userId: "u1", createdAt: new Date(1) },
    ]);
  });

  it("returns null when no row is found", async () => {
    vi.mocked(executeD1Query).mockResolvedValue([]);
    const result = await loadLinkOrgContext(mockDb, "u1", 123);
    expect(result).toBeNull();
  });

  it("handles empty link metadata and triggers warning notice", async () => {
    const rawRow = {
      id: 1,
      user_id: "u1",
      slug: "abc",
      original_url: "https://example.com/item",
      title: null,
      note: null,
      folder_id: null,
      meta_title: null,
      meta_description: null,
      meta_favicon: null,
      screenshot_url: null,
      clicks: 0,
      created_at: 1000,
      updated_at: 1000,
      revision: 4,
      x_json: null,
      github_json: null,
    };
    vi.mocked(executeD1Query).mockResolvedValue([rawRow]);

    const result = await loadLinkOrgContext(mockDb, "u1", 1);
    expect(result).not.toBeNull();
    expect(result?.supplied).toEqual(["URL"]);
    expect(result?.notices).toContain("来源资料较少，请核对生成内容");
    expect(result?.historicalAnalysis).toBeNull();
    expect(result?.revision).toBe(4);
    expect(result?.prompt).toContain('"url":"https://example.com/item"');
    expect(result?.prompt).toContain('"folder":"Inbox"');
  });

  it("handles link metadata, note, screenshot, favicon, and matches folder", async () => {
    const rawRow = {
      id: 2,
      user_id: "u1",
      slug: "def",
      original_url: "https://example.com/with-meta",
      title: "My Title",
      note: "My Note",
      folder_id: "f2",
      meta_title: "Original Title",
      meta_description: "Original Description",
      meta_favicon: "https://example.com/fav.ico",
      screenshot_url: "https://example.com/shot.png",
      clicks: 5,
      created_at: 1000,
      updated_at: 1000,
      revision: 2,
      x_json: null,
      github_json: null,
    };
    vi.mocked(executeD1Query).mockResolvedValue([rawRow]);

    const result = await loadLinkOrgContext(mockDb, "u1", 2);
    expect(result).not.toBeNull();
    expect(result?.supplied).toEqual(["URL", "原始标题", "原始简介", "已有整理"]);
    expect(result?.notices).not.toContain("来源资料较少，请核对生成内容");
    expect(result?.prompt).toContain('"folder":"Reading"');
    expect(result?.prompt).toContain('"tags":"ai"');
  });

  it("handles X bookmarks json", async () => {
    const rawRow = {
      id: 3,
      user_id: "u1",
      slug: "x1",
      original_url: "https://x.com/user/status/123",
      title: null,
      note: null,
      folder_id: null,
      meta_title: null,
      meta_description: null,
      meta_favicon: null,
      screenshot_url: null,
      clicks: 0,
      created_at: 1000,
      updated_at: 1000,
      revision: 1,
      x_json: JSON.stringify({ tweet: { text: "Hello X" } }),
      github_json: null,
    };
    vi.mocked(executeD1Query).mockResolvedValue([rawRow]);

    const result = await loadLinkOrgContext(mockDb, "u1", 3);
    expect(result?.supplied).toContain("X 帖子与媒体资料");
    expect(result?.prompt).toContain("Hello X");
  });

  it("handles GitHub bookmarks json with and without readme and analysis", async () => {
    // 1. With analysis and empty readme
    const rawRow1 = {
      id: 4,
      user_id: "u1",
      slug: "gh1",
      original_url: "https://github.com/nocoo/zhe",
      title: null,
      note: null,
      folder_id: null,
      meta_title: null,
      meta_description: null,
      meta_favicon: null,
      screenshot_url: null,
      clicks: 0,
      created_at: 1000,
      updated_at: 1000,
      revision: 1,
      x_json: null,
      github_json: JSON.stringify({
        repo: "nocoo/zhe",
        analysis: { summary: "Zhe tool" },
        readme: "   ",
      }),
    };
    vi.mocked(executeD1Query).mockResolvedValue([rawRow1]);

    const res1 = await loadLinkOrgContext(mockDb, "u1", 4);
    expect(res1?.historicalAnalysis).toEqual({ summary: "Zhe tool" });
    expect(res1?.supplied).toContain("GitHub 仓库资料");
    expect(res1?.supplied).not.toContain("README 全文");
    expect(res1?.notices).toContain("README 未收录，本次使用已有资料整理");

    // 2. With readme non-empty
    const rawRow2 = {
      ...rawRow1,
      github_json: JSON.stringify({
        repo: "nocoo/zhe",
        analysis: null,
        readme: "# Zhe\nReadme text",
      }),
    };
    vi.mocked(executeD1Query).mockResolvedValue([rawRow2]);

    const res2 = await loadLinkOrgContext(mockDb, "u1", 4);
    expect(res2?.historicalAnalysis).toBeNull();
    expect(res2?.supplied).toContain("GitHub 仓库资料");
    expect(res2?.supplied).toContain("README 全文");
    expect(res2?.notices).not.toContain("README 未收录，本次使用已有资料整理");
  });
});
