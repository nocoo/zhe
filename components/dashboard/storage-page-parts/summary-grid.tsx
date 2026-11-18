"use client";

import { AlertTriangle, Clock, Database, HardDrive } from "@nocoo/basalt/icons";
import type { StorageScanResult } from "@/models/storage";
import { formatBytes } from "@/models/storage";
import { computeTmpStats } from "@/models/tmp-storage";

interface SummaryCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  variant?: "default" | "warning" | "success";
  index?: number;
}

export function SummaryGrid({
  data,
  SummaryCard,
}: {
  data: StorageScanResult;
  SummaryCard: React.ComponentType<SummaryCardProps>;
}) {
  const hasOrphans = data.r2.summary.orphanFiles > 0;
  const tmpStats = computeTmpStats(data.r2.files);
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
        sub={hasOrphans ? `${formatBytes(data.r2.summary.orphanSize)} 可回收` : "全部干净"}
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
