// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createLink, recordClick } from "@/lib/db";
import { ScopedDB } from "@/lib/db/scoped";
import { clearMockStorage } from "../mocks/db-storage";
import { unwrap } from "../test-utils";

const USER_A = "user-alice";
const USER_B = "user-bob";

const uploadInput = (
  name: string,
  overrides: Partial<Parameters<ScopedDB["createUpload"]>[0]> = {},
) => ({
  key: `20260212/${name}`,
  fileName: name,
  fileType: name.endsWith(".jpg")
    ? "image/jpeg"
    : name.endsWith(".pdf")
      ? "application/pdf"
      : "image/png",
  fileSize: 100,
  publicUrl: `https://s.zhe.to/20260212/${name}`,
  ...overrides,
});

const apiKeyInput = (
  id: string,
  overrides: Partial<Parameters<ScopedDB["createApiKey"]>[0]> = {},
) => ({
  id,
  prefix: `zhe_${id}`,
  keyHash: `hash_${id}`,
  name: `Key ${id}`,
  scopes: "links:read",
  ...overrides,
});

describe("ScopedDB", () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it("throws on empty userId", () => {
    expect(() => new ScopedDB("")).toThrow("ScopedDB requires a non-empty userId");
  });

  describe("link operations", () => {
    it("createLink assigns scoped userId, defaults optional fields, and persists provided extras", async () => {
      const db = new ScopedDB(USER_A);
      const plain = await db.createLink({ originalUrl: "https://example.com", slug: "abc" });
      expect(plain.userId).toBe(USER_A);
      expect(plain.slug).toBe("abc");
      expect(plain.screenshotUrl).toBeNull();
      expect(plain.note).toBeNull();
      expect(plain.isCustom).toBe(false);

      const expiry = new Date("2027-06-01");
      const rich = await db.createLink({
        originalUrl: "https://example.com/rich",
        slug: "with-extras",
        screenshotUrl: "https://img.example.com/shot.png",
        note: "my note",
        isCustom: true,
        expiresAt: expiry,
      });
      expect(rich.screenshotUrl).toBe("https://img.example.com/shot.png");
      expect(rich.note).toBe("my note");
      expect(rich.isCustom).toBe(true);
      expect(rich.expiresAt).toBeInstanceOf(Date);
      expect(unwrap(await db.getLinkById(rich.id)).screenshotUrl).toBe(
        "https://img.example.com/shot.png",
      );
    });

    it("getLinks, getLinkById, getLinksByIds, and deleteLink enforce user scoping", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const a1 = await dbA.createLink({ originalUrl: "https://a.com", slug: "a1" });
      const a2 = await dbA.createLink({ originalUrl: "https://a2.com", slug: "a2" });
      await dbB.createLink({ originalUrl: "https://b.com", slug: "b1" });

      const linksA = await dbA.getLinks();
      const linksB = await dbB.getLinks();
      expect(linksA).toHaveLength(2);
      expect(linksB).toHaveLength(1);
      expect(linksA.every((l) => l.userId === USER_A)).toBe(true);
      expect(linksB.every((l) => l.userId === USER_B)).toBe(true);

      expect(await dbA.getLinkById(a1.id)).not.toBeNull();
      expect(await dbB.getLinkById(a1.id)).toBeNull();

      expect(await dbA.getLinksByIds([])).toEqual([]);
      expect(await dbA.getLinksByIds([a1.id, a2.id])).toHaveLength(2);
      expect(await dbB.getLinksByIds([a1.id])).toHaveLength(0);

      expect(await dbB.deleteLink(a1.id)).toBe(false);
      expect(await dbA.deleteLink(a1.id)).toBe(true);
    });

    it("getLinks supports sorting and filtering by query, folderId, inbox, and tagId", async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: "TestFolder" });
      const tag = await db.createTag({ name: "tagged", color: "blue" });

      const low = await db.createLink({
        originalUrl: "https://low.com",
        slug: "clicks-low",
        clicks: 5,
        folderId: folder.id,
        note: "my important link",
      });
      await db.createLink({ originalUrl: "https://high.com", slug: "clicks-high", clicks: 100 });
      await db.createLink({ originalUrl: "https://mid.com", slug: "clicks-mid", clicks: 50 });
      await db.addTagToLink(low.id, tag.id);

      const asc = await db.getLinks({ sortBy: "created", sortOrder: "asc" });
      expect(asc[0]?.slug).toBe("clicks-low");

      const desc = await db.getLinks({ sortBy: "clicks", sortOrder: "desc" });
      expect(desc.map((l) => l.slug)).toEqual(["clicks-high", "clicks-mid", "clicks-low"]);

      expect((await db.getLinks({ query: "important" })).map((l) => l.slug)).toEqual([
        "clicks-low",
      ]);
      expect((await db.getLinks({ folderId: folder.id })).map((l) => l.slug)).toEqual([
        "clicks-low",
      ]);
      expect(await db.getLinks({ folderId: "inbox" })).toHaveLength(2);
      expect((await db.getLinks({ tagId: tag.id })).map((l) => l.slug)).toEqual(["clicks-low"]);
    });

    it("updateLink updates and clears fields, handles empty/cross-user/foreign-folder, and enforces slug uniqueness", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);
      const folderA = await dbA.createFolder({ name: "FolderA" });
      const folderB = await dbB.createFolder({ name: "Bob" });

      const link = await dbA.createLink({ originalUrl: "https://old.com", slug: "upd" });
      await dbA.createLink({ originalUrl: "https://taken.com", slug: "taken" });
      await dbB.createLink({ originalUrl: "https://b.com", slug: "bobs-slug" });

      expect(await dbB.updateLink(link.id, { originalUrl: "https://hacked.com" })).toBeNull();
      expect(await dbA.updateLink(99999, {})).toBeNull();
      expect(unwrap(await dbA.updateLink(link.id, {})).originalUrl).toBe("https://old.com");
      expect(await dbA.updateLink(link.id, { folderId: folderB.id })).toBeNull();

      const updated = unwrap(
        await dbA.updateLink(link.id, {
          originalUrl: "https://new.com",
          slug: "newslug",
          isCustom: true,
          screenshotUrl: "https://img.example.com/shot.png",
          folderId: folderA.id,
          expiresAt: new Date("2027-01-01"),
        }),
      );
      expect(updated).toMatchObject({
        originalUrl: "https://new.com",
        slug: "newslug",
        isCustom: true,
        screenshotUrl: "https://img.example.com/shot.png",
        folderId: folderA.id,
      });
      expect(updated.expiresAt).toBeInstanceOf(Date);
      expect(unwrap(await dbA.updateLink(link.id, { slug: "newslug" })).slug).toBe("newslug");

      const cleared = unwrap(
        await dbA.updateLink(link.id, {
          screenshotUrl: null,
          folderId: null,
          expiresAt: null,
        }),
      );
      expect(cleared.screenshotUrl).toBeNull();
      expect(cleared.folderId).toBeNull();
      expect(cleared.expiresAt).toBeNull();

      await expect(dbA.updateLink(link.id, { slug: "taken" })).rejects.toThrow(/UNIQUE constraint/);
      await expect(dbA.updateLink(link.id, { slug: "bobs-slug" })).rejects.toThrow(
        /UNIQUE constraint/,
      );
    });
  });

  describe("updateLinkMetadata, updateLinkNote, and screenshot methods", () => {
    it("updates, clears, and isolates link metadata", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);
      const link = await dbA.createLink({ originalUrl: "https://example.com", slug: "meta1" });

      expect(await dbB.updateLinkMetadata(link.id, { metaTitle: "Hacked" })).toBeNull();
      expect(await dbA.updateLinkMetadata(99999, {})).toBeNull();
      expect(unwrap(await dbA.updateLinkMetadata(link.id, {})).id).toBe(link.id);

      const partial = unwrap(await dbA.updateLinkMetadata(link.id, { metaTitle: "Only Title" }));
      expect(partial.metaTitle).toBe("Only Title");

      const full = unwrap(
        await dbA.updateLinkMetadata(link.id, {
          metaTitle: "Example",
          metaDescription: "Desc",
          metaFavicon: "https://example.com/favicon.ico",
        }),
      );
      expect(full).toMatchObject({
        metaTitle: "Example",
        metaDescription: "Desc",
        metaFavicon: "https://example.com/favicon.ico",
      });

      const cleared = unwrap(
        await dbA.updateLinkMetadata(link.id, {
          metaTitle: null,
          metaDescription: null,
          metaFavicon: null,
        }),
      );
      expect(cleared.metaTitle).toBeNull();
      expect(cleared.metaDescription).toBeNull();
      expect(cleared.metaFavicon).toBeNull();
    });

    it("updates, clears, and isolates link notes", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);
      const link = await dbA.createLink({ originalUrl: "https://example.com", slug: "note1" });

      expect(unwrap(await dbA.updateLinkNote(link.id, "this is a note")).note).toBe(
        "this is a note",
      );
      expect(unwrap(await dbA.updateLinkNote(link.id, null)).note).toBeNull();
      expect(await dbB.updateLinkNote(link.id, "hacked")).toBeNull();
      expect(await dbA.updateLinkNote(99999, "no link")).toBeNull();
    });

    it("updates and deletes link screenshots safely with R2 env checks", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);
      const link = await dbA.createLink({ originalUrl: "https://a.com", slug: "upd-ss" });

      expect(await dbB.updateLinkScreenshot(link.id, "https://hacked.png")).toBeNull();
      expect(
        unwrap(await dbA.updateLinkScreenshot(link.id, "https://r2.example.com/shot.png"))
          .screenshotUrl,
      ).toBe("https://r2.example.com/shot.png");

      expect(await dbA.deleteLinkScreenshot(999999, "https://r2.example.com/shot.png")).toBeNull();
      expect(unwrap(await dbA.deleteLinkScreenshot(link.id, "   ")).screenshotUrl).toBe(
        "https://r2.example.com/shot.png",
      );
      expect(
        unwrap(await dbA.deleteLinkScreenshot(link.id, "https://img.example.com/other.png"))
          .screenshotUrl,
      ).toBe("https://r2.example.com/shot.png");

      const oldDomain = process.env.R2_PUBLIC_DOMAIN;
      const oldSalt = process.env.R2_USER_HASH_SALT;
      try {
        delete process.env.R2_PUBLIC_DOMAIN;
        await expect(
          dbA.deleteLinkScreenshot(link.id, "https://r2.example.com/shot.png"),
        ).rejects.toThrow("R2 screenshot storage is not configured");

        process.env.R2_PUBLIC_DOMAIN = "r2.example.com";
        process.env.R2_USER_HASH_SALT = "testsalt";
        const cleared = await dbA.deleteLinkScreenshot(link.id, "https://r2.example.com/shot.png");
        expect(unwrap(cleared).screenshotUrl).toBeNull();
      } finally {
        if (oldDomain !== undefined) process.env.R2_PUBLIC_DOMAIN = oldDomain;
        else delete process.env.R2_PUBLIC_DOMAIN;
        if (oldSalt !== undefined) process.env.R2_USER_HASH_SALT = oldSalt;
        else delete process.env.R2_USER_HASH_SALT;
      }
    });
  });

  describe("analytics operations", () => {
    it("enforces link ownership and aggregates device/browser/OS breakdowns", async () => {
      const linkA = await createLink({ userId: USER_A, originalUrl: "https://a.com", slug: "aa" });
      const linkB = await createLink({ userId: USER_B, originalUrl: "https://b.com", slug: "ab" });
      const emptyLink = await createLink({
        userId: USER_A,
        originalUrl: "https://empty.com",
        slug: "empty",
      });

      await recordClick({
        linkId: linkA.id,
        device: "desktop",
        browser: "Chrome",
        os: "macOS",
        country: "US",
      });
      await recordClick({
        linkId: linkA.id,
        device: "desktop",
        browser: "Chrome",
        os: "Windows",
        country: "DE",
      });
      await recordClick({
        linkId: linkA.id,
        device: "mobile",
        browser: "Safari",
        os: "iOS",
        country: "US",
      });
      await recordClick({ linkId: linkB.id, country: "JP" });

      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      expect(await dbA.getAnalyticsByLinkId(linkA.id)).toHaveLength(3);
      expect(await dbA.getAnalyticsByLinkId(linkB.id)).toHaveLength(0);
      expect(await dbB.getAnalyticsByLinkId(linkB.id)).toHaveLength(1);

      const statsA = await dbA.getAnalyticsStats(linkA.id);
      expect(statsA.totalClicks).toBe(3);
      expect(statsA.uniqueCountries).toEqual(expect.arrayContaining(["US", "DE"]));
      expect(statsA.deviceBreakdown).toEqual({ desktop: 2, mobile: 1 });
      expect(statsA.browserBreakdown).toEqual({ Chrome: 2, Safari: 1 });
      expect(statsA.osBreakdown).toEqual({ macOS: 1, Windows: 1, iOS: 1 });

      expect((await dbB.getAnalyticsStats(linkA.id)).totalClicks).toBe(0);
      expect(await dbA.getAnalyticsStats(emptyLink.id)).toMatchObject({
        totalClicks: 0,
        uniqueCountries: [],
        deviceBreakdown: {},
        browserBreakdown: {},
        osBreakdown: {},
      });
    });
  });

  describe("folder operations", () => {
    it("supports CRUD, partial updates, isolation, and cascades folder_id to null on delete", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      expect(await dbA.getFolders()).toEqual([]);

      const folderA = await dbA.createFolder({ name: "Work", icon: "briefcase" });
      const folderDefault = await dbA.createFolder({ name: "Default" });
      await dbB.createFolder({ name: "Bob Folder" });

      expect(folderA.userId).toBe(USER_A);
      expect(folderA.createdAt).toBeInstanceOf(Date);
      expect(folderDefault.icon).toBe("folder");

      expect(await dbA.getFolders()).toHaveLength(2);
      expect(await dbB.getFolders()).toHaveLength(1);
      expect(unwrap(await dbA.getFolderById(folderA.id)).name).toBe("Work");
      expect(await dbB.getFolderById(folderA.id)).toBeNull();
      expect(await dbA.getFolderById("non-existent-id")).toBeNull();

      expect(unwrap(await dbA.updateFolder(folderA.id, {})).name).toBe("Work");
      expect(unwrap(await dbA.updateFolder(folderA.id, { name: "Renamed" }))).toMatchObject({
        name: "Renamed",
        icon: "briefcase",
      });
      expect(unwrap(await dbA.updateFolder(folderA.id, { icon: "rocket" }))).toMatchObject({
        name: "Renamed",
        icon: "rocket",
      });
      expect(
        unwrap(await dbA.updateFolder(folderA.id, { name: "New", icon: "star" })),
      ).toMatchObject({ name: "New", icon: "star" });
      expect(await dbB.updateFolder(folderA.id, { name: "Hacked" })).toBeNull();

      const link = await dbA.createLink({
        originalUrl: "https://example.com",
        slug: "folder-link",
        folderId: folderA.id,
      });
      expect(link.folderId).toBe(folderA.id);

      expect(await dbB.deleteFolder(folderA.id)).toBe(false);
      expect(await dbA.deleteFolder(folderA.id)).toBe(true);
      expect(unwrap((await dbA.getLinks())[0]).folderId).toBeNull();
    });

    it("getFoldersWithLinkCount counts owned folders accurately including zero-count folders", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const folderA = await dbA.createFolder({ name: "Folder A" });
      const emptyFolder = await dbA.createFolder({ name: "Empty Folder" });
      await dbB.createFolder({ name: "Bob Folder" });

      await dbA.createLink({ originalUrl: "https://a1.com", slug: "a1", folderId: folderA.id });
      await dbA.createLink({ originalUrl: "https://a2.com", slug: "a2", folderId: folderA.id });

      const aliceFolders = await dbA.getFoldersWithLinkCount();
      const bobFolders = await dbB.getFoldersWithLinkCount();

      expect(aliceFolders.find((f) => f.id === folderA.id)?.linkCount).toBe(2);
      expect(aliceFolders.find((f) => f.id === emptyFolder.id)?.linkCount).toBe(0);
      expect(bobFolders).toHaveLength(1);
      expect(bobFolders[0]?.linkCount).toBe(0);
    });
  });

  describe("upload operations", () => {
    it("supports create, getUploads, getUploadById, getUploadKey, and deleteUpload with isolation", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      expect(await dbA.getUploads()).toEqual([]);

      const u1 = await dbA.createUpload(uploadInput("a1.png", { fileSize: 1024 }));
      await dbA.createUpload(uploadInput("a2.jpg", { fileSize: 200 }));
      await dbB.createUpload(uploadInput("b1.pdf", { fileSize: 300 }));

      expect(u1.userId).toBe(USER_A);
      expect(u1.id).toBeGreaterThan(0);
      expect(u1.createdAt).toBeInstanceOf(Date);

      expect(await dbA.getUploads()).toHaveLength(2);
      expect(await dbB.getUploads()).toHaveLength(1);

      expect(unwrap(await dbA.getUploadById(u1.id)).id).toBe(u1.id);
      expect(await dbB.getUploadById(u1.id)).toBeNull();

      expect(await dbA.getUploadKey(u1.id)).toBe("20260212/a1.png");
      expect(await dbB.getUploadKey(u1.id)).toBeNull();
      expect(await dbA.getUploadKey(99999)).toBeNull();

      expect(await dbB.deleteUpload(u1.id)).toBe(false);
      expect(await dbA.deleteUpload(u1.id)).toBe(true);
    });
  });

  describe("tag and link-tag operations", () => {
    it("supports tag CRUD, partial updates, and user isolation", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      expect(await dbA.getTags()).toEqual([]);

      const tag = await dbA.createTag({ name: "work", color: "blue" });
      await dbB.createTag({ name: "bob-tag", color: "red" });

      expect(tag.userId).toBe(USER_A);
      expect(tag.createdAt).toBeInstanceOf(Date);
      expect(await dbA.getTags()).toHaveLength(1);
      expect(unwrap(await dbA.getTagById(tag.id)).name).toBe("work");
      expect(await dbB.getTagById(tag.id)).toBeNull();

      expect(unwrap(await dbA.updateTag(tag.id, {})).name).toBe("work");
      expect(await dbA.updateTag("non-existent-id", {})).toBeNull();
      expect(unwrap(await dbA.updateTag(tag.id, { name: "renamed" }))).toMatchObject({
        name: "renamed",
        color: "blue",
      });
      expect(unwrap(await dbA.updateTag(tag.id, { color: "rose" }))).toMatchObject({
        name: "renamed",
        color: "rose",
      });
      expect(unwrap(await dbA.updateTag(tag.id, { name: "new", color: "red" }))).toMatchObject({
        name: "new",
        color: "red",
      });
      expect(await dbB.updateTag(tag.id, { name: "hacked" })).toBeNull();

      expect(await dbB.deleteTag(tag.id)).toBe(false);
      expect(await dbA.deleteTag(tag.id)).toBe(true);
      expect(await dbA.getTags()).toEqual([]);
    });

    it("manages link-tag associations with ownership, idempotency, and cascade deletes", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const linkA = await dbA.createLink({ originalUrl: "https://a.com", slug: "lt1" });
      const tag1 = await dbA.createTag({ name: "t1", color: "blue" });
      const tag2 = await dbA.createTag({ name: "t2", color: "red" });
      const linkB = await dbB.createLink({ originalUrl: "https://b.com", slug: "lt2" });
      const tagB = await dbB.createTag({ name: "b-tag", color: "red" });

      expect(await dbA.addTagToLink(linkA.id, tag1.id)).toBe(true);
      expect(await dbA.addTagToLink(linkA.id, tag1.id)).toBe(true);
      expect(await dbA.addTagToLink(linkA.id, tag2.id)).toBe(true);
      expect(await dbB.addTagToLink(linkA.id, tagB.id)).toBe(false);
      expect(await dbA.addTagToLink(linkA.id, tagB.id)).toBe(false);
      await dbB.addTagToLink(linkB.id, tagB.id);

      expect(await dbA.getLinkTags()).toHaveLength(2);
      expect(await dbA.getTagsForLink(linkA.id)).toHaveLength(2);
      expect(await dbB.getLinkTags()).toHaveLength(1);

      expect(await dbB.removeTagFromLink(linkA.id, tag1.id)).toBe(false);
      expect(await dbA.removeTagFromLink(99999, "fake-id")).toBe(false);
      expect(await dbA.removeTagFromLink(linkA.id, tag1.id)).toBe(true);
      expect(await dbA.getLinkTags()).toHaveLength(1);

      await dbA.deleteTag(tag2.id);
      expect(await dbA.getLinkTags()).toHaveLength(0);

      const tag3 = await dbA.createTag({ name: "t3", color: "cyan" });
      await dbA.addTagToLink(linkA.id, tag3.id);
      await dbA.deleteLink(linkA.id);
      expect(await dbA.getLinkTags()).toHaveLength(0);
    });
  });

  describe("getOverviewStats", () => {
    it("returns zeroed stats when empty and aggregates scoped links, clicks, and uploads", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      expect(await dbA.getOverviewStats()).toMatchObject({
        totalLinks: 0,
        totalClicks: 0,
        totalUploads: 0,
        totalStorageBytes: 0,
        clickTrend: [],
        uploadTrend: [],
        topLinks: [],
        deviceBreakdown: {},
        browserBreakdown: {},
        osBreakdown: {},
        fileTypeBreakdown: {},
      });

      const linkLow = await dbA.createLink({
        originalUrl: "https://low.com",
        slug: "ov-low",
        clicks: 5,
      });
      const linkHigh = await dbA.createLink({
        originalUrl: "https://high.com",
        slug: "ov-high",
        clicks: 100,
      });
      const linkMid = await dbA.createLink({
        originalUrl: "https://mid.com",
        slug: "ov-mid",
        clicks: 50,
      });
      const linkB = await dbB.createLink({
        originalUrl: "https://b.com",
        slug: "ov-b",
        clicks: 20,
      });

      await recordClick({
        linkId: linkLow.id,
        device: "desktop",
        browser: "Chrome",
        os: "macOS",
        country: "US",
      });
      await recordClick({
        linkId: linkLow.id,
        device: "mobile",
        browser: "Safari",
        os: "iOS",
        country: "JP",
      });
      await recordClick({
        linkId: linkMid.id,
        device: "desktop",
        browser: "Chrome",
        os: "Windows",
        country: "DE",
      });
      await recordClick({ linkId: linkB.id, device: "desktop", browser: "Edge", os: "Windows" });

      await dbA.createUpload(uploadInput("ov1.png", { fileSize: 1024 }));
      await dbA.createUpload(uploadInput("ov2.jpg", { fileSize: 2048 }));
      await dbB.createUpload(uploadInput("bob.png", { fileSize: 700 }));

      const statsA = await dbA.getOverviewStats();
      expect(statsA.totalLinks).toBe(3);
      expect(statsA.totalClicks).toBe(158);
      expect(statsA.clickTrend).toHaveLength(1);
      expect(unwrap(statsA.clickTrend[0])).toMatchObject({ clicks: 3, origin: 3, worker: 0 });
      expect(statsA.deviceBreakdown).toEqual({ desktop: 2, mobile: 1 });
      expect(statsA.browserBreakdown).toEqual({ Chrome: 2, Safari: 1 });
      expect(statsA.osBreakdown).toEqual({ macOS: 1, iOS: 1, Windows: 1 });
      expect(statsA.topLinks.map((l) => l.slug)).toEqual([
        linkHigh.slug,
        linkMid.slug,
        linkLow.slug,
      ]);
      expect(statsA.totalUploads).toBe(2);
      expect(statsA.totalStorageBytes).toBe(3072);
      expect(statsA.uploadTrend).toHaveLength(1);
      expect(statsA.fileTypeBreakdown).toEqual({ "image/png": 1, "image/jpeg": 1 });

      const statsB = await dbB.getOverviewStats();
      expect(statsB.totalLinks).toBe(1);
      expect(statsB.totalUploads).toBe(1);
      expect(statsB.totalStorageBytes).toBe(700);
    });
  });

  describe("settings, webhooks, and api keys", () => {
    it("manages user preview settings with user isolation", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      expect(await dbA.getUserSettings()).toBeNull();
      expect((await dbA.upsertPreviewStyle("screenshot")).previewStyle).toBe("screenshot");
      expect(await dbB.getUserSettings()).toBeNull();
      expect((await dbA.upsertPreviewStyle("favicon")).previewStyle).toBe("favicon");
      expect(unwrap(await dbA.getUserSettings()).previewStyle).toBe("favicon");
    });

    it("manages webhooks (upsert, rate limit, delete) with user isolation", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      expect(await dbA.getWebhook()).toBeNull();
      expect(await dbA.updateWebhookRateLimit(10)).toBeNull();
      expect(await dbA.deleteWebhook()).toBe(false);

      const first = await dbA.upsertWebhook("tok_old");
      expect(first).toMatchObject({ userId: USER_A, token: "tok_old", rateLimit: 5 });
      const second = await dbA.upsertWebhook("tok_new");
      expect(second.id).toBe(first.id);
      expect(second.token).toBe("tok_new");

      await dbB.upsertWebhook("tok_bob");
      expect(unwrap(await dbA.updateWebhookRateLimit(20)).rateLimit).toBe(20);
      expect(await dbA.deleteWebhook()).toBe(true);
      expect(await dbA.getWebhook()).toBeNull();
      expect(unwrap(await dbB.getWebhook()).token).toBe("tok_bob");
    });

    it("manages Backy, Xray, AI settings, and Backy pull webhook without clobbering sibling keys", async () => {
      const db = new ScopedDB(USER_A);
      const aiData = {
        provider: "anthropic",
        apiKey: "sk-test-key-1234",
        model: "claude-sonnet-4-5",
        baseURL: null,
        sdkType: null,
        authType: null,
      };

      expect(await db.getBackySettings()).toBeNull();
      expect(await db.getXraySettings()).toBeNull();
      expect(await db.getBackyPullWebhook()).toBeNull();
      expect(await db.deleteBackyPullWebhook()).toBeNull();
      expect(await db.getAiSettings()).toEqual({
        provider: null,
        apiKey: null,
        model: null,
        baseURL: null,
        sdkType: null,
        authType: null,
      });

      await db.upsertPreviewStyle("favicon");
      expect(await db.getBackySettings()).toBeNull();

      await db.upsertBackySettings({
        webhookUrl: "https://backy.example.com/hook",
        apiKey: "backy-key",
      });
      await db.upsertXraySettings({
        apiUrl: "https://xray.example.com/api",
        apiToken: "xray-token",
      });
      await db.upsertAiSettings(aiData);

      expect(await db.getBackySettings()).toEqual({
        webhookUrl: "https://backy.example.com/hook",
        apiKey: "backy-key",
      });
      expect(await db.getXraySettings()).toEqual({
        apiUrl: "https://xray.example.com/api",
        apiToken: "xray-token",
      });
      expect(await db.getAiSettings()).toEqual(aiData);

      await db.upsertBackySettings({
        webhookUrl: "https://backy.example.com/hook-2",
        apiKey: "backy-key-2",
      });
      expect(await db.getAiSettings()).toEqual(aiData);

      await db.upsertBackyPullWebhook({ key: "pull-key-123" });
      expect(unwrap(await db.getBackyPullWebhook()).key).toBe("pull-key-123");
      expect(await db.deleteBackyPullWebhook()).not.toBeNull();
      expect(await db.getBackyPullWebhook()).toBeNull();
    });

    it("manages API keys (create, list, revoke, lastUsedAt) with user isolation", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const k1 = await dbA.createApiKey(apiKeyInput("key-a1"));
      await dbA.createApiKey(apiKeyInput("key-a2", { scopes: "links:write" }));
      await dbB.createApiKey(apiKeyInput("key-b1"));

      expect(k1).toMatchObject({ userId: USER_A, name: "Key key-a1", revokedAt: null });
      expect(await dbA.getApiKeys()).toHaveLength(2);
      expect(await dbB.getApiKeys()).toHaveLength(1);

      await dbA.updateApiKeyLastUsed("key-a1");
      expect((await dbA.getApiKeys()).find((k) => k.id === "key-a1")).toBeDefined();

      expect(await dbB.revokeApiKey("key-a1")).toBeNull();
      expect((await dbA.revokeApiKey("key-a1"))?.revokedAt).not.toBeNull();
      expect(await dbA.getApiKeys()).toHaveLength(1);
    });
  });

  describe("idea operations", () => {
    it("creates ideas with excerpts and valid tags, and rejects invalid/foreign tags", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);
      const tag1 = await dbA.createTag({ name: "work", color: "blue" });
      const tag2 = await dbA.createTag({ name: "project", color: "green" });
      const bobTag = await dbB.createTag({ name: "bob-tag", color: "red" });

      const plain = await dbA.createIdea({
        content:
          "# My Idea\n\nThis is **bold** and *italic* text with a [link](https://example.com).",
      });
      expect(plain.title).toBeNull();
      expect(plain.excerpt).toBe("My Idea This is bold and italic text with a link.");
      expect(plain.tagIds).toEqual([]);

      const tagged = await dbA.createIdea({
        title: "My Title",
        content: "Tagged idea",
        tagIds: [tag1.id, tag2.id],
      });
      expect(tagged.title).toBe("My Title");
      expect(tagged.tagIds).toEqual(expect.arrayContaining([tag1.id, tag2.id]));

      const emptyTags = await dbA.createIdea({ content: "No tags", tagIds: [] });
      expect(emptyTags.tagIds).toEqual([]);

      await expect(
        dbA.createIdea({ content: "Body", tagIds: ["non-existent-tag"] }),
      ).rejects.toThrow("Invalid tag IDs: non-existent-tag");
      await expect(dbA.createIdea({ content: "Body", tagIds: [bobTag.id] })).rejects.toThrow(
        `Invalid tag IDs: ${bobTag.id}`,
      );
    });

    it("lists, filters, reads detail, updates, and deletes ideas with tag sync and isolation", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);
      expect(await dbA.getIdeas()).toEqual([]);

      const tag1 = await dbA.createTag({ name: "t1", color: "blue" });
      const tag2 = await dbA.createTag({ name: "t2", color: "green" });
      const tagB = await dbB.createTag({ name: "tb", color: "red" });

      const idea = await dbA.createIdea({
        title: "ML Project",
        content: "Machine learning notes",
        tagIds: [tag1.id],
      });
      await dbA.createIdea({ title: "Cooking", content: "Recipe for pasta" });
      await dbB.createIdea({ content: "Bob idea", tagIds: [tagB.id] });

      const listA = await dbA.getIdeas();
      expect(listA).toHaveLength(2);
      expect((unwrap(listA[0]) as unknown as Record<string, unknown>).content).toBeUndefined();
      expect(await dbA.getIdeas({ tagId: tag1.id })).toHaveLength(1);
      expect(unwrap((await dbA.getIdeas({ query: "pasta" }))[0]).title).toBe("Cooking");

      expect(await dbA.getIdeaById(999)).toBeNull();
      expect(await dbB.getIdeaById(idea.id)).toBeNull();
      expect(unwrap(await dbA.getIdeaById(idea.id)).content).toBe("Machine learning notes");

      await new Promise((r) => setTimeout(r, 10));
      const updated = unwrap(
        await dbA.updateIdea(idea.id, {
          title: "New Title",
          content: "New content",
          tagIds: [tag2.id],
        }),
      );
      expect(updated.title).toBe("New Title");
      expect(updated.excerpt).toBe("New content");
      expect(updated.tagIds).toEqual([tag2.id]);
      expect(updated.updatedAt.getTime()).toBeGreaterThan(idea.updatedAt.getTime());

      expect(unwrap(await dbA.updateIdea(idea.id, { title: null })).tagIds).toEqual([tag2.id]);
      expect(unwrap(await dbA.updateIdea(idea.id, { tagIds: [] })).tagIds).toEqual([]);
      await expect(dbA.updateIdea(idea.id, { tagIds: ["missing"] })).rejects.toThrow(
        "Invalid tag IDs: missing",
      );
      expect(await dbA.updateIdea(999, { title: "New" })).toBeNull();
      expect(await dbB.updateIdea(idea.id, { title: "Hacked" })).toBeNull();

      await dbA.updateIdea(idea.id, { tagIds: [tag1.id] });
      expect(await dbA.getIdeaTags()).toHaveLength(1);
      expect(await dbB.getIdeaTags()).toHaveLength(1);

      expect(await dbA.deleteIdea(999)).toBe(false);
      expect(await dbB.deleteIdea(idea.id)).toBe(false);
      expect(await dbA.deleteIdea(idea.id)).toBe(true);
      expect(await dbA.getIdeaTags()).toHaveLength(0);
    });
  });

  describe("pagination (getLinksPage & getIdeasPage)", () => {
    it("getLinksPage paginates, sorts, filters by query, and scopes by user", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.createLink({ originalUrl: "https://low.com", slug: "p1", clicks: 5 });
      await dbA.createLink({
        originalUrl: "https://high.com",
        slug: "p2",
        clicks: 100,
        note: "unique-kw",
      });
      await dbA.createLink({ originalUrl: "https://mid.com", slug: "p3", clicks: 50 });
      await dbB.createLink({ originalUrl: "https://b1.com", slug: "usr-b1" });

      const page1 = await dbA.getLinksPage({
        sortBy: "clicks",
        sortOrder: "desc",
        limit: 2,
        offset: 0,
      });
      const page2 = await dbA.getLinksPage({
        sortBy: "clicks",
        sortOrder: "desc",
        limit: 2,
        offset: 2,
      });
      expect(page1.total).toBe(3);
      expect(page1.items.map((l) => l.slug)).toEqual(["p2", "p3"]);
      expect(page2.items.map((l) => l.slug)).toEqual(["p1"]);

      const queryPage = await dbA.getLinksPage({ query: "unique-kw", limit: 10, offset: 0 });
      expect(queryPage.total).toBe(1);
      expect(queryPage.items[0]?.slug).toBe("p2");

      const pageB = await dbB.getLinksPage({ limit: 10, offset: 0 });
      expect(pageB.total).toBe(1);
    });

    it("getIdeasPage paginates, sorts by createdAt desc, filters by tagId, and scopes by user", async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);
      const tag = await dbA.createTag({ name: "page-tag", color: "red" });

      const idea1 = await dbA.createIdea({ content: "First", tagIds: [tag.id] });
      await new Promise((r) => setTimeout(r, 5));
      await dbA.createIdea({ content: "Second", tagIds: [tag.id] });
      await new Promise((r) => setTimeout(r, 5));
      const idea3 = await dbA.createIdea({ content: "Third" });
      await dbB.createIdea({ content: "B idea" });

      const page1 = await dbA.getIdeasPage({ limit: 2, offset: 0 });
      const page2 = await dbA.getIdeasPage({ limit: 2, offset: 2 });
      expect(page1.total).toBe(3);
      expect(page1.items[0]?.id).toBe(idea3.id);
      expect(page2.items.map((i) => i.id)).toEqual([idea1.id]);

      const tagPage = await dbA.getIdeasPage({ tagId: tag.id, limit: 10, offset: 0 });
      expect(tagPage.total).toBe(2);
      expect(tagPage.items).toHaveLength(2);

      expect((await dbB.getIdeasPage({ limit: 10, offset: 0 })).total).toBe(1);
    });
  });
});
