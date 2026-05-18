"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Crown,
  Globe,
  Link2,
  Monitor,
  MousePointerClick,
  TrendingUp,
} from "lucide-react";
import { formatClickCount } from "@/models/overview";
import type { OverviewStats } from "@/models/overview";
import {
  BreakdownDonut,
  ClickTrendChart,
  StatCard,
  TopLinksList,
} from "./charts";

export function LinksSection({ stats }: { stats: OverviewStats }) {
  return (
    <section data-testid="section-links">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">链接统计</h2>
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
          <Card className="lg:col-span-2 flex flex-col">
            <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <CardTitle className="text-sm font-medium">点击趋势</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 px-4 pb-4 md:px-5 md:pb-5">
              <ClickTrendChart data={stats.clickTrend} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <Crown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <CardTitle className="text-sm font-medium">热门链接</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
              <TopLinksList links={stats.topLinks} />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <Monitor className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <CardTitle className="text-sm font-medium">设备分布</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
              <BreakdownDonut data={stats.deviceBreakdown} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <Globe className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <CardTitle className="text-sm font-medium">浏览器分布</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
              <BreakdownDonut data={stats.browserBreakdown} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <Monitor className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <CardTitle className="text-sm font-medium">操作系统</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
              <BreakdownDonut data={stats.osBreakdown} />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
