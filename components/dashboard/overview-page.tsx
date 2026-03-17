"use client";

import { useOverviewViewModel } from "@/viewmodels/useOverviewViewModel";
import { formatClickCount, formatStorageSize, formatRelativeTime } from "@/models/overview";
import type { OverviewStats, ClickTrendPoint, UploadTrendPoint, TopLinkEntry, WorkerHealthStatus } from "@/models/overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, withAlpha, chartAxis } from "@/lib/palette";
import {
  Link2,
  MousePointerClick,
  ImageIcon,
  HardDrive,
  TrendingUp,
  Crown,
  Monitor,
  Globe,
  Upload,
  FileType,
  Clock,
  Database,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  sparkline?: number[];
}

/** Lightweight inline SVG sparkline — 80×24px */
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 80;
  const h = 24;
  const max = Math.max(...data) || 1;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-hidden
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill="url(#spark-fill)"
      />
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatCard({ label, value, icon: Icon, sparkline }: StatCardProps) {
  return (
    <div className="rounded-xl bg-secondary p-4 md:p-5" data-testid="stat-card" data-stat-label={label}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <p className="text-xl md:text-2xl font-semibold font-display tracking-tight" data-testid="stat-value">
          {value}
        </p>
        {sparkline && sparkline.length >= 2 && <Sparkline data={sparkline} />}
      </div>
    </div>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div
      className="rounded-xl bg-secondary p-4 md:p-5 animate-pulse"
      data-testid="stat-skeleton"
    >
      <div className="flex items-center justify-between">
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="h-4 w-4 rounded bg-muted" />
      </div>
      <div className="mt-3 h-7 w-20 rounded bg-muted" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <Card className="border-0 bg-secondary shadow-none" data-testid="stat-skeleton">
      <CardHeader className="px-4 py-3 md:px-5 md:py-4">
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
      </CardHeader>
      <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
        <div className="h-[200px] w-full rounded bg-muted animate-pulse" />
      </CardContent>
    </Card>
  );
}

// ── Click Trend Chart ────────────────────────────────────────────────────────

function ClickTrendChart({ data }: { data: ClickTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-1 items-center justify-center text-sm text-muted-foreground">
        暂无点击数据
      </div>
    );
  }

  return (
    <div className="min-h-[200px] flex-1">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="clickGradientTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.2} />
              <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="clickGradientWorker" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS[2]} stopOpacity={0.2} />
              <stop offset="100%" stopColor={CHART_COLORS[2]} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="clickGradientOrigin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS[4]} stopOpacity={0.2} />
              <stop offset="100%" stopColor={CHART_COLORS[4]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={withAlpha("chart-axis", 0.15)} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: chartAxis, fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)} // MM-DD
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: chartAxis, fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(label) => String(label)}
            formatter={(value?: number, name?: string) => {
              const labels: Record<string, string> = { clicks: "总计", worker: "Worker", origin: "Origin" };
              return [String(value ?? 0), labels[name ?? ""] ?? name ?? ""];
            }}
          />
          <Area
            type="monotone"
            dataKey="clicks"
            stroke={CHART_COLORS[0]}
            fill="url(#clickGradientTotal)"
            strokeWidth={2}
            name="clicks"
          />
          <Area
            type="monotone"
            dataKey="worker"
            stroke={CHART_COLORS[2]}
            fill="url(#clickGradientWorker)"
            strokeWidth={1.5}
            name="worker"
          />
          <Area
            type="monotone"
            dataKey="origin"
            stroke={CHART_COLORS[4]}
            fill="url(#clickGradientOrigin)"
            strokeWidth={1.5}
            name="origin"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Upload Trend Chart ───────────────────────────────────────────────────────

function UploadTrendChart({ data }: { data: UploadTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        暂无上传数据
      </div>
    );
  }

  return (
    <div className="h-[200px] md:h-[250px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="uploadGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={withAlpha("chart-axis", 0.15)} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: chartAxis, fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)} // MM-DD
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: chartAxis, fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(label) => String(label)}
            formatter={(value) => [String(value), "上传"]}
          />
          <Area
            type="monotone"
            dataKey="uploads"
            stroke={CHART_COLORS[1]}
            fill="url(#uploadGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Donut Breakdown Chart ────────────────────────────────────────────────────

function BreakdownDonut({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        暂无数据
      </div>
    );
  }

  const pieData = entries.map(([name, value]) => ({ name, value }));

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={2}
              dataKey="value"
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {entries.slice(0, 6).map(([name, count], i) => (
          <div key={name} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-muted-foreground">{name}</span>
            <span className="font-medium">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top Links Card ───────────────────────────────────────────────────────────

function TopLinksList({ links }: { links: TopLinkEntry[] }) {
  if (links.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        暂无链接
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="top-links-list">
      {links.slice(0, 8).map((link, i) => (
        <div
          key={link.slug}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
          data-testid="top-link-item"
          data-slug={link.slug}
        >
          <span className="w-5 text-center text-xs text-muted-foreground font-medium">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{link.slug}</p>
            <p className="text-xs text-muted-foreground truncate">
              {link.originalUrl}
            </p>
          </div>
          <span className="text-sm font-medium tabular-nums">
            {formatClickCount(link.clicks)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── KV Cache Section ─────────────────────────────────────────────────────

function KVCacheSection({
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
        />
        <StatCard
          label="KV 键数"
          value={health.kvKeyCount !== null ? String(health.kvKeyCount) : '—'}
          icon={Database}
        />
      </div>
    </section>
  );
}

// ── Overview Page ────────────────────────────────────────────────────────────

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
      {/* ── 链接统计 ──────────────────────────────────────────────── */}
      <section data-testid="section-links">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">链接统计</h2>
        <div className="space-y-4 md:space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <StatCard
              label="总链接数"
              value={formatClickCount(stats.totalLinks)}
              icon={Link2}
            />
            <StatCard
              label="总点击量"
              value={formatClickCount(stats.totalClicks)}
              icon={MousePointerClick}
              sparkline={stats.clickTrend.map((p) => p.clicks)}
            />
          </div>

          {/* Click trend (wide) + Top links */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <Card className="lg:col-span-2 border-0 bg-secondary shadow-none flex flex-col">
              <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
                <TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <CardTitle className="text-sm font-medium">点击趋势</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 px-4 pb-4 md:px-5 md:pb-5">
                <ClickTrendChart data={stats.clickTrend} />
              </CardContent>
            </Card>

            <Card className="border-0 bg-secondary shadow-none">
              <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
                <Crown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <CardTitle className="text-sm font-medium">热门链接</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
                <TopLinksList links={stats.topLinks} />
              </CardContent>
            </Card>
          </div>

          {/* Device + Browser + OS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <Card className="border-0 bg-secondary shadow-none">
              <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
                <Monitor className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <CardTitle className="text-sm font-medium">设备分布</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
                <BreakdownDonut data={stats.deviceBreakdown} />
              </CardContent>
            </Card>

            <Card className="border-0 bg-secondary shadow-none">
              <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
                <Globe className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <CardTitle className="text-sm font-medium">浏览器分布</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
                <BreakdownDonut data={stats.browserBreakdown} />
              </CardContent>
            </Card>

            <Card className="border-0 bg-secondary shadow-none">
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

      {/* ── KV 缓存 ──────────────────────────────────────────────── */}
      <KVCacheSection health={workerHealth} loading={workerHealthLoading} />

      {/* ── 图床统计 ──────────────────────────────────────────────── */}
      <section data-testid="section-uploads">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">图床统计</h2>
        <div className="space-y-4 md:space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <StatCard
              label="总上传数"
              value={formatClickCount(stats.totalUploads)}
              icon={ImageIcon}
              sparkline={stats.uploadTrend.map((p) => p.uploads)}
            />
            <StatCard
              label="存储用量"
              value={formatStorageSize(stats.totalStorageBytes)}
              icon={HardDrive}
            />
          </div>

          {/* Upload trend (wide) + File type breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <Card className="lg:col-span-2 border-0 bg-secondary shadow-none">
              <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 md:px-5 md:py-4">
                <Upload className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <CardTitle className="text-sm font-medium">上传趋势</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
                <UploadTrendChart data={stats.uploadTrend} />
              </CardContent>
            </Card>

            <Card className="border-0 bg-secondary shadow-none">
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
    </div>
  );
}
