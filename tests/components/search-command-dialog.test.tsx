import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Link, Folder } from "@/models/types";
import type { DashboardService } from "@/contexts/dashboard-service";

// ── Mocks ──

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock DashboardService context
const mockService: DashboardService = {
  links: [],
  folders: [],
  loading: false,
  siteUrl: "https://zhe.to",
  handleLinkCreated: vi.fn(),
  handleLinkDeleted: vi.fn(),
  handleLinkUpdated: vi.fn(),
  handleFolderCreated: vi.fn(),
  handleFolderDeleted: vi.fn(),
  handleFolderUpdated: vi.fn(),
};

vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardService: () => mockService,
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
    mockService.links = [];
    mockService.folders = [];
    mockService.siteUrl = "https://zhe.to";
  });

  afterEach(() => {
    cleanup();
  });

  // ── Rendering ──

  describe("rendering", () => {
    it("renders the search input when open", () => {
      renderDialog();
      expect(screen.getByPlaceholderText("搜索链接...")).toBeInTheDocument();
    });

    it("does not render content when closed", () => {
      renderDialog({ open: false });
      expect(screen.queryByPlaceholderText("搜索链接...")).not.toBeInTheDocument();
    });

    it("shows empty state when no links", () => {
      renderDialog();
      expect(screen.getByText("没有找到匹配的链接")).toBeInTheDocument();
    });

    it("renders link items with short URL and original URL", () => {
      mockService.links = [
        makeLink({ id: 1, slug: "abc", originalUrl: "https://example.com/page" }),
      ];
      renderDialog();

      expect(screen.getByText("zhe.to/abc")).toBeInTheDocument();
      expect(screen.getByText("example.com/page")).toBeInTheDocument();
    });

    it("renders multiple links", () => {
      mockService.links = [
        makeLink({ id: 1, slug: "first", originalUrl: "https://one.com" }),
        makeLink({ id: 2, slug: "second", originalUrl: "https://two.com" }),
      ];
      renderDialog();

      expect(screen.getByText("zhe.to/first")).toBeInTheDocument();
      expect(screen.getByText("zhe.to/second")).toBeInTheDocument();
    });

    it("shows folder name for links in a folder", () => {
      mockService.folders = [makeFolder({ id: "f1", name: "Work" })];
      mockService.links = [makeLink({ id: 1, folderId: "f1" })];
      renderDialog();

      expect(screen.getByText("Work")).toBeInTheDocument();
    });

    it("does not show folder name for uncategorized links", () => {
      mockService.links = [makeLink({ id: 1, folderId: null })];
      renderDialog();

      // "Work" should not appear — no folder association
      expect(screen.queryByText("Work")).not.toBeInTheDocument();
    });

    it("handles missing folder gracefully", () => {
      // Link references a folder that doesn't exist in service
      mockService.links = [makeLink({ id: 1, folderId: "nonexistent" })];
      renderDialog();

      // Should render without crashing, no folder name shown
      expect(screen.getByText("zhe.to/abc123")).toBeInTheDocument();
    });
  });

  // ── Navigation action ──

  describe("navigate to folder", () => {
    it("navigates to folder page when selecting a link with folderId", () => {
      mockService.links = [makeLink({ id: 1, folderId: "f1" })];
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
      mockService.links = [makeLink({ id: 1, folderId: null })];
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
      mockService.links = [
        makeLink({ id: 1, slug: "abc" }),
        makeLink({ id: 2, slug: "xyz" }),
      ];
      renderDialog();

      const copyButtons = screen.getAllByLabelText(/^Copy /);
      expect(copyButtons).toHaveLength(2);
    });

    it("copies short URL to clipboard when copy button clicked", async () => {
      mockService.links = [makeLink({ id: 1, slug: "test-slug" })];
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
      mockService.links = [makeLink({ id: 1, slug: "my-link" })];
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
      expect(screen.getByPlaceholderText("搜索链接...")).toBeInTheDocument();
    });

    it("calls onOpenChange when dialog is dismissed", () => {
      const onOpenChange = vi.fn();
      renderDialog({ onOpenChange });

      // Press Escape to close dialog
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
