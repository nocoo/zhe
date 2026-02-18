import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinkCard } from "@/components/dashboard/link-card";
import type { Link, Tag } from "@/models/types";
import type { AnalyticsStats } from "@/models/types";

const mockVm = {
  shortUrl: "https://zhe.to/abc123",
  copied: false,
  isDeleting: false,
  showAnalytics: false,
  analyticsStats: null as AnalyticsStats | null,
  isLoadingAnalytics: false,
  handleCopy: vi.fn(),
  handleDelete: vi.fn(),
  handleToggleAnalytics: vi.fn(),
  handleRefreshMetadata: vi.fn(),
  isRefreshingMetadata: false,
  screenshotUrl: null as string | null,
  isLoadingScreenshot: false,
};

const mockEditVm = {
  isOpen: false,
  editUrl: "",
  setEditUrl: vi.fn(),
  editFolderId: undefined as string | undefined,
  setEditFolderId: vi.fn(),
  editNote: "",
  setEditNote: vi.fn(),
  isSaving: false,
  error: "",
  assignedTagIds: new Set<string>(),
  assignedTags: [] as Tag[],
  openDialog: vi.fn(),
  closeDialog: vi.fn(),
  saveEdit: vi.fn(),
  addTag: vi.fn(),
  removeTag: vi.fn(),
  createAndAssignTag: vi.fn(),
};

vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useLinkCardViewModel: () => mockVm,
  useEditLinkViewModel: () => mockEditVm,
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...actual,
    formatDate: (date: Date | string) => `formatted:${String(date)}`,
    formatNumber: (n: number) => `num:${n}`,
  };
});

vi.mock("@/models/links", () => ({
  stripProtocol: (url: string) => url.replace(/^https?:\/\//, ""),
  topBreakdownEntries: (breakdown: Record<string, number>, n: number) =>
    Object.entries(breakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n) as [string, number][],
}));

vi.mock("@/models/tags", () => ({
  getTagColorClasses: (color: string) => ({
    badge: `mock-badge-${color}`,
    dot: `mock-dot-${color}`,
  }),
}));

const baseLink: Link = {
  id: 1,
  userId: "user-1",
  slug: "abc123",
  originalUrl: "https://example.com/very-long-url",
  isCustom: false,
  clicks: 42,
  createdAt: new Date("2026-01-15"),
  expiresAt: null,
  folderId: null,
  metaTitle: null,
  metaDescription: null,
  metaFavicon: null,
  screenshotUrl: null,
  note: null,
};

const sampleTags: Tag[] = [
  { id: "t1", userId: "user-1", name: "Work", color: "blue", createdAt: new Date() },
  { id: "t2", userId: "user-1", name: "Personal", color: "emerald", createdAt: new Date() },
];

describe("LinkCard", () => {
  const defaultProps = {
    link: baseLink,
    siteUrl: "https://zhe.to",
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVm.shortUrl = "https://zhe.to/abc123";
    mockVm.copied = false;
    mockVm.isDeleting = false;
    mockVm.showAnalytics = false;
    mockVm.analyticsStats = null;
    mockVm.isLoadingAnalytics = false;
    mockVm.isRefreshingMetadata = false;
    mockVm.screenshotUrl = null;
    mockVm.isLoadingScreenshot = false;

    mockEditVm.isOpen = false;
    mockEditVm.editUrl = "";
    mockEditVm.editFolderId = undefined;
    mockEditVm.editNote = "";
    mockEditVm.isSaving = false;
    mockEditVm.error = "";
    mockEditVm.assignedTagIds = new Set<string>();
    mockEditVm.assignedTags = [];
  });

  it("renders short URL and original URL", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("zhe.to/abc123")).toBeInTheDocument();
    expect(
      screen.getByText("https://example.com/very-long-url")
    ).toBeInTheDocument();
  });

  it("shows custom badge when isCustom is true", () => {
    const customLink = { ...baseLink, isCustom: true };
    render(<LinkCard {...defaultProps} link={customLink} />);

    expect(screen.getByText("custom")).toBeInTheDocument();
  });

  it("does not show custom badge when isCustom is false", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.queryByText("custom")).not.toBeInTheDocument();
  });

  it("shows expiry date when link.expiresAt is set", () => {
    const expiringLink = {
      ...baseLink,
      expiresAt: new Date("2026-06-01"),
    };
    render(<LinkCard {...defaultProps} link={expiringLink} />);

    expect(screen.getByText(/过期:/)).toBeInTheDocument();
  });

  it("does not show expiry date when expiresAt is null", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.queryByText(/过期:/)).not.toBeInTheDocument();
  });

  it("shows copy button", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByTitle("Copy link")).toBeInTheDocument();
  });

  it("shows Check icon when copied is true", () => {
    mockVm.copied = true;
    render(<LinkCard {...defaultProps} />);

    const copyButton = screen.getByTitle("Copy link");
    const checkIcon = copyButton.querySelector(".text-success");
    expect(checkIcon).toBeInTheDocument();
  });

  it("shows analytics panel with breakdown sections when showAnalytics + stats", () => {
    mockVm.showAnalytics = true;
    mockVm.analyticsStats = {
      totalClicks: 100,
      uniqueCountries: ["US", "CN", "JP"],
      deviceBreakdown: { desktop: 60, mobile: 40 },
      browserBreakdown: { chrome: 50, safari: 30, firefox: 20 },
      osBreakdown: { windows: 40, macos: 35, linux: 25 },
    };

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("Countries")).toBeInTheDocument();
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("Browsers")).toBeInTheDocument();
    expect(screen.getByText("OS")).toBeInTheDocument();
  });

  it("shows '暂无分析数据' when analytics open but no data and not loading", () => {
    mockVm.showAnalytics = true;
    mockVm.analyticsStats = null;
    mockVm.isLoadingAnalytics = false;

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("暂无分析数据")).toBeInTheDocument();
  });

  it("shows '加载中...' when analytics is loading", () => {
    mockVm.showAnalytics = true;
    mockVm.analyticsStats = null;
    mockVm.isLoadingAnalytics = true;

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("renders click count with formatNumber", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText(/num:42/)).toBeInTheDocument();
  });

  it("renders created date with formatDate", () => {
    render(<LinkCard {...defaultProps} />);

    const dateTexts = screen.getAllByText(/formatted:/);
    expect(dateTexts.length).toBeGreaterThanOrEqual(1);
  });

  // --- Edit button + dialog ---

  it("shows edit button in list mode", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByTitle("Edit link")).toBeInTheDocument();
  });

  it("calls editVm.openDialog when edit button is clicked in list mode", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByTitle("Edit link"));

    expect(mockEditVm.openDialog).toHaveBeenCalledWith(baseLink);
  });

  it("does not show edit dialog when isOpen is false", () => {
    render(<LinkCard {...defaultProps} />);

    // Dialog title "编辑链接" should not be visible
    expect(screen.queryByText("编辑链接")).not.toBeInTheDocument();
  });

  it("shows edit dialog when editVm.isOpen is true", () => {
    mockEditVm.isOpen = true;
    mockEditVm.editUrl = "https://example.com/very-long-url";

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("编辑链接")).toBeInTheDocument();
    expect(screen.getByLabelText("目标链接")).toBeInTheDocument();
    expect(screen.getByLabelText("备注")).toBeInTheDocument();
    expect(screen.getByText("保存")).toBeInTheDocument();
    expect(screen.getByText("取消")).toBeInTheDocument();
  });

  it("shows folder selector in dialog when folders are provided", () => {
    mockEditVm.isOpen = true;

    const folders = [
      { id: "f1", userId: "u1", name: "Work", icon: "briefcase", createdAt: new Date() },
      { id: "f2", userId: "u1", name: "Personal", icon: "folder", createdAt: new Date() },
    ];

    render(<LinkCard {...defaultProps} folders={folders} />);

    expect(screen.getByLabelText("文件夹")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("shows saving state in dialog", () => {
    mockEditVm.isOpen = true;
    mockEditVm.isSaving = true;

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("保存中...")).toBeInTheDocument();
  });

  // --- Tag badges on card ---

  it("displays tag badges when tags are assigned (list mode)", () => {
    mockEditVm.assignedTagIds = new Set(["t1", "t2"]);

    render(<LinkCard {...defaultProps} tags={sampleTags} />);

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("does not display tag section when no tags are assigned", () => {
    mockEditVm.assignedTagIds = new Set();

    render(<LinkCard {...defaultProps} tags={sampleTags} />);

    expect(screen.queryByText("Work")).not.toBeInTheDocument();
    expect(screen.queryByText("Personal")).not.toBeInTheDocument();
  });

  // --- Metadata display ---

  it("shows favicon when metaFavicon is set", () => {
    const linkWithMeta = {
      ...baseLink,
      metaFavicon: "https://example.com/favicon.ico",
    };
    render(<LinkCard {...defaultProps} link={linkWithMeta} />);

    const favicon = screen.getByAltText("favicon");
    expect(favicon).toBeInTheDocument();
    expect(favicon).toHaveAttribute("src", "https://example.com/favicon.ico");
  });

  it("does not show favicon when metaFavicon is null", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.queryByAltText("favicon")).not.toBeInTheDocument();
  });

  it("shows meta title when metaTitle is set", () => {
    const linkWithMeta = {
      ...baseLink,
      metaTitle: "Example Page Title",
    };
    render(<LinkCard {...defaultProps} link={linkWithMeta} />);

    expect(screen.getByText("Example Page Title")).toBeInTheDocument();
  });

  it("does not show meta title when metaTitle is null", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.queryByText("Example Page Title")).not.toBeInTheDocument();
  });

  it("shows meta description when metaDescription is set", () => {
    const linkWithMeta = {
      ...baseLink,
      metaDescription: "A description of the page",
    };
    render(<LinkCard {...defaultProps} link={linkWithMeta} />);

    expect(screen.getByText("A description of the page")).toBeInTheDocument();
  });

  it("shows refresh metadata button", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByTitle("Refresh metadata")).toBeInTheDocument();
  });

  it("shows spinner on refresh metadata button when refreshing", () => {
    mockVm.isRefreshingMetadata = true;
    render(<LinkCard {...defaultProps} />);

    const refreshBtn = screen.getByTitle("Refresh metadata");
    const spinner = refreshBtn.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  // --- Delete confirmation dialog ---

  it("shows delete button with trash icon", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByLabelText("Delete link")).toBeInTheDocument();
  });

  it("opens AlertDialog with confirmation text when delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByLabelText("Delete link"));

    expect(screen.getByText("确认删除")).toBeInTheDocument();
    expect(screen.getByText("此操作不可撤销，确定要删除这条链接吗？")).toBeInTheDocument();
  });

  it("does not call handleDelete when cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByLabelText("Delete link"));
    await user.click(screen.getByText("取消"));

    expect(mockVm.handleDelete).not.toHaveBeenCalled();
  });

  it("calls handleDelete when confirm delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByLabelText("Delete link"));
    await user.click(screen.getByText("删除"));

    expect(mockVm.handleDelete).toHaveBeenCalledTimes(1);
  });

  it("disables delete button when isDeleting is true", () => {
    mockVm.isDeleting = true;
    render(<LinkCard {...defaultProps} />);

    const deleteBtn = screen.getByLabelText("Delete link");
    expect(deleteBtn).toBeDisabled();
  });

  // --- Grid mode ---

  it("renders short URL in grid mode", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByText("zhe.to/abc123")).toBeInTheDocument();
  });

  it("shows click count in grid mode", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByText(/num:42/)).toBeInTheDocument();
  });

  it("shows created date in grid mode", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    const dateTexts = screen.getAllByText(/formatted:/);
    expect(dateTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show analytics toggle in grid mode", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.queryByText(/次点击/)).not.toBeInTheDocument();
  });

  it("does not show refresh metadata button in grid mode", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.queryByTitle("Refresh metadata")).not.toBeInTheDocument();
  });

  it("shows edit button in grid mode overlay", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByTitle("Edit link")).toBeInTheDocument();
  });

  it("calls editVm.openDialog when edit button is clicked in grid mode", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    await user.click(screen.getByTitle("Edit link"));

    expect(mockEditVm.openDialog).toHaveBeenCalledWith(baseLink);
  });

  it("shows placeholder icon when no screenshot and not loading in grid mode", () => {
    mockVm.screenshotUrl = null;
    mockVm.isLoadingScreenshot = false;
    const { container } = render(<LinkCard {...defaultProps} viewMode="grid" />);

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("shows spinner when screenshot is loading in grid mode", () => {
    mockVm.isLoadingScreenshot = true;
    const { container } = render(<LinkCard {...defaultProps} viewMode="grid" />);

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("shows screenshot image when screenshotUrl is set in grid mode", () => {
    mockVm.screenshotUrl = "https://screenshot.example.com/image.png";
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    const img = screen.getByAltText("Screenshot");
    expect(img).toBeInTheDocument();
  });

  it("shows meta title in grid mode when set", () => {
    const linkWithMeta = { ...baseLink, metaTitle: "Grid Title" };
    render(<LinkCard {...defaultProps} link={linkWithMeta} viewMode="grid" />);

    expect(screen.getByText("Grid Title")).toBeInTheDocument();
  });

  it("shows favicon in grid mode when set", () => {
    const linkWithMeta = { ...baseLink, metaFavicon: "https://example.com/fav.ico" };
    render(<LinkCard {...defaultProps} link={linkWithMeta} viewMode="grid" />);

    const favicon = screen.getByAltText("favicon");
    expect(favicon).toBeInTheDocument();
  });

  it("shows hover overlay actions (copy, open, edit, delete) in grid mode", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByTitle("Copy link")).toBeInTheDocument();
    expect(screen.getByTitle("Open link")).toBeInTheDocument();
    expect(screen.getByTitle("Edit link")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete link")).toBeInTheDocument();
  });

  it("opens delete dialog from grid mode hover overlay", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    await user.click(screen.getByLabelText("Delete link"));

    expect(screen.getByText("确认删除")).toBeInTheDocument();
  });

  it("displays tag badges in grid mode when tags are assigned", () => {
    mockEditVm.assignedTagIds = new Set(["t1"]);

    render(<LinkCard {...defaultProps} viewMode="grid" tags={sampleTags} />);

    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("defaults to list mode when viewMode prop is omitted", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByTitle("Edit link")).toBeInTheDocument();
  });

  // --- Tags section in dialog ---

  it("shows tag label section in dialog", () => {
    mockEditVm.isOpen = true;

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("标签")).toBeInTheDocument();
  });

  it("shows 'Add tag' button in dialog", () => {
    mockEditVm.isOpen = true;

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByLabelText("Add tag")).toBeInTheDocument();
  });

  it("shows assigned tags as removable badges in dialog", () => {
    mockEditVm.isOpen = true;
    mockEditVm.assignedTags = sampleTags;
    mockEditVm.assignedTagIds = new Set(["t1", "t2"]);

    render(<LinkCard {...defaultProps} tags={sampleTags} />);

    expect(screen.getByLabelText("Remove tag Work")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove tag Personal")).toBeInTheDocument();
  });

  it("shows error in dialog when error is set", () => {
    mockEditVm.isOpen = true;
    mockEditVm.error = "Failed to update";

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("Failed to update")).toBeInTheDocument();
  });
});
