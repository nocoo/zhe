"use client";

import { AlertTriangle, Clock, Database, HardDrive } from "lucide-react";
import { formatBytes } from "@/models/storage";
import type { StorageScanResult } from "@/models/storage";
import { computeTmpStats } from "@/models/tmp-storage";

interface SummaryCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  variant?: "default" | "warning" | "success";
  index?: number;
}

// Re-implement minimal SummaryCard locally to keep the grid self-contained.
function Card({ label, value, sub, icon: Icon, variant = "default" }: SummaryCardProps) {
  const accentClass =
    variant === "warning"
      ? "text-warning"
      : variant === "success"
      ? "text-success"
      : "text-muted-foreground";
  return (
    <div className="rounded-card border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accentClass}`} strokeWidth={1.5} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export function SummaryGrid({ data, SummaryCard }: { data: StorageScanResult; SummaryCard: React.ComponentType<SummaryCardProps> }) {
  const hasOrphans = data.r2.summary.orphanFiles > 0;
  const tmpStats = computeTmpStats(data.r2.files);
  // The provided SummaryCard is the one from the original file (richer visuals).
  void Card;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryCard
        label="R2 总存储"
        value={formatBytes(data.r2.summary.totalSize)}
        sub={`${data.r2.summary.totalFiles} 个文件`}
        icon={HardDrive}
        index={0}
      />
      <SummaryCard
        label="D1 数据库"
        value={data.d1.connected ? "已连接" : "未连接"}
        sub={`${data.d1.totalLinks} 链接 · ${data.d1.totalUploads} 上传`}
        icon={Database}
        index={1}
      />
      <SummaryCard
        label="孤儿文件"
        value={data.r2.summary.orphanFiles.toString()}
        sub={
          hasOrphans
            ? `${formatBytes(data.r2.summary.orphanSize)} 可回收`
            : "全部干净"
        }
        icon={AlertTriangle}
        variant={hasOrphans ? "warning" : "success"}
        index={2}
      />
      <SummaryCard
        label="临时文件"
        value={tmpStats.totalFiles.toString()}
        sub={
          tmpStats.totalFiles > 0
            ? `${formatBytes(tmpStats.totalSize)} · 1h 后自动清理`
            : "无临时文件"
        }
        icon={Clock}
        index={3}
      />
    </div>
  );
}
