"use client";

import { LayerCard } from "@nocoo/basalt";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { Crown, Globe, Link2, Monitor, MousePointerClick, TrendingUp } from "@nocoo/basalt/icons";
import type { OverviewStats } from "@/models/overview";
import { formatClickCount } from "@/models/overview";
import { BreakdownDonut, ClickTrendChart, StatCard, TopLinksList } from "./charts";

export function LinksSection({ stats }: { stats: OverviewStats }) {
  return (
    <SectionRule title="链接统计" data-testid="section-links">
      <div className="space-y-4 md:space-y-6">
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <StatCard
            label="总链接数"
            value={formatClickCount(stats.totalLinks)}
            icon={Link2}
            index={0}
          />
          <StatCard
            label="总点击量"
            value={formatClickCount(stats.totalClicks)}
            icon={MousePointerClick}
            sparkline={stats.clickTrend.map((p) => p.clicks)}
            index={1}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
          <LayerCard padding="none" className="lg:col-span-2 flex flex-col">
            <LayerCard.Header className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <TrendingUp className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-sm font-medium">点击趋势</h3>
            </LayerCard.Header>
            <LayerCard.Body className="flex flex-col flex-1 px-4 pb-4 md:px-5 md:pb-5">
              <ClickTrendChart data={stats.clickTrend} />
            </LayerCard.Body>
          </LayerCard>

          <LayerCard padding="none">
            <LayerCard.Header className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <Crown className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-sm font-medium">热门链接</h3>
            </LayerCard.Header>
            <LayerCard.Body className="px-4 pb-4 md:px-5 md:pb-5">
              <TopLinksList links={stats.topLinks} />
            </LayerCard.Body>
          </LayerCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          <LayerCard padding="none">
            <LayerCard.Header className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <Monitor className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-sm font-medium">设备分布</h3>
            </LayerCard.Header>
            <LayerCard.Body className="px-4 pb-4 md:px-5 md:pb-5">
              <BreakdownDonut data={stats.deviceBreakdown} />
            </LayerCard.Body>
          </LayerCard>

          <LayerCard padding="none">
            <LayerCard.Header className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <Globe className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-sm font-medium">浏览器分布</h3>
            </LayerCard.Header>
            <LayerCard.Body className="px-4 pb-4 md:px-5 md:pb-5">
              <BreakdownDonut data={stats.browserBreakdown} />
            </LayerCard.Body>
          </LayerCard>

          <LayerCard padding="none">
            <LayerCard.Header className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <Monitor className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-sm font-medium">操作系统</h3>
            </LayerCard.Header>
            <LayerCard.Body className="px-4 pb-4 md:px-5 md:pb-5">
              <BreakdownDonut data={stats.osBreakdown} />
            </LayerCard.Body>
          </LayerCard>
        </div>
      </div>
    </SectionRule>
  );
}
