"use client";

import { topBreakdownEntries } from "@/models/links";

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
    <div>
      <h4 className="text-muted-foreground text-xs uppercase tracking-wide mb-2">
        {title}
      </h4>
      {entries.length > 0 ? (
        <div className="space-y-1">
          {entries.map(([label, count]) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-muted-foreground capitalize">{label}</span>
              {showCount && (
                <span className="text-muted-foreground/70">{count}</span>
              )}
            </div>
          ))}
          {total && total > entries.length && (
            <span className="text-muted-foreground/70 text-xs">
              +{total - entries.length} more
            </span>
          )}
        </div>
      ) : (
        <span className="text-muted-foreground text-xs">No data</span>
      )}
    </div>
  );
}

interface AnalyticsStats {
  uniqueCountries: string[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
}

/** Four-column analytics breakdown, shown when stats are loaded. */
export function AnalyticsPanel({
  showAnalytics,
  analyticsStats,
  isLoadingAnalytics,
}: {
  showAnalytics: boolean;
  analyticsStats: AnalyticsStats | null;
  isLoadingAnalytics: boolean;
}) {
  if (!showAnalytics) return null;

  if (analyticsStats) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <BreakdownSection
            title="Countries"
            entries={analyticsStats.uniqueCountries
              .slice(0, 5)
              .map((c) => [c, 0])}
            total={analyticsStats.uniqueCountries.length}
            showCount={false}
          />
          <BreakdownSection
            title="Devices"
            entries={topBreakdownEntries(analyticsStats.deviceBreakdown, 3)}
          />
          <BreakdownSection
            title="Browsers"
            entries={topBreakdownEntries(analyticsStats.browserBreakdown, 3)}
          />
          <BreakdownSection
            title="OS"
            entries={topBreakdownEntries(analyticsStats.osBreakdown, 3)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-border text-center text-muted-foreground text-xs">
      {isLoadingAnalytics ? "加载中..." : "暂无分析数据"}
    </div>
  );
}
