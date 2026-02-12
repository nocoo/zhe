import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkCard } from "@/components/dashboard/link-card";
import type { Link } from "@/models/types";
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
};

vi.mock("@/viewmodels/useLinksViewModel", () => ({
  useLinkCardViewModel: () => mockVm,
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
};

describe("LinkCard", () => {
  const defaultProps = {
    link: baseLink,
    siteUrl: "https://zhe.to",
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVm.shortUrl = "https://zhe.to/abc123";
    mockVm.copied = false;
    mockVm.isDeleting = false;
    mockVm.showAnalytics = false;
    mockVm.analyticsStats = null;
    mockVm.isLoadingAnalytics = false;
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

    // formatDate is mocked to return "formatted:<date>"
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
    // Check icon has the text-success class
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
});
