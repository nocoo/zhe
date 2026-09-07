"use client";

import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { Clock, Database } from "lucide-react";
import type { WorkerHealthStatus } from "@/models/overview";
import { formatRelativeTime } from "@/models/overview";
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
      <SectionRule title="KV 缓存" data-testid="section-kv">
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <StatSkeleton />
          <StatSkeleton />
        </div>
      </SectionRule>
    );
  }

  if (!health) {
    return (
      <SectionRule title="KV 缓存" data-testid="section-kv">
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          无法加载 KV 缓存状态
        </div>
      </SectionRule>
    );
  }

  return (
    <SectionRule title="KV 缓存" data-testid="section-kv">
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <StatCard
          label="最近同步"
          value={health.lastSyncTime ? formatRelativeTime(health.lastSyncTime) : "暂无"}
          icon={Clock}
          index={0}
        />
        <StatCard
          label="KV 键数"
          value={health.kvKeyCount !== null ? String(health.kvKeyCount) : "—"}
          icon={Database}
          index={1}
        />
      </div>
    </SectionRule>
  );
}
