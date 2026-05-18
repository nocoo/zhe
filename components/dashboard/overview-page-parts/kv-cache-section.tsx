"use client";

import { Clock, Database } from "lucide-react";
import { formatRelativeTime } from "@/models/overview";
import type { WorkerHealthStatus } from "@/models/overview";
import { StatCard, StatSkeleton } from "./charts";

export function KVCacheSection({
  health,
  loading: isLoading,
}: {
  health: WorkerHealthStatus | null;
  loading: boolean;
}) {
  if (isLoading) {
    return (
      <section data-testid="section-kv">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">KV 缓存</h2>
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <StatSkeleton />
          <StatSkeleton />
        </div>
      </section>
    );
  }

  if (!health) {
    return (
      <section data-testid="section-kv">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">KV 缓存</h2>
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          无法加载 KV 缓存状态
        </div>
      </section>
    );
  }

  return (
    <section data-testid="section-kv">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">KV 缓存</h2>
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <StatCard
          label="最近同步"
          value={health.lastSyncTime ? formatRelativeTime(health.lastSyncTime) : '暂无'}
          icon={Clock}
          index={0}
        />
        <StatCard
          label="KV 键数"
          value={health.kvKeyCount !== null ? String(health.kvKeyCount) : '—'}
          icon={Database}
          index={1}
        />
      </div>
    </section>
  );
}

