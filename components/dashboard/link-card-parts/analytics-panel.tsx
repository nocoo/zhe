"use client";

import { BarChart3, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { topBreakdownEntries } from "@/models/links";
import type { AnalyticsStats } from "@/models/types";

/** Compact breakdown column (e.g. Devices / Browsers / OS / Countries). */
export function BreakdownSection({
  title,
  entries,
  total,
  showCount = true,
}: {
  title: string;
  entries: [string, number][];
  total?: number;
  showCount?: boolean;
}) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h4>
      {entries.length > 0 ? (
        <div className="space-y-1">
          {entries.map(([label, count]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-xs leading-5">
              <span className="min-w-0 truncate capitalize" title={label}>
                {label}
              </span>
              {showCount && <span className="shrink-0 font-medium tabular-nums">{count}</span>}
            </div>
          ))}
          {total !== undefined && total > entries.length && (
            <span className="text-xs text-muted-foreground">另有 {total - entries.length} 个</span>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">暂无记录</span>
      )}
    </div>
  );
}

/** Analytics adapt to the card width, with one empty state before visits arrive. */
export function AnalyticsPanel({
  showAnalytics,
  analyticsStats,
  isLoadingAnalytics,
  className,
}: {
  showAnalytics: boolean;
  analyticsStats: AnalyticsStats | null;
  isLoadingAnalytics: boolean;
  className?: string | undefined;
}) {
  if (!showAnalytics) return null;

  const hasBreakdown =
    analyticsStats &&
    (analyticsStats.uniqueCountries.length > 0 ||
      Object.keys(analyticsStats.deviceBreakdown).length > 0 ||
      Object.keys(analyticsStats.browserBreakdown).length > 0 ||
      Object.keys(analyticsStats.osBreakdown).length > 0);

  return (
    <section
      className={cn(
        "@container/analytics space-y-4 border-t border-border/60 bg-background/30 p-4",
        className,
      )}
      aria-label="短链接统计"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold">
          <BarChart3 className="size-3.5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          短链接统计
        </h3>
        {analyticsStats && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {analyticsStats.totalClicks} 次点击
          </span>
        )}
      </div>
      {hasBreakdown ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 @xl/analytics:grid-cols-4">
          <BreakdownSection
            title="国家 / 地区"
            entries={analyticsStats.uniqueCountries.slice(0, 5).map((c) => [c, 0])}
            total={analyticsStats.uniqueCountries.length}
            showCount={false}
          />
          <BreakdownSection
            title="设备"
            entries={topBreakdownEntries(analyticsStats.deviceBreakdown, 3)}
          />
          <BreakdownSection
            title="浏览器"
            entries={topBreakdownEntries(analyticsStats.browserBreakdown, 3)}
          />
          <BreakdownSection
            title="操作系统"
            entries={topBreakdownEntries(analyticsStats.osBreakdown, 3)}
          />
        </div>
      ) : (
        <p
          role="status"
          className="flex items-center gap-2 text-xs leading-5 text-muted-foreground"
        >
          {isLoadingAnalytics && (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          )}
          {isLoadingAnalytics ? "加载中..." : "暂无分析数据"}
        </p>
      )}
    </section>
  );
}
