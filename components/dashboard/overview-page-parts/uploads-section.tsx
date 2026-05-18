"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileType, HardDrive, ImageIcon, Upload } from "lucide-react";
import { formatClickCount, formatStorageSize } from "@/models/overview";
import type { OverviewStats } from "@/models/overview";
import {
  BreakdownDonut,
  StatCard,
  UploadTrendChart,
} from "./charts";

export function UploadsSection({ stats }: { stats: OverviewStats }) {
  return (
    <section data-testid="section-uploads">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">图床统计</h2>
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
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <Upload className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <CardTitle className="text-sm font-medium">上传趋势</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
              <UploadTrendChart data={stats.uploadTrend} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
              <FileType className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <CardTitle className="text-sm font-medium">文件类型</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
              <BreakdownDonut data={stats.fileTypeBreakdown} />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
