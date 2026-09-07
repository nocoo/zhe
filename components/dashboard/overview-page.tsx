"use client";

import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { PageHeader } from "@/components/ui/page-header";
import type { OverviewStats, WorkerHealthStatus } from "@/models/overview";
import { useOverviewViewModel } from "@/viewmodels/useOverviewViewModel";
import { ChartSkeleton, StatSkeleton } from "./overview-page-parts/charts";
import { KVCacheSection } from "./overview-page-parts/kv-cache-section";
import { LinksSection } from "./overview-page-parts/links-section";
import { UploadsSection } from "./overview-page-parts/uploads-section";

const OVERVIEW_DESCRIPTION = "链接点击、图床用量与 KV 缓存状态。";

function OverviewSkeleton() {
  return (
    <div>
      <PageHeader title="概览" description={OVERVIEW_DESCRIPTION} />
      <div className="space-y-8 md:space-y-10">
        <SectionRule title="链接统计">
          <div className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <StatSkeleton />
              <StatSkeleton />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
              <ChartSkeleton className="lg:col-span-2" />
              <ChartSkeleton />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              <ChartSkeleton />
              <ChartSkeleton />
              <ChartSkeleton />
            </div>
          </div>
        </SectionRule>
        <SectionRule title="KV 缓存">
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <StatSkeleton />
            <StatSkeleton />
          </div>
        </SectionRule>
        <SectionRule title="图床统计">
          <div className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <StatSkeleton />
              <StatSkeleton />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
              <ChartSkeleton className="lg:col-span-2" />
              <ChartSkeleton />
            </div>
          </div>
        </SectionRule>
      </div>
    </div>
  );
}

export function OverviewPage({
  initialData,
}: {
  initialData?: import("@/models/overview").OverviewStats;
}) {
  const { loading, error, stats, workerHealth, workerHealthLoading } =
    useOverviewViewModel(initialData);

  if (loading) {
    return <OverviewSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <OverviewContent
      stats={stats}
      workerHealth={workerHealth}
      workerHealthLoading={workerHealthLoading}
    />
  );
}

function OverviewContent({
  stats,
  workerHealth,
  workerHealthLoading,
}: {
  stats: OverviewStats;
  workerHealth: WorkerHealthStatus | null;
  workerHealthLoading: boolean;
}) {
  return (
    <div>
      <PageHeader title="概览" description={OVERVIEW_DESCRIPTION} />
      <div className="space-y-8 md:space-y-10">
        <LinksSection stats={stats} />
        <KVCacheSection health={workerHealth} loading={workerHealthLoading} />
        <UploadsSection stats={stats} />
      </div>
    </div>
  );
}
