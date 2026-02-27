import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinkCard } from "@/components/dashboard/link-card";
import type { Link, Tag, LinkTag, Folder } from "@/models/types";
import type { AnalyticsStats } from "@/models/types";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";

const mockVm = {
  shortUrl: "https://zhe.to/abc123",
  copied: false,
  copiedOriginalUrl: false,
  isDeleting: false,
  showAnalytics: false,
  analyticsStats: null as AnalyticsStats | null,
  isLoadingAnalytics: false,
  handleCopy: vi.fn(),
  handleCopyOriginalUrl: vi.fn(),
  handleDelete: vi.fn(),
  handleToggleAnalytics: vi.fn(),
  handleRefreshMetadata: vi.fn(),
  isRefreshingMetadata: false,
  screenshotUrl: null as string | null,
  isFetchingPreview: false,
  handleFetchPreview: vi.fn(),
  faviconUrl: null as string | null,
  faviconError: false,
  handleFaviconError: vi.fn(),
};

const mockEditVm = {
  editUrl: "https://example.com/very-long-url",
  setEditUrl: vi.fn(),
  editSlug: "abc123",
  setEditSlug: vi.fn(),
  editFolderId: undefined as string | undefined,
  setEditFolderId: vi.fn(),
  editNote: "",
  setEditNote: vi.fn(),
  editScreenshotUrl: "",
  setEditScreenshotUrl: vi.fn(),
  isSaving: false,
  error: "",
  assignedTagIds: new Set<string>(),
  assignedTags: [] as Tag[],
  saveEdit: vi.fn().mockResolvedValue(true),
  addTag: vi.fn(),
  removeTag: vi.fn(),
  createAndAssignTag: vi.fn(),
};

vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useLinkCardViewModel: () => mockVm,
  useInlineLinkEditViewModel: () => mockEditVm,
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
  extractHostname: (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  },
  topBreakdownEntries: (breakdown: Record<string, number>, n: number) =>
    Object.entries(breakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n) as [string, number][],
}));

vi.mock("@/models/tags", () => ({
  getTagStyles: (name: string) => ({
    badge: { backgroundColor: `mock-bg-${name}`, color: `mock-color-${name}` },
    dot: { backgroundColor: `mock-dot-${name}` },
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

const sampleFolders: Folder[] = [
  { id: "f1", userId: "user-1", name: "Work", icon: "briefcase", createdAt: new Date() },
];

const editCallbacks: EditLinkCallbacks = {
  onLinkUpdated: vi.fn(),
  onTagCreated: vi.fn(),
  onLinkTagAdded: vi.fn(),
  onLinkTagRemoved: vi.fn(),
};

describe("LinkCard", () => {
  const defaultProps = {
    link: baseLink,
    siteUrl: "https://zhe.to",
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    editCallbacks,
    folders: sampleFolders,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVm.shortUrl = "https://zhe.to/abc123";
    mockVm.copied = false;
    mockVm.copiedOriginalUrl = false;
    mockVm.isDeleting = false;
    mockVm.showAnalytics = false;
    mockVm.analyticsStats = null;
    mockVm.isLoadingAnalytics = false;
    mockVm.isRefreshingMetadata = false;
    mockVm.screenshotUrl = null;
    mockVm.isFetchingPreview = false;
    mockVm.faviconUrl = null;
    mockVm.faviconError = false;
    mockEditVm.isSaving = false;
    mockEditVm.error = "";
    mockEditVm.assignedTagIds = new Set();
    mockEditVm.assignedTags = [];
  });

  // --- Unified title logic ---

  it("shows hostname as title when no metaTitle (list mode)", () => {
    render(<LinkCard {...defaultProps} />);

    const titleLink = screen.getByRole("link", { name: "example.com" });
    expect(titleLink).toHaveAttribute("href", "https://example.com/very-long-url");
    expect(titleLink).toHaveAttribute("target", "_blank");
  });

  it("shows metaTitle as title when available (list mode)", () => {
    const linkWithMeta = { ...baseLink, metaTitle: "Example Page" };
    render(<LinkCard {...defaultProps} link={linkWithMeta} />);

    const titleLink = screen.getByRole("link", { name: "Example Page" });
    expect(titleLink).toHaveAttribute("href", "https://example.com/very-long-url");
  });

  it("shows note | metaTitle as title when both available (list mode)", () => {
    const linkWithBoth = {
      ...baseLink,
      note: "Important",
      metaTitle: "Example Page",
    };
    render(<LinkCard {...defaultProps} link={linkWithBoth} />);

    expect(screen.getByText("Important")).toBeInTheDocument();
    expect(screen.getByText("Example Page")).toBeInTheDocument();
    expect(screen.getByText("|")).toBeInTheDocument();
  });

  it("shows note | hostname when note exists but no metaTitle (list mode)", () => {
    const linkWithNote = { ...baseLink, note: "My note" };
    render(<LinkCard {...defaultProps} link={linkWithNote} />);

    expect(screen.getByText("My note")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("|")).toBeInTheDocument();
  });

  // --- Slug in meta row ---

  it("renders slug in meta row", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  // --- Expiry ---

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

  // --- Copy buttons ---

  it("shows copy short link button", () => {
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

  it("shows copy original URL button next to title", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByTitle("Copy original URL")).toBeInTheDocument();
  });

  it("shows Check icon on copy original URL button when copiedOriginalUrl is true", () => {
    mockVm.copiedOriginalUrl = true;
    render(<LinkCard {...defaultProps} />);

    const copyBtn = screen.getByTitle("Copy original URL");
    const checkIcon = copyBtn.querySelector(".text-success");
    expect(checkIcon).toBeInTheDocument();
  });

  // --- Analytics ---

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

  // --- Counts & dates ---

  it("renders click count with formatNumber", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText(/num:42/)).toBeInTheDocument();
  });

  it("renders created date with formatDate", () => {
    render(<LinkCard {...defaultProps} />);

    const dateTexts = screen.getAllByText(/formatted:/);
    expect(dateTexts.length).toBeGreaterThanOrEqual(1);
  });

  // --- Edit button ---

  it("shows edit button in list mode", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByTitle("Edit link")).toBeInTheDocument();
  });

  it("toggles inline edit area when edit button is clicked in list mode", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    // Edit area not visible initially
    expect(screen.queryByTestId("edit-area")).not.toBeInTheDocument();

    // Click edit to open
    await user.click(screen.getByTitle("Edit link"));
    expect(screen.getByTestId("edit-area")).toBeInTheDocument();

    // Click edit again to close
    await user.click(screen.getByTitle("Edit link"));
    expect(screen.queryByTestId("edit-area")).not.toBeInTheDocument();
  });

  // --- Tag badges ---

  it("displays tag badges when tags are assigned (list mode)", () => {
    const linkTags: LinkTag[] = [
      { linkId: 1, tagId: "t1" },
      { linkId: 1, tagId: "t2" },
    ];

    render(<LinkCard {...defaultProps} tags={sampleTags} linkTags={linkTags} />);

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("does not display tag section when no tags are assigned", () => {
    render(<LinkCard {...defaultProps} tags={sampleTags} linkTags={[]} />);

    expect(screen.queryByText("Work")).not.toBeInTheDocument();
    expect(screen.queryByText("Personal")).not.toBeInTheDocument();
  });

  // --- Unified favicon display ---

  it("shows favicon image when metaFavicon is set (list mode)", () => {
    const linkWithMeta = {
      ...baseLink,
      metaFavicon: "https://example.com/favicon.ico",
    };
    render(<LinkCard {...defaultProps} link={linkWithMeta} />);

    const favicon = screen.getByAltText("favicon");
    expect(favicon).toBeInTheDocument();
    expect(favicon).toHaveAttribute("src", "https://example.com/favicon.ico");
  });

  it("shows placeholder icon when metaFavicon is null (list mode)", () => {
    const { container } = render(<LinkCard {...defaultProps} />);

    expect(screen.queryByAltText("favicon")).not.toBeInTheDocument();
    const placeholders = container.querySelectorAll(".bg-accent");
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
  });

  it("shows placeholder icon when metaFavicon errors (404 fallback)", () => {
    mockVm.faviconError = true;
    const linkWithMeta = {
      ...baseLink,
      metaFavicon: "https://example.com/broken-favicon.ico",
    };
    const { container } = render(<LinkCard {...defaultProps} link={linkWithMeta} />);

    expect(screen.queryByAltText("favicon")).not.toBeInTheDocument();
    const placeholders = container.querySelectorAll(".bg-accent");
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
  });

  // --- Meta title ---

  it("shows meta title when metaTitle is set", () => {
    const linkWithMeta = {
      ...baseLink,
      metaTitle: "Example Page Title",
    };
    render(<LinkCard {...defaultProps} link={linkWithMeta} />);

    expect(screen.getByText("Example Page Title")).toBeInTheDocument();
  });

  it("shows hostname when metaTitle is null", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  // --- Unified description ---

  it("shows meta description when metaDescription is set", () => {
    const linkWithMeta = {
      ...baseLink,
      metaDescription: "A description of the page",
    };
    render(<LinkCard {...defaultProps} link={linkWithMeta} />);

    expect(screen.getByText("A description of the page")).toBeInTheDocument();
  });

  it("shows unfetched hint when metaDescription is null (list mode)", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText(/未抓取描述/)).toBeInTheDocument();
    expect(screen.getByText("点击抓取")).toBeInTheDocument();
  });

  it("shows '抓取中...' in description hint when isRefreshingMetadata is true", () => {
    mockVm.isRefreshingMetadata = true;
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("抓取中...")).toBeInTheDocument();
  });

  // --- Refresh metadata ---

  it("shows refresh metadata button", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByTitle("刷新元数据")).toBeInTheDocument();
  });

  it("shows spinner on refresh metadata button when refreshing", () => {
    mockVm.isRefreshingMetadata = true;
    render(<LinkCard {...defaultProps} />);

    const refreshBtn = screen.getByTitle("刷新元数据");
    const spinner = refreshBtn.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  // --- Delete confirmation (inside edit mode) ---

  it("shows delete button inside edit area when editing", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    // Open edit mode
    await user.click(screen.getByTitle("Edit link"));

    expect(screen.getByLabelText("Delete link")).toBeInTheDocument();
  });

  it("does not show delete button when not in edit mode", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.queryByLabelText("Delete link")).not.toBeInTheDocument();
  });

  it("opens AlertDialog with confirmation text when delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    // Open edit mode first
    await user.click(screen.getByTitle("Edit link"));
    await user.click(screen.getByLabelText("Delete link"));

    expect(screen.getByText("确认删除")).toBeInTheDocument();
    expect(screen.getByText("此操作不可撤销，确定要删除这条链接吗？")).toBeInTheDocument();
  });

  it("does not call handleDelete when cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByTitle("Edit link"));
    await user.click(screen.getByLabelText("Delete link"));
    await user.click(screen.getByText("取消"));

    expect(mockVm.handleDelete).not.toHaveBeenCalled();
  });

  it("calls handleDelete when confirm delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByTitle("Edit link"));
    await user.click(screen.getByLabelText("Delete link"));

    // The AlertDialog confirm button — find within the dialog, not the trigger
    const confirmButtons = screen.getAllByRole("button", { name: "删除" });
    // The last one is the AlertDialogAction inside the dialog
    await user.click(confirmButtons[confirmButtons.length - 1]);

    expect(mockVm.handleDelete).toHaveBeenCalledTimes(1);
  });

  it("disables delete button when isDeleting is true", async () => {
    mockVm.isDeleting = true;
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    // Open edit mode
    await user.click(screen.getByTitle("Edit link"));

    const deleteBtn = screen.getByLabelText("Delete link");
    expect(deleteBtn).toBeDisabled();
  });

  // --- Grid mode ---

  it("shows hostname as title in grid mode when no metaTitle", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("shows note | hostname in grid mode when note exists but no metaTitle", () => {
    const linkWithNote = { ...baseLink, note: "Grid note" };
    render(<LinkCard {...defaultProps} link={linkWithNote} viewMode="grid" />);

    expect(screen.getByText("Grid note")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("|")).toBeInTheDocument();
  });

  it("shows slug in grid mode meta row", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("shows click count with '次点击' in grid mode", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByText(/num:42 次点击/)).toBeInTheDocument();
  });

  it("shows created date in grid mode", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    const dateTexts = screen.getAllByText(/formatted:/);
    expect(dateTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show analytics toggle button in grid mode", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.queryByRole("button", { name: /次点击/ })).not.toBeInTheDocument();
  });

  it("shows unfetched description hint in grid mode when no metaDescription", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByText(/未抓取描述/)).toBeInTheDocument();
  });

  it("shows edit button in grid mode overlay", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByTitle("Edit link")).toBeInTheDocument();
  });

  it("toggles inline edit area when edit button is clicked in grid mode", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.queryByTestId("edit-area")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Edit link"));
    expect(screen.getByTestId("edit-area")).toBeInTheDocument();
  });

  it("shows placeholder icon when no screenshot and not loading in grid mode", () => {
    mockVm.screenshotUrl = null;
    mockVm.isFetchingPreview = false;
    const { container } = render(<LinkCard {...defaultProps} viewMode="grid" />);

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("shows spinner when preview is fetching in grid mode", () => {
    mockVm.isFetchingPreview = true;
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

  it("shows meta title as link in grid mode when set", () => {
    const linkWithMeta = { ...baseLink, metaTitle: "Grid Title" };
    render(<LinkCard {...defaultProps} link={linkWithMeta} viewMode="grid" />);

    const titleLink = screen.getByRole("link", { name: "Grid Title" });
    expect(titleLink).toHaveAttribute("href", "https://example.com/very-long-url");
  });

  it("shows favicon in grid mode when set", () => {
    const linkWithMeta = { ...baseLink, metaFavicon: "https://example.com/fav.ico" };
    render(<LinkCard {...defaultProps} link={linkWithMeta} viewMode="grid" />);

    const favicon = screen.getByAltText("favicon");
    expect(favicon).toBeInTheDocument();
  });

  it("shows favicon placeholder in grid mode when no metaFavicon", () => {
    const { container } = render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.queryByAltText("favicon")).not.toBeInTheDocument();
    const placeholders = container.querySelectorAll(".bg-accent");
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
  });

  it("shows hover overlay actions (refresh preview, edit) in grid mode", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByLabelText("Refresh preview")).toBeInTheDocument();
    expect(screen.getByTitle("Edit link")).toBeInTheDocument();
  });

  it("displays tag badges in grid mode when tags are assigned", () => {
    const linkTags: LinkTag[] = [{ linkId: 1, tagId: "t1" }];

    render(<LinkCard {...defaultProps} viewMode="grid" tags={sampleTags} linkTags={linkTags} />);

    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("defaults to list mode when viewMode prop is omitted", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByTitle("Edit link")).toBeInTheDocument();
  });

  // --- Thumbnail placeholder ---

  it("shows placeholder icon in list mode when no screenshot and not loading", () => {
    mockVm.screenshotUrl = null;
    mockVm.isFetchingPreview = false;
    const { container } = render(<LinkCard {...defaultProps} />);

    const thumbArea = container.querySelector(".group\\/thumb");
    expect(thumbArea).toBeInTheDocument();
    const svgs = thumbArea!.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it("shows refresh preview (camera) button in list mode", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByLabelText("Refresh preview")).toBeInTheDocument();
  });

  it("shows refresh preview (camera) button in grid mode hover overlay", () => {
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    expect(screen.getByLabelText("Refresh preview")).toBeInTheDocument();
  });

  it("shows spinner on camera button when isFetchingPreview is true in list mode", () => {
    mockVm.isFetchingPreview = true;
    render(<LinkCard {...defaultProps} />);

    const btn = screen.getByLabelText("Refresh preview");
    const spinner = btn.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  // --- Favicon display in thumbnail area ---

  it("shows favicon image in list mode when faviconUrl is set", () => {
    mockVm.faviconUrl = "https://favicon.im/example.com?larger=true";
    render(<LinkCard {...defaultProps} />);

    const faviconImg = screen.getByAltText("Site favicon");
    expect(faviconImg).toBeInTheDocument();
    expect(faviconImg).toHaveAttribute("src", "https://favicon.im/example.com?larger=true");
  });

  it("shows favicon image in grid mode when faviconUrl is set", () => {
    mockVm.faviconUrl = "https://favicon.im/example.com?larger=true";
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    const faviconImg = screen.getByAltText("Site favicon");
    expect(faviconImg).toBeInTheDocument();
    expect(faviconImg).toHaveAttribute("src", "https://favicon.im/example.com?larger=true");
  });

  it("shows screenshot over favicon when screenshotUrl exists in list mode", () => {
    mockVm.screenshotUrl = "https://r2.example.com/manual-screenshot.png";
    mockVm.faviconUrl = null;
    render(<LinkCard {...defaultProps} />);

    const img = screen.getByAltText("Screenshot");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://r2.example.com/manual-screenshot.png");
    expect(screen.queryByAltText("Site favicon")).not.toBeInTheDocument();
  });

  it("shows screenshot over favicon when screenshotUrl exists in grid mode", () => {
    mockVm.screenshotUrl = "https://r2.example.com/manual-screenshot.png";
    mockVm.faviconUrl = null;
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    const img = screen.getByAltText("Screenshot");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://r2.example.com/manual-screenshot.png");
    expect(screen.queryByAltText("Site favicon")).not.toBeInTheDocument();
  });

  it("always shows thumbnail area in list mode even without screenshot", () => {
    mockVm.screenshotUrl = null;
    mockVm.isFetchingPreview = false;
    const { container } = render(<LinkCard {...defaultProps} />);

    const thumbArea = container.querySelector(".group\\/thumb");
    expect(thumbArea).toBeInTheDocument();
  });

  it("shows Refresh metadata button with correct title in list mode", () => {
    render(<LinkCard {...defaultProps} />);

    expect(screen.getByTitle("刷新元数据")).toBeInTheDocument();
    expect(screen.getByTitle("刷新预览图")).toBeInTheDocument();
  });

  // --- Copy button callbacks ---

  it("calls handleCopy when copy link button is clicked in list mode", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByTitle("Copy link"));

    expect(mockVm.handleCopy).toHaveBeenCalledTimes(1);
  });

  it("calls handleCopyOriginalUrl when copy original URL button is clicked in list mode", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByTitle("Copy original URL"));

    expect(mockVm.handleCopyOriginalUrl).toHaveBeenCalledTimes(1);
  });

  it("calls handleCopy when copy link button is clicked in grid mode", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    await user.click(screen.getByTitle("Copy link"));

    expect(mockVm.handleCopy).toHaveBeenCalledTimes(1);
  });

  it("calls handleCopyOriginalUrl when copy original URL button is clicked in grid mode", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    await user.click(screen.getByTitle("Copy original URL"));

    expect(mockVm.handleCopyOriginalUrl).toHaveBeenCalledTimes(1);
  });

  // --- Refresh metadata callback ---

  it("calls handleRefreshMetadata when refresh metadata button is clicked", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByTitle("刷新元数据"));

    expect(mockVm.handleRefreshMetadata).toHaveBeenCalledTimes(1);
  });

  // --- Analytics toggle callback ---

  it("calls handleToggleAnalytics when analytics button is clicked", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    const analyticsButton = screen.getByText(/次点击/);
    await user.click(analyticsButton);

    expect(mockVm.handleToggleAnalytics).toHaveBeenCalledTimes(1);
  });

  // --- BreakdownSection rendering ---

  it("shows country entries without counts in analytics panel", () => {
    mockVm.showAnalytics = true;
    mockVm.analyticsStats = {
      totalClicks: 100,
      uniqueCountries: ["US", "CN", "JP"],
      deviceBreakdown: { desktop: 60, mobile: 40 },
      browserBreakdown: { chrome: 50, safari: 30, firefox: 20 },
      osBreakdown: { windows: 40, macos: 35, linux: 25 },
    };

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("US")).toBeInTheDocument();
    expect(screen.getByText("CN")).toBeInTheDocument();
    expect(screen.getByText("JP")).toBeInTheDocument();
  });

  it("shows device breakdown entries with counts", () => {
    mockVm.showAnalytics = true;
    mockVm.analyticsStats = {
      totalClicks: 100,
      uniqueCountries: ["US"],
      deviceBreakdown: { desktop: 60, mobile: 35 },
      browserBreakdown: { chrome: 50 },
      osBreakdown: { windows: 45 },
    };

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("desktop")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("mobile")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
  });

  it("shows '+N more' text when countries exceed displayed entries", () => {
    mockVm.showAnalytics = true;
    mockVm.analyticsStats = {
      totalClicks: 100,
      uniqueCountries: ["US", "CN", "JP", "UK", "DE", "FR", "BR", "IN"],
      deviceBreakdown: {},
      browserBreakdown: {},
      osBreakdown: {},
    };

    render(<LinkCard {...defaultProps} />);

    expect(screen.getByText("+3 more")).toBeInTheDocument();
  });

  it("shows 'No data' when device breakdown is empty", () => {
    mockVm.showAnalytics = true;
    mockVm.analyticsStats = {
      totalClicks: 0,
      uniqueCountries: [],
      deviceBreakdown: {},
      browserBreakdown: {},
      osBreakdown: {},
    };

    render(<LinkCard {...defaultProps} />);

    const noDataElements = screen.getAllByText("No data");
    expect(noDataElements.length).toBeGreaterThanOrEqual(1);
  });

  // --- Screenshot source picker dialog ---

  it("opens screenshot source picker dialog when refresh preview is clicked in list mode", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByLabelText("Refresh preview"));

    expect(screen.getByText("选择截图来源")).toBeInTheDocument();
    expect(screen.getByText("Microlink")).toBeInTheDocument();
    expect(screen.getByText("Screenshot Domains")).toBeInTheDocument();
  });

  it("calls handleFetchPreview with 'microlink' when Microlink source is selected", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByLabelText("Refresh preview"));
    await user.click(screen.getByText("Microlink"));

    expect(mockVm.handleFetchPreview).toHaveBeenCalledWith("microlink");
  });

  it("calls handleFetchPreview with 'screenshotDomains' when Screenshot Domains source is selected", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByLabelText("Refresh preview"));
    await user.click(screen.getByText("Screenshot Domains"));

    expect(mockVm.handleFetchPreview).toHaveBeenCalledWith("screenshotDomains");
  });

  it("opens screenshot source picker dialog when refresh preview is clicked in grid mode", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} viewMode="grid" />);

    await user.click(screen.getByLabelText("Refresh preview"));

    expect(screen.getByText("选择截图来源")).toBeInTheDocument();
  });

  // --- List mode thumbnail dimensions ---

  it("renders list mode thumbnail with 118x62 dimensions", () => {
    mockVm.screenshotUrl = "https://screenshot.example.com/img.png";
    const { container } = render(<LinkCard {...defaultProps} />);

    const thumbArea = container.querySelector(".group\\/thumb");
    expect(thumbArea).toBeInTheDocument();
    expect(thumbArea).toHaveClass("w-[118px]");
    expect(thumbArea).toHaveClass("h-[62px]");
  });

  it("renders list mode screenshot with object-top positioning", () => {
    mockVm.screenshotUrl = "https://screenshot.example.com/img.png";
    render(<LinkCard {...defaultProps} />);

    const img = screen.getByAltText("Screenshot");
    expect(img).toHaveClass("object-cover");
    expect(img).toHaveClass("object-top");
  });

  // --- Inline edit mode ---

  it("shows defaultEditing cards with edit area always open", () => {
    render(<LinkCard {...defaultProps} defaultEditing />);

    expect(screen.getByTestId("edit-area")).toBeInTheDocument();
  });

  it("defaultEditing cards cannot collapse edit area via edit button", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} defaultEditing />);

    // Edit area is open
    expect(screen.getByTestId("edit-area")).toBeInTheDocument();

    // Click edit button — should NOT close
    await user.click(screen.getByTitle("Edit link"));
    expect(screen.getByTestId("edit-area")).toBeInTheDocument();
  });

  it("does not show edit area when editCallbacks is not provided", () => {
    const { editCallbacks: _, ...propsWithoutCallbacks } = defaultProps;
    render(<LinkCard {...propsWithoutCallbacks} />);

    // Even if we somehow had isEditing=true, without editCallbacks the area won't render
    expect(screen.queryByTestId("edit-area")).not.toBeInTheDocument();
  });

  it("shows save button inside edit area", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByTitle("Edit link"));

    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("calls saveEdit when save button is clicked", async () => {
    const user = userEvent.setup();
    render(<LinkCard {...defaultProps} />);

    await user.click(screen.getByTitle("Edit link"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(mockEditVm.saveEdit).toHaveBeenCalledTimes(1);
  });
});
