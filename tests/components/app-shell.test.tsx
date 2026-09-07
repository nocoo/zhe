// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoldersViewModel } from "@/viewmodels/useFoldersViewModel";
import { unwrap, withTheme } from "../test-utils";

let mockFoldersVm: FoldersViewModel = {
  folders: [],
  editingFolderId: null,
  isCreating: false,
  setIsCreating: vi.fn(),
  handleCreateFolder: vi.fn(),
  handleUpdateFolder: vi.fn(),
  handleDeleteFolder: vi.fn(),
  startEditing: vi.fn(),
  cancelEditing: vi.fn(),
};

vi.mock("@/viewmodels/useFoldersViewModel", () => ({
  useFoldersViewModel: () => mockFoldersVm,
}));

// Mock getLinks for DashboardServiceProvider
vi.mock("@/actions/links", () => ({
  getLinks: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

// Mock folders actions to prevent next-auth import chain
vi.mock("@/actions/folders", () => ({
  getFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

// Mock DashboardService context
vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardService: () => ({
    links: [],
    folders: [],
    tags: [],
    linkTags: [],
    loading: false,
    siteUrl: "https://zhe.to",
    handleLinkCreated: vi.fn(),
    handleLinkDeleted: vi.fn(),
    handleLinkUpdated: vi.fn(),
    refreshLinks: vi.fn().mockResolvedValue({ success: true }),
    handleFolderCreated: vi.fn(),
    handleFolderDeleted: vi.fn(),
    handleFolderUpdated: vi.fn(),
    handleTagCreated: vi.fn(),
    handleTagDeleted: vi.fn(),
    handleTagUpdated: vi.fn(),
    handleLinkTagAdded: vi.fn(),
    handleLinkTagRemoved: vi.fn(),
  }),
  useDashboardState: () => ({
    links: [],
    folders: [],
    tags: [],
    linkTags: [],
    ideas: [],
    loading: false,
    ideasLoading: false,
    siteUrl: "https://zhe.to",
  }),
  useDashboardActions: () => ({
    handleLinkCreated: vi.fn(),
    handleLinkDeleted: vi.fn(),
    handleLinkUpdated: vi.fn(),
    refreshLinks: vi.fn().mockResolvedValue({ success: true }),
    handleFolderCreated: vi.fn(),
    handleFolderDeleted: vi.fn(),
    handleFolderUpdated: vi.fn(),
    handleTagCreated: vi.fn(),
    handleTagDeleted: vi.fn(),
    handleTagUpdated: vi.fn(),
    handleLinkTagAdded: vi.fn(),
    handleLinkTagRemoved: vi.fn(),
    ensureIdeasLoaded: vi.fn(),
    refreshIdeas: vi.fn().mockResolvedValue(undefined),
    handleIdeaCreated: vi.fn(),
    handleIdeaUpdated: vi.fn(),
    handleIdeaDeleted: vi.fn(),
  }),
  DashboardServiceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock sidebar context — controls sidebar state for shell tests
let mockSidebarCtx = {
  collapsed: false,
  toggle: vi.fn(),
  setCollapsed: vi.fn(),
  isMobile: false,
  mobileOpen: false,
  setMobileOpen: vi.fn(),
  closeMobileSidebar: vi.fn(),
};

vi.mock("@/components/sidebar-context", () => ({
  useSidebar: () => mockSidebarCtx,
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { AppShell } from "@/components/app-shell";

async function renderShell(props: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const { act } = await import("@testing-library/react");
  const defaultProps = {
    user: { name: "Test User", email: "test@example.com", image: null },
    signOutAction: vi.fn(async () => {}),
    children: <div data-testid="child-content">Dashboard Content</div>,
    ...props,
  };
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(withTheme(<AppShell {...defaultProps} />));
  });
  return unwrap(result);
}

describe("AppShell", () => {
  beforeEach(() => {
    mockPathname = "/dashboard";
    mockSidebarCtx = {
      collapsed: false,
      toggle: vi.fn(),
      setCollapsed: vi.fn(),
      isMobile: false,
      mobileOpen: false,
      setMobileOpen: vi.fn(),
      closeMobileSidebar: vi.fn(),
    };
    mockFoldersVm = {
      folders: [],
      editingFolderId: null,
      isCreating: false,
      setIsCreating: vi.fn(),
      handleCreateFolder: vi.fn(),
      handleUpdateFolder: vi.fn(),
      handleDeleteFolder: vi.fn(),
      startEditing: vi.fn(),
      cancelEditing: vi.fn(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders children content", async () => {
    await renderShell();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
  });

  it("renders the current page title in the header", async () => {
    await renderShell();
    expect(screen.getByRole("heading", { name: "链接管理" })).toBeInTheDocument();
  });

  it("renders 链接管理 as the header title on dashboard root", async () => {
    await renderShell();
    expect(screen.getByRole("heading", { name: "链接管理" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Breadcrumb")).not.toBeInTheDocument();
  });

  it("renders ancestor crumbs and page title on sub-pages", async () => {
    mockPathname = "/dashboard/uploads";
    await renderShell();
    const breadcrumbNav = screen.getByLabelText("Breadcrumb");
    expect(breadcrumbNav.textContent).toContain("仪表盘");
    expect(screen.getByRole("heading", { name: "文件上传" })).toBeInTheDocument();
  });

  it("renders ThemeToggle in header", async () => {
    await renderShell();
    expect(screen.getByTitle("Theme: system")).toBeInTheDocument();
  });

  it("renders GitHub link in header", async () => {
    await renderShell();
    const link = screen.getByTitle("GitHub");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://github.com/nocoo/zhe");
  });

  describe("desktop mode", () => {
    it("renders sidebar when not mobile", async () => {
      mockSidebarCtx.isMobile = false;
      mockSidebarCtx.collapsed = false;
      const { container } = await renderShell();

      const aside = container.querySelector("aside");
      expect(aside).toBeInTheDocument();
      expect(aside?.getAttribute("data-collapsed")).toBeNull();
    });

    it("renders collapsed sidebar", async () => {
      mockSidebarCtx.isMobile = false;
      mockSidebarCtx.collapsed = true;
      const { container } = await renderShell();

      const aside = container.querySelector("aside");
      expect(aside).toBeInTheDocument();
      expect(aside?.hasAttribute("data-collapsed")).toBe(true);
    });

    it("does not show mobile menu button on desktop", async () => {
      mockSidebarCtx.isMobile = false;
      const { container } = await renderShell();

      const header = container.querySelector("header");
      const headerButtons = header?.querySelectorAll("button");
      // Only the ThemeToggle button should be in the header
      const nonThemeButtons = Array.from(headerButtons || []).filter(
        (btn: Element) => !btn.getAttribute("title")?.includes("Theme"),
      );
      expect(nonThemeButtons.length).toBe(0);
    });
  });

  describe("mobile mode", () => {
    it("does not render sidebar inline when mobile and drawer is closed", async () => {
      mockSidebarCtx.isMobile = true;
      mockSidebarCtx.mobileOpen = false;
      const { container } = await renderShell();

      const aside = container.querySelector("aside");
      expect(aside).toBeNull();
    });

    it("shows mobile menu button", async () => {
      mockSidebarCtx.isMobile = true;
      const { container } = await renderShell();

      const header = container.querySelector("header");
      const headerButtons = header?.querySelectorAll("button");
      const nonThemeButtons = Array.from(headerButtons || []).filter(
        (btn: Element) => !btn.getAttribute("title")?.includes("Theme"),
      );
      expect(nonThemeButtons.length).toBe(1);
    });

    it("calls toggle when mobile menu button is clicked", async () => {
      mockSidebarCtx.isMobile = true;
      const { container } = await renderShell();

      const header = container.querySelector("header");
      const headerButtons = header?.querySelectorAll("button");
      const menuButton = Array.from(headerButtons || []).find(
        (btn: Element) => !btn.getAttribute("title")?.includes("Theme"),
      );
      fireEvent.click(unwrap(menuButton));
      expect(mockSidebarCtx.toggle).toHaveBeenCalledOnce();
    });

    it("renders Sheet overlay and sidebar when drawer is open", async () => {
      mockSidebarCtx.isMobile = true;
      mockSidebarCtx.mobileOpen = true;
      await renderShell();

      // Sheet renders sidebar content via portal — sidebar should be present in document
      // Radix Dialog portal renders outside the container, so query the document body
      const aside = document.querySelector("aside");
      expect(aside).toBeInTheDocument();
    });

    it("renders Sheet overlay when drawer is open", async () => {
      mockSidebarCtx.isMobile = true;
      mockSidebarCtx.mobileOpen = true;
      await renderShell();

      // Sheet overlay is rendered via Radix portal with role="dialog"
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).toBeInTheDocument();
    });

    it("keeps the mobile sheet sidebar expanded after a desktop collapse", async () => {
      mockSidebarCtx.isMobile = true;
      mockSidebarCtx.mobileOpen = true;
      mockSidebarCtx.collapsed = true;
      await renderShell();

      const aside = document.querySelector("aside");
      expect(aside).toBeInTheDocument();
      expect(aside?.hasAttribute("data-collapsed")).toBe(false);
      expect(screen.getByText("全部链接")).toBeInTheDocument();
    });

    it("closes the mobile drawer when the route changes", async () => {
      mockSidebarCtx.isMobile = true;
      mockSidebarCtx.mobileOpen = true;
      const view = await renderShell();
      mockSidebarCtx.closeMobileSidebar.mockClear();

      mockPathname = "/dashboard/settings/ai";
      const { act } = await import("@testing-library/react");
      await act(async () => {
        view.rerender(
          withTheme(
            <AppShell
              user={{ name: "Test User", email: "test@example.com", image: null }}
              signOutAction={vi.fn(async () => {})}
            >
              <div data-testid="child-content">Dashboard Content</div>
            </AppShell>,
          ),
        );
      });

      expect(mockSidebarCtx.closeMobileSidebar).toHaveBeenCalled();
    });
  });

  describe("folder props passthrough", () => {
    const mockFolders = [
      {
        id: "f1",
        userId: "u1",
        name: "工作",
        icon: "briefcase",
        createdAt: new Date("2026-01-01"),
      },
    ];

    it("passes folders to Sidebar in expanded desktop mode", async () => {
      mockSidebarCtx.isMobile = false;
      mockSidebarCtx.collapsed = false;
      mockFoldersVm.folders = mockFolders;
      await renderShell();

      // If folders are passed through, the folder name should appear in sidebar
      expect(screen.getByText("工作")).toBeInTheDocument();
    });

    it("passes folders to Sidebar in collapsed desktop mode", async () => {
      mockSidebarCtx.isMobile = false;
      mockSidebarCtx.collapsed = true;
      mockFoldersVm.folders = mockFolders;
      const { container } = await renderShell();

      // In collapsed mode, all items are links: 3 概览 section + 2 folder nav + 1 dynamic + 9 static = 15
      const navLinks = container.querySelectorAll("nav a");
      expect(navLinks.length).toBe(15);
    });

    it("passes folders to mobile sidebar when open", async () => {
      mockSidebarCtx.isMobile = true;
      mockSidebarCtx.mobileOpen = true;
      mockFoldersVm.folders = mockFolders;
      await renderShell();

      expect(screen.getByText("工作")).toBeInTheDocument();
    });
  });

  describe("B-2 spec: rounded content area", () => {
    it("uses the radius-island token for the content panel", async () => {
      const { container } = await renderShell();

      const contentPanel = container.querySelector(".rounded-island");
      expect(contentPanel).toBeInTheDocument();
    });
  });
});
