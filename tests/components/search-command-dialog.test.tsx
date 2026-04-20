// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unwrap } from "../test-utils";
import { makeLink, makeFolder } from "../fixtures";

// ── Mocks ──

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock next/image as a simple <img>
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { unoptimized: _, fill: _f, ...rest } = props;
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
    return <img {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} />;
  },
}));

// Mock DashboardService context
import type { DashboardState } from "@/contexts/dashboard-service";

const mockState: DashboardState = {
  links: [],
  folders: [],
  tags: [],
  linkTags: [],
  ideas: [],
  loading: false,
  ideasLoading: false,
  siteUrl: "https://zhe.to",
};

const mockActions = {
  ensureIdeasLoaded: vi.fn(),
};

vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardState: () => mockState,
  useDashboardActions: () => mockActions,
}));

vi.mock("@/models/tags", () => ({
  getTagStyles: (name: string) => ({
    badge: { backgroundColor: `mock-bg-${name}`, color: `mock-color-${name}` },
    dot: { backgroundColor: `mock-dot-${name}` },
  }),
}));

import { SearchCommandDialog } from "@/components/search-command-dialog";

// ── Helpers ──

/**
 * Find a [cmdk-item] element by its data-value attribute (which equals link.slug).
 * This is reliable even when HighlightText splits text across multiple DOM elements.
 */
function getCmdkItem(slug: string): HTMLElement | null {
  return document.querySelector(`[cmdk-item][data-value="${slug}"]`);
}

/**
 * Assert that a [cmdk-item] exists and contains the given text somewhere in its textContent.
 * Works with HighlightText which splits text across <span> and <mark> elements.
 */
function expectItemWithText(slug: string, text: string) {
  const item = getCmdkItem(slug);
  expect(item).toBeTruthy();
  expect(unwrap(item).textContent).toContain(text);
}

/**
 * Assert that no [cmdk-item] with the given slug is present in the document.
 */
function expectNoItem(slug: string) {
  expect(getCmdkItem(slug)).toBeNull();
}

function renderDialog(props: { open?: boolean; onOpenChange?: () => void } = {}) {
  return render(
    <SearchCommandDialog
      open={props.open ?? true}
      onOpenChange={props.onOpenChange ?? vi.fn()}
    />,
  );
}

// ── Tests ──

describe("SearchCommandDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.links = [];
    mockState.folders = [];
    mockState.tags = [];
    mockState.linkTags = [];
    mockState.siteUrl = "https://zhe.to";
  });

  afterEach(() => {
    cleanup();
  });

  // ── Rendering ──

  describe("rendering", () => {
    it("renders the search input when open", () => {
      renderDialog();
      expect(screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...")).toBeInTheDocument();
    });

    it("does not render content when closed", () => {
      renderDialog({ open: false });
      expect(screen.queryByPlaceholderText("搜索链接、想法、标题、备注、标签...")).not.toBeInTheDocument();
    });

    it("shows hint text when search input is empty", () => {
      renderDialog();
      expect(screen.getByText("输入关键词搜索")).toBeInTheDocument();
      expect(screen.getByText("支持搜索短链、URL、标题、描述、备注、想法、标签")).toBeInTheDocument();
    });

    it("shows empty state when query has no matches", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "nonexistent");
      expect(screen.getByText("没有找到匹配的结果")).toBeInTheDocument();
    });

    it("renders link items with title and slug when query matches", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com/page", metaTitle: "Example Page" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expectItemWithText("abc", "abc");
      expectItemWithText("abc", "Example Page");
      // Should NOT show full short URL (zhe.to/abc), only the slug
      const item = getCmdkItem("abc");
      expect(unwrap(item).textContent).not.toContain("zhe.to/");
    });

    it("shows folder name for links in a folder", async () => {
      mockState.folders = [makeFolder({ id: "f1", name: "Work" })];
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: "f1" })];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expect(screen.getByText("Work")).toBeInTheDocument();
    });

    it("does not show folder name for uncategorized links", async () => {
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: null })];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expect(screen.queryByText("Work")).not.toBeInTheDocument();
    });

    it("handles missing folder gracefully", async () => {
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: "nonexistent" })];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expectItemWithText("abc123", "abc123");
    });

    it("renders metaDescription when available", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com", metaDescription: "A great page" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expect(screen.getByText("A great page")).toBeInTheDocument();
    });

    it("renders note when available", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com", note: "My personal note" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expect(screen.getByText("My personal note")).toBeInTheDocument();
    });
  });

  // ── Click action: open original URL ──

  describe("open original URL on click", () => {
    it("opens original URL in new tab when selecting a link", async () => {
      const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      mockState.links = [makeLink({ id: 1, slug: "abc123", originalUrl: "https://example.com/page" })];
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      const item = getCmdkItem("abc123");
      expect(item).toBeTruthy();
      fireEvent.click(unwrap(item));

      expect(windowOpenSpy).toHaveBeenCalledWith("https://example.com/page", "_blank", "noopener,noreferrer");
      expect(onOpenChange).toHaveBeenCalledWith(false);
      windowOpenSpy.mockRestore();
    });

    it("does not navigate to folder when clicking an item", async () => {
      const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: "f1" })];
      renderDialog();

      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      const item = getCmdkItem("abc123");
      fireEvent.click(unwrap(item));

      expect(mockPush).not.toHaveBeenCalled();
      windowOpenSpy.mockRestore();
    });
  });

  // ── Folder click navigation ──

  describe("folder click navigation", () => {
    it("navigates to folder page when clicking the folder button", async () => {
      const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      mockState.folders = [makeFolder({ id: "f1", name: "Work" })];
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: "f1" })];
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      const folderButton = screen.getByText("Work");
      fireEvent.click(folderButton);

      expect(mockPush).toHaveBeenCalledWith("/dashboard?folder=f1");
      expect(onOpenChange).toHaveBeenCalledWith(false);
      // Should NOT open the original URL when clicking folder
      expect(windowOpenSpy).not.toHaveBeenCalled();
      windowOpenSpy.mockRestore();
    });

    it("folder button does not appear for uncategorized links", async () => {
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: null })];
      renderDialog();

      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      // No folder button should exist
      const folderButtons = document.querySelectorAll("button");
      const folderBtn = Array.from(folderButtons).find((b) => b.textContent?.includes("Work"));
      expect(folderBtn).toBeUndefined();
    });
  });

  // ── Copy action ──

  describe("copy short URL", () => {
    it("renders copy button for each link next to slug", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc" }),
        makeLink({ id: 2, slug: "xyz" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "example");

      const copyButtons = screen.getAllByLabelText(/^Copy /);
      expect(copyButtons).toHaveLength(2);
    });

    it("copies short URL to clipboard when copy button clicked", async () => {
      mockState.links = [makeLink({ id: 1, slug: "test-slug" })];
      const onOpenChange = vi.fn();

      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText },
      });

      renderDialog({ onOpenChange });
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "test-slug");

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.click(copyBtn);

      expect(writeText).toHaveBeenCalledWith("https://zhe.to/test-slug");
    });

    it("has correct aria-label on copy button", async () => {
      mockState.links = [makeLink({ id: 1, slug: "my-link" })];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "my-link");

      expect(
        screen.getByLabelText("Copy https://zhe.to/my-link"),
      ).toBeInTheDocument();
    });
  });

  // ── Dialog state ──

  describe("dialog state", () => {
    it("passes open prop to CommandDialog", () => {
      renderDialog({ open: true });
      expect(screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...")).toBeInTheDocument();
    });

    it("calls onOpenChange when dialog is dismissed", () => {
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      fireEvent.keyDown(document, { key: "Escape" });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ── Search filtering ──

  describe("search filtering", () => {
    beforeEach(() => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com" }),
        makeLink({ id: 2, slug: "xyz", originalUrl: "https://google.com/search" }),
        makeLink({ id: 3, slug: "hello", originalUrl: "https://world.org" }),
      ];
    });

    it("does not show links when search input is empty", () => {
      renderDialog();
      expectNoItem("abc");
      expectNoItem("xyz");
      expectNoItem("hello");
      // Should show hint instead
      expect(screen.getByText("输入关键词搜索")).toBeInTheDocument();
    });

    it("filters links by slug substring", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expectItemWithText("abc", "abc");
      expectNoItem("xyz");
      expectNoItem("hello");
    });

    it("filters links by URL substring", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "google");

      expectItemWithText("xyz", "xyz");
      expectNoItem("abc");
      expectNoItem("hello");
    });

    it("does not produce false positives from cross-field matching", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "abcgoo");

      expectNoItem("abc");
      expectNoItem("xyz");
      expectNoItem("hello");
    });

    it("shows empty state when no links match search", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "nonexistent");

      expect(screen.getByText("没有找到匹配的结果")).toBeInTheDocument();
    });

    it("filtering is case-insensitive", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "HELLO");

      expectItemWithText("hello", "hello");
      expectNoItem("abc");
    });

    it("filters links by metaTitle substring", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "react-docs", originalUrl: "https://react.dev", metaTitle: "React Documentation" }),
        makeLink({ id: 2, slug: "vue-guide", originalUrl: "https://vuejs.org", metaTitle: "Vue.js Guide" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "documentation");

      expectItemWithText("react-docs", "react-docs");
      expectNoItem("vue-guide");
    });

    it("filters links by note substring", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "ref", originalUrl: "https://a.com", note: "Important reference" }),
        makeLink({ id: 2, slug: "temp", originalUrl: "https://b.com", note: "Temporary" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "important");

      expectItemWithText("ref", "ref");
      expectNoItem("temp");
    });

    it("filters links by tag name", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "design", originalUrl: "https://figma.com" }),
        makeLink({ id: 2, slug: "code", originalUrl: "https://github.com" }),
      ];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "UI", color: "#ff0000", createdAt: new Date() },
        { id: "t2", userId: "user-1", name: "Dev", color: "#0000ff", createdAt: new Date() },
      ];
      mockState.linkTags = [
        { linkId: 1, tagId: "t1" },
        { linkId: 2, tagId: "t2" },
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "UI");

      expectItemWithText("design", "design");
      expectNoItem("code");
    });
  });

  // ── Tag badge rendering ──

  describe("tag badge rendering", () => {
    it("shows tag badges on links that have tags", async () => {
      mockState.links = [makeLink({ id: 1, slug: "tagged" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Frontend", color: "#ff0000", createdAt: new Date() },
      ];
      mockState.linkTags = [{ linkId: 1, tagId: "t1" }];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "tagged");

      expect(screen.getByText("Frontend")).toBeInTheDocument();
    });

    it("shows at most 3 tag badges per link", async () => {
      mockState.links = [makeLink({ id: 1, slug: "multi-tag" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Tag1", color: "#ff0000", createdAt: new Date() },
        { id: "t2", userId: "user-1", name: "Tag2", color: "#00ff00", createdAt: new Date() },
        { id: "t3", userId: "user-1", name: "Tag3", color: "#0000ff", createdAt: new Date() },
        { id: "t4", userId: "user-1", name: "Tag4", color: "#ffff00", createdAt: new Date() },
      ];
      mockState.linkTags = [
        { linkId: 1, tagId: "t1" },
        { linkId: 1, tagId: "t2" },
        { linkId: 1, tagId: "t3" },
        { linkId: 1, tagId: "t4" },
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "multi");

      expect(screen.getByText("Tag1")).toBeInTheDocument();
      expect(screen.getByText("Tag2")).toBeInTheDocument();
      expect(screen.getByText("Tag3")).toBeInTheDocument();
      expect(screen.queryByText("Tag4")).not.toBeInTheDocument();
      // Should show "+1" overflow indicator
      expect(screen.getByText("+1")).toBeInTheDocument();
    });

    it("shows metaTitle in search results when available", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "docs", originalUrl: "https://example.com/docs", metaTitle: "API Reference" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "docs");

      expectItemWithText("docs", "API Reference");
    });

    it("falls back to hostname when metaTitle is null", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "docs", originalUrl: "https://example.com/docs", metaTitle: null }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "docs");

      expectItemWithText("docs", "example.com");
    });
  });

  // ── Copy button interaction details ──

  describe("copy button behavior", () => {
    beforeEach(() => {
      mockState.links = [makeLink({ id: 1, slug: "test-slug" })];
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
    });

    it("does not open original URL when copy button is clicked", async () => {
      const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "test-slug");

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.click(copyBtn);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://zhe.to/test-slug");
      expect(windowOpenSpy).not.toHaveBeenCalled();
      windowOpenSpy.mockRestore();
    });

    it("closes dialog after copying", async () => {
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "test-slug");

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.click(copyBtn);

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), { interval: 5 });
    });

    it("copies on Enter keydown without opening original URL", async () => {
      const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      await userEvent.type(input, "test-slug");

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.keyDown(copyBtn, { key: "Enter" });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://zhe.to/test-slug");
      expect(windowOpenSpy).not.toHaveBeenCalled();
      windowOpenSpy.mockRestore();
    });
  });
});
