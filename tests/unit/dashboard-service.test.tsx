import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import type { Link, Folder, Tag, LinkTag } from "@/models/types";
import type { DashboardService } from "@/contexts/dashboard-service";

// ── Mocks ──

vi.mock("@/actions/dashboard", () => ({
  getDashboardData: vi.fn(),
}));

vi.mock("@/actions/links", () => ({
  getLinks: vi.fn(),
}));

import { getDashboardData } from "@/actions/dashboard";
import { getLinks } from "@/actions/links";
import {
  DashboardServiceProvider,
  useDashboardService,
} from "@/contexts/dashboard-service";

// ── Helpers ──

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 1,
    userId: "user-1",
    folderId: null,
    originalUrl: "https://example.com",
    slug: "abc123",
    isCustom: false,
    expiresAt: null,
    clicks: 0,
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
    screenshotUrl: null,
    note: null,
    createdAt: new Date("2026-01-15"),
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    userId: "user-1",
    name: "Work",
    icon: "briefcase",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: "tag-1",
    userId: "user-1",
    name: "important",
    color: "red",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function makeLinkTag(overrides: Partial<LinkTag> = {}): LinkTag {
  return {
    linkId: 1,
    tagId: "tag-1",
    ...overrides,
  };
}

function wrapper({
  initialFolders = [],
}: { initialFolders?: Folder[] } = {}) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <DashboardServiceProvider initialFolders={initialFolders}>
        {children}
      </DashboardServiceProvider>
    );
  };
}

// Helper: render hook and wait for initial fetch to settle
async function renderService(opts?: { initialFolders?: Folder[] }) {
  let hook!: ReturnType<typeof renderHook<DashboardService, unknown>>;
  await act(async () => {
    hook = renderHook(() => useDashboardService(), {
      wrapper: wrapper(opts),
    });
  });
  await waitFor(() => {
    expect(hook.result.current.loading).toBe(false);
  });
  return hook;
}

/**
 * Helper to set up getDashboardData mock with specific links/tags/linkTags.
 * Merges provided data with empty defaults.
 */
function mockDashboardData(data: {
  links?: Link[];
  tags?: Tag[];
  linkTags?: LinkTag[];
} = {}) {
  vi.mocked(getDashboardData).mockResolvedValue({
    success: true,
    data: {
      links: data.links ?? [],
      tags: data.tags ?? [],
      linkTags: data.linkTags ?? [],
    },
  });
}

// ── Tests ──

describe("DashboardService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getDashboardData resolves with empty arrays
    mockDashboardData();
    // Default: getLinks (used by refreshLinks) resolves with empty array
    vi.mocked(getLinks).mockResolvedValue({ success: true, data: [] });
  });

  afterEach(() => {
    cleanup();
  });

  // ── Provider basics ──

  describe("provider basics", () => {
    it("throws when useDashboardService is called outside provider", () => {
      // Suppress console.error from React error boundary
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => renderHook(() => useDashboardService())).toThrow(
        "useDashboardState must be used within a DashboardServiceProvider",
      );
      spy.mockRestore();
    });

    it("renders without crashing", async () => {
      const { result } = await renderService();
      expect(result.current).toBeDefined();
    });
  });

  // ── Initialization ──

  describe("initialization", () => {
    it("initializes folders from initialFolders prop", async () => {
      const folders = [makeFolder(), makeFolder({ id: "folder-2", name: "Personal" })];
      const { result } = await renderService({ initialFolders: folders });
      expect(result.current.folders).toEqual(folders);
    });

    it("starts with loading=true and empty links", () => {
      // Make getDashboardData hang (never resolve) — special case, don't use renderService
      vi.mocked(getDashboardData).mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useDashboardService(), {
        wrapper: wrapper(),
      });
      expect(result.current.loading).toBe(true);
      expect(result.current.links).toEqual([]);
    });

    it("fetches links on mount and sets loading=false", async () => {
      const links = [makeLink(), makeLink({ id: 2, slug: "xyz" })];
      mockDashboardData({ links });

      const { result } = await renderService();

      expect(result.current.links).toEqual(links);
      expect(getDashboardData).toHaveBeenCalledOnce();
    });

    it("sets links=[] and loading=false when getDashboardData fails", async () => {
      vi.mocked(getDashboardData).mockResolvedValue({
        success: false,
        error: "Unauthorized",
      });

      const { result } = await renderService();
      expect(result.current.links).toEqual([]);
    });

    it("sets links=[] when getDashboardData returns no data", async () => {
      vi.mocked(getDashboardData).mockResolvedValue({ success: true });

      const { result } = await renderService();
      expect(result.current.links).toEqual([]);
    });

    it("provides siteUrl from window.location.origin", async () => {
      const { result } = await renderService();
      expect(result.current.siteUrl).toBe(window.location.origin);
    });
  });

  // ── Links CRUD ──

  describe("links CRUD", () => {
    it("handleLinkCreated prepends a link to the list", async () => {
      const existing = makeLink({ id: 1, slug: "old" });
      mockDashboardData({ links: [existing] });

      const { result } = await renderService();

      const newLink = makeLink({ id: 2, slug: "new" });
      act(() => {
        result.current.handleLinkCreated(newLink);
      });

      expect(result.current.links).toHaveLength(2);
      expect(result.current.links[0]).toEqual(newLink);
      expect(result.current.links[1]).toEqual(existing);
    });

    it("handleLinkDeleted removes a link by id", async () => {
      const links = [
        makeLink({ id: 1, slug: "a" }),
        makeLink({ id: 2, slug: "b" }),
        makeLink({ id: 3, slug: "c" }),
      ];
      mockDashboardData({ links });

      const { result } = await renderService();

      act(() => {
        result.current.handleLinkDeleted(2);
      });

      expect(result.current.links).toHaveLength(2);
      expect(result.current.links.map((l) => l.id)).toEqual([1, 3]);
    });

    it("handleLinkDeleted is a no-op for non-existent id", async () => {
      const links = [makeLink({ id: 1 })];
      mockDashboardData({ links });

      const { result } = await renderService();

      act(() => {
        result.current.handleLinkDeleted(999);
      });

      expect(result.current.links).toHaveLength(1);
    });

    it("handleLinkUpdated replaces a link by id", async () => {
      const original = makeLink({ id: 1, originalUrl: "https://old.com" });
      mockDashboardData({ links: [original] });

      const { result } = await renderService();

      const updated = makeLink({ id: 1, originalUrl: "https://new.com" });
      act(() => {
        result.current.handleLinkUpdated(updated);
      });

      expect(result.current.links[0].originalUrl).toBe("https://new.com");
    });

    it("handleLinkUpdated is a no-op for non-existent id", async () => {
      const links = [makeLink({ id: 1, originalUrl: "https://example.com" })];
      mockDashboardData({ links });

      const { result } = await renderService();

      act(() => {
        result.current.handleLinkUpdated(
          makeLink({ id: 999, originalUrl: "https://nope.com" }),
        );
      });

      expect(result.current.links).toHaveLength(1);
      expect(result.current.links[0].originalUrl).toBe("https://example.com");
    });
  });

  // ── Folders CRUD ──

  describe("folders CRUD", () => {
    it("handleFolderCreated appends a folder", async () => {
      const initial = makeFolder({ id: "f1", name: "Work" });
      const { result } = await renderService({ initialFolders: [initial] });

      const newFolder = makeFolder({ id: "f2", name: "Personal" });
      act(() => {
        result.current.handleFolderCreated(newFolder);
      });

      expect(result.current.folders).toHaveLength(2);
      expect(result.current.folders[1]).toEqual(newFolder);
    });

    it("handleFolderDeleted removes a folder by id", async () => {
      const folders = [
        makeFolder({ id: "f1", name: "Work" }),
        makeFolder({ id: "f2", name: "Personal" }),
      ];
      const { result } = await renderService({ initialFolders: folders });

      act(() => {
        result.current.handleFolderDeleted("f1");
      });

      expect(result.current.folders).toHaveLength(1);
      expect(result.current.folders[0].id).toBe("f2");
    });

    it("handleFolderDeleted cascades: clears folderId on associated links", async () => {
      const folders = [makeFolder({ id: "f1" })];
      const links = [
        makeLink({ id: 1, folderId: "f1" }),
        makeLink({ id: 2, folderId: "f2" }),
        makeLink({ id: 3, folderId: null }),
      ];
      mockDashboardData({ links });

      const { result } = await renderService({ initialFolders: folders });

      act(() => {
        result.current.handleFolderDeleted("f1");
      });

      // Link 1 had folderId=f1, should now be null
      expect(result.current.links[0].folderId).toBeNull();
      // Link 2 had folderId=f2, unaffected
      expect(result.current.links[1].folderId).toBe("f2");
      // Link 3 was already null
      expect(result.current.links[2].folderId).toBeNull();
    });

    it("handleFolderDeleted does not affect links of other folders", async () => {
      const links = [
        makeLink({ id: 1, folderId: "f1" }),
        makeLink({ id: 2, folderId: "f2" }),
      ];
      mockDashboardData({ links });

      const { result } = await renderService({
        initialFolders: [
          makeFolder({ id: "f1" }),
          makeFolder({ id: "f2" }),
        ],
      });

      act(() => {
        result.current.handleFolderDeleted("f1");
      });

      // f2 link untouched
      expect(result.current.links[1].folderId).toBe("f2");
    });

    it("handleFolderUpdated replaces a folder by id", async () => {
      const initial = makeFolder({ id: "f1", name: "Work" });
      const { result } = await renderService({ initialFolders: [initial] });

      const updated = makeFolder({ id: "f1", name: "Office", icon: "building" });
      act(() => {
        result.current.handleFolderUpdated(updated);
      });

      expect(result.current.folders[0].name).toBe("Office");
      expect(result.current.folders[0].icon).toBe("building");
    });

    it("handleFolderUpdated is a no-op for non-existent id", async () => {
      const initial = makeFolder({ id: "f1", name: "Work" });
      const { result } = await renderService({ initialFolders: [initial] });

      act(() => {
        result.current.handleFolderUpdated(
          makeFolder({ id: "f999", name: "Ghost" }),
        );
      });

      expect(result.current.folders).toHaveLength(1);
      expect(result.current.folders[0].name).toBe("Work");
    });
  });

  // ── Tags CRUD ──

  describe("tags CRUD", () => {
    it("fetches tags on mount via getDashboardData", async () => {
      const tags = [makeTag(), makeTag({ id: "tag-2", name: "urgent" })];
      mockDashboardData({ tags });

      const { result } = await renderService();
      expect(result.current.tags).toEqual(tags);
      expect(getDashboardData).toHaveBeenCalledOnce();
    });

    it("sets tags=[] when getDashboardData fails", async () => {
      vi.mocked(getDashboardData).mockResolvedValue({ success: false, error: "fail" });
      const { result } = await renderService();
      expect(result.current.tags).toEqual([]);
    });

    it("handleTagCreated appends a tag", async () => {
      const { result } = await renderService();
      const tag = makeTag({ id: "t-new" });
      act(() => { result.current.handleTagCreated(tag); });
      expect(result.current.tags).toHaveLength(1);
      expect(result.current.tags[0]).toEqual(tag);
    });

    it("handleTagDeleted removes a tag by id", async () => {
      mockDashboardData({
        tags: [makeTag({ id: "t1" }), makeTag({ id: "t2" })],
      });
      const { result } = await renderService();

      act(() => { result.current.handleTagDeleted("t1"); });
      expect(result.current.tags).toHaveLength(1);
      expect(result.current.tags[0].id).toBe("t2");
    });

    it("handleTagDeleted cascades: removes link-tags for deleted tag", async () => {
      mockDashboardData({
        tags: [makeTag({ id: "t1" })],
        linkTags: [
          makeLinkTag({ linkId: 1, tagId: "t1" }),
          makeLinkTag({ linkId: 2, tagId: "t2" }),
        ],
      });

      const { result } = await renderService();
      act(() => { result.current.handleTagDeleted("t1"); });

      expect(result.current.linkTags).toHaveLength(1);
      expect(result.current.linkTags[0].tagId).toBe("t2");
    });

    it("handleTagUpdated replaces a tag by id", async () => {
      mockDashboardData({
        tags: [makeTag({ id: "t1", name: "old" })],
      });
      const { result } = await renderService();

      act(() => {
        result.current.handleTagUpdated(makeTag({ id: "t1", name: "new", color: "blue" }));
      });

      expect(result.current.tags[0].name).toBe("new");
      expect(result.current.tags[0].color).toBe("blue");
    });
  });

  // ── Link-Tags CRUD ──

  describe("link-tags CRUD", () => {
    it("fetches linkTags on mount via getDashboardData", async () => {
      const lts = [makeLinkTag({ linkId: 1, tagId: "t1" })];
      mockDashboardData({ linkTags: lts });

      const { result } = await renderService();
      expect(result.current.linkTags).toEqual(lts);
      expect(getDashboardData).toHaveBeenCalledOnce();
    });

    it("sets linkTags=[] when getDashboardData fails", async () => {
      vi.mocked(getDashboardData).mockResolvedValue({ success: false, error: "fail" });
      const { result } = await renderService();
      expect(result.current.linkTags).toEqual([]);
    });

    it("handleLinkTagAdded appends a link-tag association", async () => {
      const { result } = await renderService();
      const lt = makeLinkTag({ linkId: 5, tagId: "t3" });
      act(() => { result.current.handleLinkTagAdded(lt); });
      expect(result.current.linkTags).toHaveLength(1);
      expect(result.current.linkTags[0]).toEqual(lt);
    });

    it("handleLinkTagRemoved removes by linkId+tagId", async () => {
      mockDashboardData({
        linkTags: [
          makeLinkTag({ linkId: 1, tagId: "t1" }),
          makeLinkTag({ linkId: 1, tagId: "t2" }),
          makeLinkTag({ linkId: 2, tagId: "t1" }),
        ],
      });

      const { result } = await renderService();
      act(() => { result.current.handleLinkTagRemoved(1, "t1"); });

      expect(result.current.linkTags).toHaveLength(2);
      expect(result.current.linkTags.find(
        (lt) => lt.linkId === 1 && lt.tagId === "t1"
      )).toBeUndefined();
    });
  });

  // ── Callback stability ──

  describe("callback stability", () => {
    it("all callbacks maintain referential identity across renders", async () => {
      const { result, rerender } = await renderService();

      const first = { ...result.current };

      rerender();

      expect(result.current.handleLinkCreated).toBe(first.handleLinkCreated);
      expect(result.current.handleLinkDeleted).toBe(first.handleLinkDeleted);
      expect(result.current.handleLinkUpdated).toBe(first.handleLinkUpdated);
      expect(result.current.handleFolderCreated).toBe(first.handleFolderCreated);
      expect(result.current.handleFolderDeleted).toBe(first.handleFolderDeleted);
      expect(result.current.handleFolderUpdated).toBe(first.handleFolderUpdated);
      expect(result.current.handleTagCreated).toBe(first.handleTagCreated);
      expect(result.current.handleTagDeleted).toBe(first.handleTagDeleted);
      expect(result.current.handleTagUpdated).toBe(first.handleTagUpdated);
      expect(result.current.handleLinkTagAdded).toBe(first.handleLinkTagAdded);
      expect(result.current.handleLinkTagRemoved).toBe(first.handleLinkTagRemoved);
    });
  });

  // ── Combined operations ──

  describe("combined operations", () => {
    it("supports creating a link then deleting it", async () => {
      const { result } = await renderService();

      const link = makeLink({ id: 42, slug: "temp" });

      act(() => {
        result.current.handleLinkCreated(link);
      });
      expect(result.current.links).toHaveLength(1);

      act(() => {
        result.current.handleLinkDeleted(42);
      });
      expect(result.current.links).toHaveLength(0);
    });

    it("supports creating a folder, assigning a link, then deleting the folder", async () => {
      const { result } = await renderService();

      // Create folder
      const folder = makeFolder({ id: "f-new" });
      act(() => {
        result.current.handleFolderCreated(folder);
      });

      // Create link in that folder
      const link = makeLink({ id: 10, folderId: "f-new" });
      act(() => {
        result.current.handleLinkCreated(link);
      });
      expect(result.current.links[0].folderId).toBe("f-new");

      // Delete folder — link should cascade
      act(() => {
        result.current.handleFolderDeleted("f-new");
      });

      expect(result.current.folders).toHaveLength(0);
      expect(result.current.links[0].folderId).toBeNull();
    });

    it("supports updating a link's folderId then deleting that folder", async () => {
      const links = [makeLink({ id: 1, folderId: null })];
      mockDashboardData({ links });

      const { result } = await renderService({
        initialFolders: [makeFolder({ id: "f1" })],
      });

      // Move link into folder
      act(() => {
        result.current.handleLinkUpdated(makeLink({ id: 1, folderId: "f1" }));
      });
      expect(result.current.links[0].folderId).toBe("f1");

      // Delete folder
      act(() => {
        result.current.handleFolderDeleted("f1");
      });
      expect(result.current.links[0].folderId).toBeNull();
    });
  });
});
