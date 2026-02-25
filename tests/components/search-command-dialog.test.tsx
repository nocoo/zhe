import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Link, Folder } from "@/models/types";

// ── Mocks ──

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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

    it("shows empty state when no links", () => {
      renderDialog();
      expect(screen.getByText("没有找到匹配的链接")).toBeInTheDocument();
    });

    it("renders link items with short URL and original URL", () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com/page" }),
      ];
      renderDialog();

      expect(screen.getByText("zhe.to/abc")).toBeInTheDocument();
      expect(screen.getByText("example.com/page")).toBeInTheDocument();
    });

    it("renders multiple links", () => {
      mockState.links = [
        makeLink({ id: 1, slug: "first", originalUrl: "https://one.com" }),
        makeLink({ id: 2, slug: "second", originalUrl: "https://two.com" }),
      ];
      renderDialog();

      expect(screen.getByText("zhe.to/first")).toBeInTheDocument();
      expect(screen.getByText("zhe.to/second")).toBeInTheDocument();
    });

    it("shows folder name for links in a folder", () => {
      mockState.folders = [makeFolder({ id: "f1", name: "Work" })];
      mockState.links = [makeLink({ id: 1, folderId: "f1" })];
      renderDialog();

      expect(screen.getByText("Work")).toBeInTheDocument();
    });

    it("does not show folder name for uncategorized links", () => {
      mockState.links = [makeLink({ id: 1, folderId: null })];
      renderDialog();

      // "Work" should not appear — no folder association
      expect(screen.queryByText("Work")).not.toBeInTheDocument();
    });

    it("handles missing folder gracefully", () => {
      // Link references a folder that doesn't exist in service
      mockState.links = [makeLink({ id: 1, folderId: "nonexistent" })];
      renderDialog();

      // Should render without crashing, no folder name shown
      expect(screen.getByText("zhe.to/abc123")).toBeInTheDocument();
    });
  });

  // ── Navigation action ──

  describe("navigate to folder", () => {
    it("navigates to folder page when selecting a link with folderId", () => {
      mockState.links = [makeLink({ id: 1, folderId: "f1" })];
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      // cmdk CommandItem uses onSelect which is triggered via click
      const item = screen.getByText("zhe.to/abc123").closest("[cmdk-item]");
      expect(item).toBeTruthy();
      fireEvent.click(item!);

      expect(mockPush).toHaveBeenCalledWith("/dashboard?folder=f1");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("navigates to uncategorized when selecting a link without folderId", () => {
      mockState.links = [makeLink({ id: 1, folderId: null })];
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const item = screen.getByText("zhe.to/abc123").closest("[cmdk-item]");
      fireEvent.click(item!);

      expect(mockPush).toHaveBeenCalledWith("/dashboard?folder=uncategorized");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ── Copy action ──

  describe("copy short URL", () => {
    it("renders copy button for each link", () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc" }),
        makeLink({ id: 2, slug: "xyz" }),
      ];
      renderDialog();

      const copyButtons = screen.getAllByLabelText(/^Copy /);
      expect(copyButtons).toHaveLength(2);
    });

    it("copies short URL to clipboard when copy button clicked", async () => {
      mockState.links = [makeLink({ id: 1, slug: "test-slug" })];
      const onOpenChange = vi.fn();

      // Mock clipboard API
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText },
      });

      renderDialog({ onOpenChange });

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.click(copyBtn);

      expect(writeText).toHaveBeenCalledWith("https://zhe.to/test-slug");
    });

    it("has correct aria-label on copy button", () => {
      mockState.links = [makeLink({ id: 1, slug: "my-link" })];
      renderDialog();

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

      // Press Escape to close dialog
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

    it("shows all links when search input is empty", () => {
      renderDialog();
      expect(screen.getByText("zhe.to/abc")).toBeInTheDocument();
      expect(screen.getByText("zhe.to/xyz")).toBeInTheDocument();
      expect(screen.getByText("zhe.to/hello")).toBeInTheDocument();
    });

    it("filters links by slug substring", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "abc");

      expect(screen.getByText("zhe.to/abc")).toBeInTheDocument();
      expect(screen.queryByText("zhe.to/xyz")).not.toBeInTheDocument();
      expect(screen.queryByText("zhe.to/hello")).not.toBeInTheDocument();
    });

    it("filters links by URL substring", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "google");

      expect(screen.getByText("zhe.to/xyz")).toBeInTheDocument();
      expect(screen.queryByText("zhe.to/abc")).not.toBeInTheDocument();
      expect(screen.queryByText("zhe.to/hello")).not.toBeInTheDocument();
    });

    it("does not produce false positives from cross-field matching", async () => {
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      // "abcgoo" should NOT match — "abc" is in slug of link 1, "goo" is in URL of link 2
      await userEvent.type(input, "abcgoo");

      expect(screen.queryByText("zhe.to/abc")).not.toBeInTheDocument();
      expect(screen.queryByText("zhe.to/xyz")).not.toBeInTheDocument();
      expect(screen.queryByText("zhe.to/hello")).not.toBeInTheDocument();
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

      expect(screen.getByText("zhe.to/hello")).toBeInTheDocument();
      expect(screen.queryByText("zhe.to/abc")).not.toBeInTheDocument();
    });

    it("filters links by metaTitle substring", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "react-docs", originalUrl: "https://react.dev", metaTitle: "React Documentation" }),
        makeLink({ id: 2, slug: "vue-guide", originalUrl: "https://vuejs.org", metaTitle: "Vue.js Guide" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "documentation");

      expect(screen.getByText("zhe.to/react-docs")).toBeInTheDocument();
      expect(screen.queryByText("zhe.to/vue-guide")).not.toBeInTheDocument();
    });

    it("filters links by note substring", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "ref", originalUrl: "https://a.com", note: "Important reference" }),
        makeLink({ id: 2, slug: "temp", originalUrl: "https://b.com", note: "Temporary" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "important");

      expect(screen.getByText("zhe.to/ref")).toBeInTheDocument();
      expect(screen.queryByText("zhe.to/temp")).not.toBeInTheDocument();
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

      expect(screen.getByText("zhe.to/design")).toBeInTheDocument();
      expect(screen.queryByText("zhe.to/code")).not.toBeInTheDocument();
    });
  });

  // ── Tag badge rendering ──

  describe("tag badge rendering", () => {
    it("shows tag badges on links that have tags", () => {
      mockState.links = [makeLink({ id: 1, slug: "tagged" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Frontend", color: "#ff0000", createdAt: new Date() },
      ];
      mockState.linkTags = [{ linkId: 1, tagId: "t1" }];
      renderDialog();

      expect(screen.getByText("Frontend")).toBeInTheDocument();
    });

    it("shows at most 2 tag badges per link", () => {
      mockState.links = [makeLink({ id: 1, slug: "multi-tag" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Tag1", color: "#ff0000", createdAt: new Date() },
        { id: "t2", userId: "user-1", name: "Tag2", color: "#00ff00", createdAt: new Date() },
        { id: "t3", userId: "user-1", name: "Tag3", color: "#0000ff", createdAt: new Date() },
      ];
      mockState.linkTags = [
        { linkId: 1, tagId: "t1" },
        { linkId: 1, tagId: "t2" },
        { linkId: 1, tagId: "t3" },
      ];
      renderDialog();

      expect(screen.getByText("Tag1")).toBeInTheDocument();
      expect(screen.getByText("Tag2")).toBeInTheDocument();
      expect(screen.queryByText("Tag3")).not.toBeInTheDocument();
    });

    it("shows metaTitle instead of URL when metaTitle is available", () => {
      mockState.links = [
        makeLink({ id: 1, slug: "docs", originalUrl: "https://example.com/docs", metaTitle: "API Reference" }),
      ];
      renderDialog();

      expect(screen.getByText("API Reference")).toBeInTheDocument();
      // Original URL should not appear since metaTitle takes precedence
      expect(screen.queryByText("example.com/docs")).not.toBeInTheDocument();
    });

    it("falls back to original URL when metaTitle is null", () => {
      mockState.links = [
        makeLink({ id: 1, slug: "docs", originalUrl: "https://example.com/docs", metaTitle: null }),
      ];
      renderDialog();

      expect(screen.getByText("example.com/docs")).toBeInTheDocument();
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

    it("does not trigger navigation when copy button is clicked", () => {
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.click(copyBtn);

      // Copy should work but navigation should NOT be triggered
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://zhe.to/test-slug");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("closes dialog after copying", async () => {
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const copyBtn = screen.getByLabelText("Copy https://zhe.to/test-slug");
      fireEvent.click(copyBtn);

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it("copies on Enter keydown without triggering navigation", () => {
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

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

      expect(screen.getByText("zhe.to/lib")).toBeInTheDocument();
      expect(screen.queryByText("zhe.to/server")).not.toBeInTheDocument();
    });

    it("does not match protocol prefix in URL", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "site", originalUrl: "https://example.com" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "https");

      expect(screen.queryByText("zhe.to/site")).not.toBeInTheDocument();
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

      expect(screen.getByText("zhe.to/docs")).toBeInTheDocument();
      expect(screen.queryByText("zhe.to/api")).not.toBeInTheDocument();
    });

    it("trims whitespace from search query", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com" }),
        makeLink({ id: 2, slug: "xyz", originalUrl: "https://other.com" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、标题、备注、标签...");
      await userEvent.type(input, "  abc  ");

      expect(screen.getByText("zhe.to/abc")).toBeInTheDocument();
      expect(screen.queryByText("zhe.to/xyz")).not.toBeInTheDocument();
    });
  });

  // ── Tag badge edge cases ──

  describe("tag badge edge cases", () => {
    it("does not render tag badge elements for link with no tags", () => {
      mockState.links = [makeLink({ id: 1, slug: "no-tags" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "SomeTag", color: "#ff0000", createdAt: new Date() },
      ];
      mockState.linkTags = []; // no link-tag associations
      renderDialog();

      expect(screen.queryByText("SomeTag")).not.toBeInTheDocument();
    });

    it("renders exactly 1 badge for link with 1 tag", () => {
      mockState.links = [makeLink({ id: 1, slug: "one-tag" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Solo", color: "#ff0000", createdAt: new Date() },
      ];
      mockState.linkTags = [{ linkId: 1, tagId: "t1" }];
      renderDialog();

      expect(screen.getByText("Solo")).toBeInTheDocument();
    });

    it("renders tag badges with Tailwind color classes from name", () => {
      mockState.links = [makeLink({ id: 1, slug: "styled" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Styled", color: "blue", createdAt: new Date() },
      ];
      mockState.linkTags = [{ linkId: 1, tagId: "t1" }];
      renderDialog();

      const badge = screen.getByText("Styled");
      expect(badge.className).toContain("mock-badge-Styled");
    });
  });
});
