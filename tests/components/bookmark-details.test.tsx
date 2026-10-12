// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AnalyticsPanel,
  BreakdownSection,
} from "@/components/dashboard/link-card-parts/analytics-panel";
import { Favicon, SourceLinks } from "@/components/dashboard/link-card-parts/shared-rows";
import type { AnalyticsStats } from "@/models/types";
import { makeLink } from "../fixtures";

vi.mock("next/image", () => ({
  default: ({ src, alt, onError }: { src: string; alt: string; onError: () => void }) => (
    <img src={src} alt={alt} onError={onError} />
  ),
}));
const empty: AnalyticsStats = {
  totalClicks: 0,
  uniqueCountries: [],
  deviceBreakdown: {},
  browserBreakdown: {},
  osBreakdown: {},
};

describe("bookmark detail content", () => {
  it("keeps closed analytics unmounted and distinguishes loading from empty", () => {
    const { rerender } = render(
      <AnalyticsPanel showAnalytics={false} analyticsStats={null} isLoadingAnalytics={false} />,
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    rerender(<AnalyticsPanel showAnalytics analyticsStats={null} isLoadingAnalytics />);
    expect(screen.getByRole("status")).toHaveTextContent("加载中...");
    rerender(<AnalyticsPanel showAnalytics analyticsStats={empty} isLoadingAnalytics={false} />);
    expect(screen.getByText("0 次点击")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("暂无分析数据");
  });

  it.each(["deviceBreakdown", "browserBreakdown", "osBreakdown"] as const)(
    "renders analytics when only %s exists",
    (key) => {
      render(
        <AnalyticsPanel
          showAnalytics
          analyticsStats={{ ...empty, totalClicks: 7, [key]: { Sample: 7 } }}
          isLoadingAnalytics={false}
        />,
      );
      expect(screen.getByText("Sample")).toBeVisible();
      expect(screen.getByText("7")).toBeVisible();
      expect(screen.getAllByText("暂无记录")).toHaveLength(3);
    },
  );

  it("limits country and device breakdowns while retaining totals", () => {
    render(
      <AnalyticsPanel
        showAnalytics
        analyticsStats={{
          ...empty,
          totalClicks: 50,
          uniqueCountries: ["CN", "JP", "US", "DE", "FR", "GB"],
          deviceBreakdown: { desktop: 20, mobile: 15, tablet: 10, other: 5 },
        }}
        isLoadingAnalytics={false}
      />,
    );
    expect(screen.getByText("另有 1 个")).toBeVisible();
    expect(screen.queryByText("GB")).not.toBeInTheDocument();
    expect(screen.queryByText("other")).not.toBeInTheDocument();
    expect(screen.getByText("50 次点击")).toBeVisible();
  });

  it("supports complete breakdowns without an overflow count", () => {
    render(
      <BreakdownSection title="Countries" entries={[["CN", 3]]} total={1} showCount={false} />,
    );
    expect(screen.getByText("CN")).toBeVisible();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.queryByText(/另有/)).not.toBeInTheDocument();
  });

  it("retains favicon error handling and expiry details beside real source links", () => {
    const error = vi.fn();
    const link = makeLink({
      expiresAt: new Date("2026-12-01T10:00:00Z"),
      metaFavicon: "https://example.com/icon.png",
    });
    const { rerender } = render(<Favicon link={link} show onError={error} />);
    fireEvent.error(screen.getByAltText("favicon"));
    expect(error).toHaveBeenCalledOnce();
    rerender(<Favicon link={link} show={false} size="sm" onError={error} />);
    expect(screen.queryByAltText("favicon")).not.toBeInTheDocument();
    rerender(<SourceLinks link={link} shortUrl="https://zhe.to/sample" />);
    expect(screen.getByText("限时")).toHaveAttribute("title");
    expect(screen.getByText(`/${link.slug}`)).toHaveAttribute("href", "https://zhe.to/sample");
  });
});
