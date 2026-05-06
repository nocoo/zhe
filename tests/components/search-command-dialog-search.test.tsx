// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { unwrap } from "../test-utils";
import { makeLink, makeIdea } from "../fixtures";

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

const mockGetTagStyles = vi.fn((name: string) => ({
  badge: { backgroundColor: `mock-bg-${name}`, color: `mock-color-${name}` },
  dot: { backgroundColor: `mock-dot-${name}` },
}));

vi.mock("@/models/tags", () => ({
  getTagStyles: (...args: unknown[]) => mockGetTagStyles(...(args as [string])),
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

describe("SearchCommandDialog (search & ideas)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.links = [];
    mockState.folders = [];
    mockState.tags = [];
    mockState.linkTags = [];
    mockState.ideas = [];
    mockState.siteUrl = "https://zhe.to";
  });

  afterEach(() => {
    cleanup();
  });

  // ── Search filtering edge cases ──

  describe("search filtering edge cases", () => {
    it("filters links by metaDescription substring", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "lib", originalUrl: "https://a.com", metaDescription: "A library for building UIs" }),
        makeLink({ id: 2, slug: "server", originalUrl: "https://b.com", metaDescription: "Server-side rendering" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "building" } });

      expectItemWithText("lib", "lib");
      expectNoItem("server");
    });

    it("does not match protocol prefix in URL", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "site", originalUrl: "https://example.com" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "https" } });

      expectNoItem("site");
      expect(screen.getByText("没有找到匹配的结果")).toBeInTheDocument();
    });

    it("searches Chinese characters correctly", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "docs", originalUrl: "https://a.com", metaTitle: "前端开发指南" }),
        makeLink({ id: 2, slug: "api", originalUrl: "https://b.com", metaTitle: "API Reference" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "前端" } });

      expectItemWithText("docs", "docs");
      expectNoItem("api");
    });

    it("trims whitespace from search query", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com" }),
        makeLink({ id: 2, slug: "xyz", originalUrl: "https://other.com" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "  abc  " } });

      expectItemWithText("abc", "abc");
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
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "no-tags" } });

      expect(screen.queryByText("SomeTag")).not.toBeInTheDocument();
    });

    it("renders exactly 1 badge for link with 1 tag", async () => {
      mockState.links = [makeLink({ id: 1, slug: "one-tag" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Solo", color: "#ff0000", createdAt: new Date() },
      ];
      mockState.linkTags = [{ linkId: 1, tagId: "t1" }];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "one-tag" } });

      expect(screen.getByText("Solo")).toBeInTheDocument();
    });

    it("renders tag badges with inline style colors from name", async () => {
      mockState.links = [makeLink({ id: 1, slug: "styled" })];
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Styled", color: "primary", createdAt: new Date() },
      ];
      mockState.linkTags = [{ linkId: 1, tagId: "t1" }];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "styled" } });

      // The tag badge is a <span> containing a dot <span> + "Styled" text.
      // getByText returns the closest element containing the text.
      // The parent <span> has the inline style from getTagStyles().
      const badge = screen.getByText("Styled");
      // Verify the badge element (or its parent) has the rounded-full class
      // indicating it's the styled badge container
      const container = badge.closest(".rounded-full");
      expect(container).not.toBeNull();
    });
  });

  // ── Keyword highlighting ──

  describe("keyword highlighting", () => {
    it("highlights matching keyword in title", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "react", originalUrl: "https://react.dev", metaTitle: "React Documentation" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "react" } });

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
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "building" } });

      const marks = document.querySelectorAll("mark");
      const markTexts = Array.from(marks).map((m) => m.textContent?.toLowerCase());
      expect(markTexts).toContain("building");
    });

    it("highlights matching keyword in slug", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "my-link", originalUrl: "https://example.com" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "my-link" } });

      const marks = document.querySelectorAll("mark");
      const markTexts = Array.from(marks).map((m) => m.textContent?.toLowerCase());
      expect(markTexts).toContain("my-link");
    });
  });

  // ── Ideas search ──

  describe("ideas search", () => {
    beforeEach(() => {
      mockState.ideas = [];
      mockActions.ensureIdeasLoaded.mockClear();
    });

    it("calls ensureIdeasLoaded when dialog opens", () => {
      renderDialog({ open: true });
      expect(mockActions.ensureIdeasLoaded).toHaveBeenCalled();
    });

    it("renders ideas matching title", async () => {
      mockState.ideas = [
        makeIdea({ id: 1, title: "React Patterns", excerpt: "Common patterns" }),
        makeIdea({ id: 2, title: "TypeScript Guide", excerpt: "Type safety" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "react" } });

      // Should find idea-1 item
      const item = getCmdkItem("idea-1");
      expect(item).toBeTruthy();
      expect(unwrap(item).textContent).toContain("React Patterns");
      // Should not find idea-2
      expect(getCmdkItem("idea-2")).toBeNull();
    });

    it("renders ideas matching excerpt", async () => {
      mockState.ideas = [
        makeIdea({ id: 1, title: "Idea 1", excerpt: "Contains react code" }),
        makeIdea({ id: 2, title: "Idea 2", excerpt: "About databases" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "react" } });

      const item = getCmdkItem("idea-1");
      expect(item).toBeTruthy();
      expect(getCmdkItem("idea-2")).toBeNull();
    });

    it("renders ideas matching tag name", async () => {
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Frontend", color: "#ff0000", createdAt: new Date() },
      ];
      mockState.ideas = [
        makeIdea({ id: 1, title: "React App", tagIds: ["t1"] }),
        makeIdea({ id: 2, title: "Backend API", tagIds: [] }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "frontend" } });

      const item = getCmdkItem("idea-1");
      expect(item).toBeTruthy();
      expect(getCmdkItem("idea-2")).toBeNull();
    });

    it("shows idea group heading with count", async () => {
      mockState.ideas = [
        makeIdea({ id: 1, title: "React Patterns" }),
        makeIdea({ id: 2, title: "React Hooks" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "react" } });

      expect(screen.getByText("想法 (2)")).toBeInTheDocument();
    });

    it("navigates to idea editor page when clicking an idea", async () => {
      mockState.ideas = [makeIdea({ id: 1, title: "React Patterns" })];
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "react" } });

      const item = getCmdkItem("idea-1");
      fireEvent.click(unwrap(item));

      expect(mockPush).toHaveBeenCalledWith("/dashboard/ideas/1");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("uses timestamp as title when title is null", async () => {
      mockState.ideas = [
        makeIdea({ id: 1, title: null, createdAt: new Date("2026-01-15T10:30:00Z") }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      // The idea has no title but its excerpt should still match
      const idea = mockState.ideas[0];
      if (idea) idea.excerpt = "Search term here";
      fireEvent.change(input, { target: { value: "search" } });

      const item = getCmdkItem("idea-1");
      expect(item).toBeTruthy();
      // The formatted date should be in the item (e.g., "Jan 15, 2026")
      expect(unwrap(item).textContent).toContain("Jan 15, 2026");
    });

    it("displays both links and ideas when both match", async () => {
      mockState.links = [
        makeLink({ id: 1, slug: "react-docs", originalUrl: "https://react.dev", metaTitle: "React Documentation" }),
      ];
      mockState.ideas = [
        makeIdea({ id: 1, title: "React Patterns" }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "react" } });

      // Both groups should be visible
      expect(screen.getByText("链接 (1)")).toBeInTheDocument();
      expect(screen.getByText("想法 (1)")).toBeInTheDocument();
      // Both items should be visible
      expect(getCmdkItem("react-docs")).toBeTruthy();
      expect(getCmdkItem("idea-1")).toBeTruthy();
    });

    it("shows tag badges on ideas", async () => {
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "Frontend", color: "#ff0000", createdAt: new Date() },
      ];
      mockState.ideas = [
        makeIdea({ id: 1, title: "React App", tagIds: ["t1"] }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "react" } });

      // The tag should be visible in the idea item
      expect(screen.getByText("Frontend")).toBeInTheDocument();
    });

    it("passes tag.name (not tag.color) to getTagStyles for ideas (#10.1 regression)", async () => {
      mockGetTagStyles.mockClear();
      mockState.tags = [
        { id: "t1", userId: "user-1", name: "MyTag", color: "#abcdef", createdAt: new Date() },
      ];
      mockState.ideas = [
        makeIdea({ id: 1, title: "React App", tagIds: ["t1"] }),
      ];
      renderDialog();
      const input = screen.getByPlaceholderText("搜索链接、想法、标题、备注、标签...");
      fireEvent.change(input, { target: { value: "react" } });

      // getTagStyles should be called with tag.name, not tag.color
      expect(mockGetTagStyles).toHaveBeenCalledWith("MyTag");
      expect(mockGetTagStyles).not.toHaveBeenCalledWith("#abcdef");
    });
  });
});
