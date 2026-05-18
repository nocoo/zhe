"use client";

import { useOverviewViewModel } from "@/viewmodels/useOverviewViewModel";
import type { OverviewStats, WorkerHealthStatus } from "@/models/overview";
import {
  StatSkeleton,
  ChartSkeleton,
} from "./overview-page-parts/charts";
import { KVCacheSection } from "./overview-page-parts/kv-cache-section";
import { LinksSection } from "./overview-page-parts/links-section";
import { UploadsSection } from "./overview-page-parts/uploads-section";

export function OverviewPage({ initialData }: { initialData?: import('@/models/overview').OverviewStats }) {
  const { loading, error, stats, workerHealth, workerHealthLoading } = useOverviewViewModel(initialData);

  if (loading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  return <OverviewContent stats={stats} workerHealth={workerHealth} workerHealthLoading={workerHealthLoading} />;
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
    <div className="space-y-8 md:space-y-10">
      <LinksSection stats={stats} />
      <KVCacheSection health={workerHealth} loading={workerHealthLoading} />
      <UploadsSection stats={stats} />
    </div>
  );
}
