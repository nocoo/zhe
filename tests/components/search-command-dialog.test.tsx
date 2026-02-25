import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Link, Folder } from "@/models/types";

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
  loading: false,
  siteUrl: "https://zhe.to",
};

vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardState: () => mockState,
}));

vi.mock("@/models/tags", () => ({
  getTagColorClassesByName: (name: string) => ({
    badge: `mock-badge-${name}`,
    dot: `mock-dot-${name}`,
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
  expect(item!.textContent).toContain(text);
}

/**
 * Assert that no [cmdk-item] with the given slug is present in the document.
 */
function expectNoItem(slug: string) {
  expect(getCmdkItem(slug)).toBeNull();
}

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
      expect(screen.getByPlaceholderText("搜索链接、标题、备注、标签...")).toBeInTheDocument();
    });

    it("does not render content when closed", () => {
      renderDialog({ open: false });
      expect(screen.queryByPlaceholderText("搜索链接、标题、备注、标签...")).not.toBeInTheDocument();
    });

    it("shows hint text when search input is empty", () => {
      renderDialog();
      expect(screen.getByText("输入关键词搜索链接")).toBeInTheDocument();
      expect(screen.getByText("支持搜索短链、URL、标题、描述、备注、标签")).toBeInTheDocument();
    });

    it("shows empty state when query has no matches", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "nonexistent");
      expect(screen.getByText("没有找到匹配的链接")).toBeInTheDocument();
    });

    it("renders link items with title and short URL when query matches", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com/page", metaTitle: "Example Page" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expectItemWithText("abc", "zhe.to/abc");
      expectItemWithText("abc", "Example Page");
    });

    it("shows folder name for links in a folder", async () => {
      mockState.folders = [makeFolder({ id: "f1", name: "Work" })];
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: "f1" })];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expect(screen.getByText("Work")).toBeInTheDocument();
    });

    it("does not show folder name for uncategorized links", async () => {
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: null })];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expect(screen.queryByText("Work")).not.toBeInTheDocument();
    });

    it("handles missing folder gracefully", async () => {
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: "nonexistent" })];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expectItemWithText("abc123", "zhe.to/abc123");
    });

    it("renders metaDescription when available", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com", metaDescription: "A great page" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expect(screen.getByText("A great page")).toBeInTheDocument();
    });

    it("renders note when available", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com", note: "My personal note" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expect(screen.getByText("My personal note")).toBeInTheDocument();
    });
  });

  // ── Navigation action ──

  describe("navigate to folder", () => {
    it("navigates to folder page when selecting a link with folderId", async () => {
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: "f1" })];
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abc");

      const item = getCmdkItem("abc123");
      expect(item).toBeTruthy();
      fireEvent.click(item!);

      expect(mockPush).toHaveBeenCalledWith("/dashboard?folder=f1");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("navigates to uncategorized when selecting a link without folderId", async () => {
      mockState.links = [makeLink({ id: 1, slug: "abc123", folderId: null })];
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abc");

      const item = getCmdkItem("abc123");
      expect(item).toBeTruthy();
      fireEvent.click(item!);

      expect(mockPush).toHaveBeenCalledWith("/dashboard?folder=uncategorized");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ── Copy action ──

  describe("copy short URL", () => {
    it("renders copy button for each link", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc" }),
        makeLink({ id: 2, slug: "xyz" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
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
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "test-slug");

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.click(copyBtn);

      expect(writeText).toHaveBeenCalledWith("https://zhe.to/test-slug");
    });

    it("has correct aria-label on copy button", async () => {
      mockState.links = [makeLink({ id: 1, slug: "my-link" })];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
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
      expect(screen.getByPlaceholderText("搜索链接、标题、备注、标签...")).toBeInTheDocument();
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
      expect(screen.getByText("输入关键词搜索链接")).toBeInTheDocument();
    });

    it("filters links by slug substring", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expectItemWithText("abc", "zhe.to/abc");
      expectNoItem("xyz");
      expectNoItem("hello");
    });

    it("filters links by URL substring", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "google");

      expectItemWithText("xyz", "zhe.to/xyz");
      expectNoItem("abc");
      expectNoItem("hello");
    });

    it("does not produce false positives from cross-field matching", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abcgoo");

      expectNoItem("abc");
      expectNoItem("xyz");
      expectNoItem("hello");
    });

    it("shows empty state when no links match search", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "nonexistent");

      expect(screen.getByText("没有找到匹配的链接")).toBeInTheDocument();
    });

    it("filtering is case-insensitive", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "HELLO");

      expectItemWithText("hello", "zhe.to/hello");
      expectNoItem("abc");
    });

    it("filters links by metaTitle substring", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "react-docs", originalUrl: "https://react.dev", metaTitle: "React Documentation" }),
        makeLink({ id: 2, slug: "vue-guide", originalUrl: "https://vuejs.org", metaTitle: "Vue.js Guide" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "documentation");

      expectItemWithText("react-docs", "zhe.to/react-docs");
      expectNoItem("vue-guide");
    });

    it("filters links by note substring", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "ref", originalUrl: "https://a.com", note: "Important reference" }),
        makeLink({ id: 2, slug: "temp", originalUrl: "https://b.com", note: "Temporary" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "important");

      expectItemWithText("ref", "zhe.to/ref");
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
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "UI");

      expectItemWithText("design", "zhe.to/design");
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
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
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
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
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
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "docs");

      expectItemWithText("docs", "API Reference");
    });

    it("falls back to hostname when metaTitle is null", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "docs", originalUrl: "https://example.com/docs", metaTitle: null }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
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

    it("does not trigger navigation when copy button is clicked", async () => {
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "test-slug");

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.click(copyBtn);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://zhe.to/test-slug");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("closes dialog after copying", async () => {
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "test-slug");

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.click(copyBtn);

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it("copies on Enter keydown without triggering navigation", async () => {
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "test-slug");

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.keyDown(copyBtn, { key: "Enter" });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://zhe.to/test-slug");
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // ── Search filtering edge cases ──

  describe("search filtering edge cases", () => {
    it("filters links by metaDescription substring", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "lib", originalUrl: "https://a.com", metaDescription: "A library for building UIs" }),
        makeLink({ id: 2, slug: "server", originalUrl: "https://b.com", metaDescription: "Server-side rendering" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "building");

      expectItemWithText("lib", "zhe.to/lib");
      expectNoItem("server");
    });

    it("does not match protocol prefix in URL", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "site", originalUrl: "https://example.com" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "https");

      expectNoItem("site");
      expect(screen.getByText("没有找到匹配的链接")).toBeInTheDocument();
    });

    it("searches Chinese characters correctly", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "docs", originalUrl: "https://a.com", metaTitle: "前端开发指南" }),
        makeLink({ id: 2, slug: "api", originalUrl: "https://b.com", metaTitle: "API Reference" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "前端");

      expectItemWithText("docs", "zhe.to/docs");
      expectNoItem("api");
    });

    it("trims whitespace from search query", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com" }),
        makeLink({ id: 2, slug: "xyz", originalUrl: "https://other.com" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "  abc  ");

      expectItemWithText("abc", "zhe.to/abc");
      expectNoItem("xyz");
    });
  });

  // ── Tag badge edge cases ──

  describe("tag badge edge cases", () => {
    it("does not render tag badge elements for link with no tags", async () => {
      mockState.links = [makeLink({ id: 1, slug: "no-tags" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "SomeTag", color: "#ff0000", createdAt: new Date() },
      ];
      mockState.linkTags = [];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "no-tags");

      expect(screen.queryByText("SomeTag")).not.toBeInTheDocument();
    });

    it("renders exactly 1 badge for link with 1 tag", async () => {
      mockState.links = [makeLink({ id: 1, slug: "one-tag" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Solo", color: "#ff0000", createdAt: new Date() },
      ];
      mockState.linkTags = [{ linkId: 1, tagId: "t1" }];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "one-tag");

      expect(screen.getByText("Solo")).toBeInTheDocument();
    });

    it("renders tag badges with Tailwind color classes from name", async () => {
      mockState.links = [makeLink({ id: 1, slug: "styled" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Styled", color: "blue", createdAt: new Date() },
      ];
      mockState.linkTags = [{ linkId: 1, tagId: "t1" }];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "styled");

      const badge = screen.getByText("Styled");
      expect(badge.className).toContain("mock-badge-Styled");
    });
  });

  // ── Keyword highlighting ──

  describe("keyword highlighting", () => {
    it("highlights matching keyword in title", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "react", originalUrl: "https://react.dev", metaTitle: "React Documentation" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "react");

      // The <mark> element should contain the matched text
      const marks = document.querySelectorAll("mark");
      const markTexts = Array.from(marks).map((m) => m.textContent?.toLowerCase());
      expect(markTexts).toContain("react");
    });

    it("highlights matching keyword in description", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "lib", originalUrl: "https://a.com", metaDescription: "A library for building UIs" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "building");

      const marks = document.querySelectorAll("mark");
      const markTexts = Array.from(marks).map((m) => m.textContent?.toLowerCase());
      expect(markTexts).toContain("building");
    });

    it("highlights matching keyword in short URL", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "my-link", originalUrl: "https://example.com" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "my-link");

      const marks = document.querySelectorAll("mark");
      const markTexts = Array.from(marks).map((m) => m.textContent?.toLowerCase());
      expect(markTexts).toContain("my-link");
    });
  });
});
