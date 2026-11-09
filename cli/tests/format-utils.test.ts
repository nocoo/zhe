import { describe, expect, it } from "vitest";
import type { Link } from "../src/api/types.js";
import { formatLinkDetail, formatLinksMinimal, formatLinksTable } from "../src/utils/format.js";

const baseLink = (overrides: Partial<Link> = {}): Link => ({
  id: 7,
  slug: "demo",
  shortUrl: "https://zhe.to/demo",
  originalUrl: "https://example.com/article",
  clicks: 3,
  createdAt: "2026-04-12T10:30:00.000Z",
  isCustom: false,
  expiresAt: null,
  ...overrides,
});

describe("format helpers", () => {
  it("renders tag IDs through a map when tags are absent", () => {
    const detail = formatLinkDetail(
      baseLink({ tagIds: ["tag-aaaaaaaa", "missing-tag-id"], tags: undefined }),
      undefined,
      new Map([["tag-aaaaaaaa", "work"]]),
    );
    expect(detail).toContain("Tags:         work, missing-tag-id");
  });

  it("renders metadata, notes and expiration details", () => {
    const detail = formatLinkDetail(
      baseLink({
        isCustom: true,
        title: "Saved title",
        metaTitle: "Original title",
        note: "pinned",
        expiresAt: "2026-12-01T00:00:00.000Z",
        folderId: "folder-1",
      }),
      "Inbox",
    );
    expect(detail).toContain("(custom)");
    expect(detail).toContain("Original title:");
    expect(detail).toContain("Note:         pinned");
    expect(detail).toContain("Folder:       Inbox");
    expect(detail).toContain("Expires:      2026-12-01");
  });

  it("falls back to truncated folder ids when a map entry is missing", () => {
    const table = formatLinksTable([baseLink({ folderId: "folder-abcdefghijklmnop" })], {
      wide: true,
      showFolders: true,
    });
    expect(table).toContain("folder-a");
    const compact = formatLinksTable([baseLink({ folderId: "folder-abcdefghijklmnop" })], {
      wide: false,
      showFolders: true,
    });
    expect(compact).toContain("folder-a");
  });

  it("includes folder and embedded tag columns in wide tables", () => {
    const table = formatLinksTable(
      [
        baseLink({
          folderId: "folder-1",
          tags: [{ id: "t1", name: "work", userId: "u", color: "#000", createdAt: "" }],
        }),
      ],
      { wide: true, showTags: true, folderMap: new Map([["folder-1", "Inbox"]]) },
    );
    expect(table).toContain("FOLDER");
    expect(table).toContain("TAGS");
    expect(table).toContain("work");
    expect(formatLinksMinimal([])).toBe("");
  });
});
