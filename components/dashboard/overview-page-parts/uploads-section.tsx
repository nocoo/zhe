"use client";

import { LayerCard } from "@nocoo/basalt";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { FileType, HardDrive, ImageIcon, Upload } from "@nocoo/basalt/icons";
import type { OverviewStats } from "@/models/overview";
import { formatClickCount, formatStorageSize } from "@/models/overview";
import { BreakdownDonut, StatCard, UploadTrendChart } from "./charts";

export function UploadsSection({ stats }: { stats: OverviewStats }) {
  return (
    <SectionRule title="图床统计" data-testid="section-uploads">
      <div className="space-y-4 md:space-y-6">
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <StatCard
            label="总上传数"
            value={formatClickCount(stats.totalUploads)}
            icon={ImageIcon}
            sparkline={stats.uploadTrend.map((p) => p.uploads)}
            index={0}
          />
          <StatCard
            label="存储用量"
            value={formatStorageSize(stats.totalStorageBytes)}
            icon={HardDrive}
            index={1}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
          <LayerCard padding="none" className="lg:col-span-2">
            <LayerCard.Header className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <Upload className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-sm font-medium">上传趋势</h3>
            </LayerCard.Header>
            <LayerCard.Body className="px-4 pb-4 md:px-5 md:pb-5">
              <UploadTrendChart data={stats.uploadTrend} />
            </LayerCard.Body>
          </LayerCard>

          <LayerCard padding="none">
            <LayerCard.Header className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <FileType className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-sm font-medium">文件类型</h3>
            </LayerCard.Header>
            <LayerCard.Body className="px-4 pb-4 md:px-5 md:pb-5">
              <BreakdownDonut data={stats.fileTypeBreakdown} />
            </LayerCard.Body>
          </LayerCard>
        </div>
      </div>
    </SectionRule>
  );
}
