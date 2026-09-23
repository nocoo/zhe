import { describe, expect, it } from "vitest";
import {
  ideaDetailToResponse,
  ideaListItemToResponse,
  linkToResponse,
  tagToResponse,
  uploadToResponse,
} from "@/lib/api/serializers";
import type { Link, Tag, Upload } from "@/lib/db/schema";
import type { IdeaDetail, IdeaListItem } from "@/lib/db/scoped/types";

const createdAt = new Date("2026-09-01T00:00:00Z");
const expiresAt = new Date("2026-12-01T00:00:00Z");

const link: Link = {
  id: 7,
  userId: "u1",
  folderId: null,
  originalUrl: "https://example.com/page",
  slug: "example",
  isCustom: true,
  isHidden: false,
  expiresAt,
  clicks: 12,
  title: "Example",
  metaTitle: null,
  metaDescription: "A page",
  metaFavicon: null,
  screenshotUrl: "https://cdn/z/example.png",
  note: null,
  createdAt,
};

const linkNoExpiry: Link = { ...link, id: 8, slug: "no-expiry", expiresAt: null };

const tag: Tag = {
  id: "t1",
  userId: "u1",
  name: "docs",
  color: "#3366cc",
  createdAt,
};

describe("linkToResponse", () => {
  it("embeds tags and ISO date fields when tags and expiry are provided", () => {
    const res = linkToResponse(link, [tag]);
    expect(res).toEqual({
      id: 7,
      slug: "example",
      originalUrl: "https://example.com/page",
      shortUrl: "https://zhe.to/example",
      folderId: null,
      isCustom: true,
      clicks: 12,
      title: "Example",
      note: null,
      metaTitle: null,
      metaDescription: "A page",
      screenshotUrl: "https://cdn/z/example.png",
      tagIds: ["t1"],
      expiresAt: expiresAt.toISOString(),
      createdAt: createdAt.toISOString(),
      tags: [tagToResponse(tag)],
    });
  });

  it("defaults to empty tags and null expiry when omitted", () => {
    const res = linkToResponse(linkNoExpiry);
    expect(res.tagIds).toEqual([]);
    expect(res.tags).toEqual([]);
    expect(res.expiresAt).toBeNull();
  });
});

describe("idea serializers", () => {
  const item: IdeaListItem = {
    id: 3,
    title: "Idea",
    excerpt: "Short",
    tagIds: ["t1"],
    createdAt,
    updatedAt: createdAt,
  };

  it("serializes list items without content", () => {
    expect(ideaListItemToResponse(item)).toEqual({
      id: 3,
      title: "Idea",
      excerpt: "Short",
      tagIds: ["t1"],
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    });
  });

  it("serializes details including content", () => {
    const detail: IdeaDetail = { ...item, content: "# Body" };
    expect(ideaDetailToResponse(detail).content).toBe("# Body");
    expect(ideaDetailToResponse(detail).excerpt).toBe("Short");
  });
});

describe("uploadToResponse", () => {
  it("serializes upload fields", () => {
    const upload: Upload = {
      id: 9,
      userId: "u1",
      key: "u/file.png",
      fileName: "file.png",
      fileType: "image/png",
      fileSize: 1024,
      publicUrl: "https://cdn/u/file.png",
      createdAt,
    };
    expect(uploadToResponse(upload)).toEqual({
      id: 9,
      key: "u/file.png",
      fileName: "file.png",
      fileType: "image/png",
      fileSize: 1024,
      publicUrl: "https://cdn/u/file.png",
      createdAt: createdAt.toISOString(),
    });
  });
});
