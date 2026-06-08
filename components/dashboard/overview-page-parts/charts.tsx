"use client";

import { useId } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { CHART_COLORS, withAlpha, chartAxis } from "@/lib/palette";
import { formatClickCount } from "@/models/overview";
import type { ClickTrendPoint, UploadTrendPoint, TopLinkEntry } from "@/models/overview";

export interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  sparkline?: number[];
  index?: number;
}

export function Sparkline({ data }: { data: number[] }) {
  const gradientId = useId();
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
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill={`url(#${gradientId})`}
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

export function StatCard({ label, value, icon: Icon, sparkline, index = 0 }: StatCardProps) {
  return (
    <div
      className="animate-fade-up rounded-xl bg-secondary p-4 md:p-5"
      style={{ animationDelay: `calc(var(--motion-stagger) * ${index})` }}
      data-testid="stat-card"
      data-stat-label={label}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <p className="text-xl md:text-2xl font-semibold font-display tabular-nums tracking-tight" data-testid="stat-value">
          {value}
        </p>
        {sparkline && sparkline.length >= 2 && <Sparkline data={sparkline} />}
      </div>
    </div>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────────────

export function StatSkeleton() {
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

export function ChartSkeleton() {
  return (
    <Card data-testid="stat-skeleton">
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

export function ClickTrendChart({ data }: { data: ClickTrendPoint[] }) {
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
            formatter={(value, name) => {
              const labels: Record<string, string> = { clicks: "总计", worker: "Worker", origin: "Origin" };
              return [String(value ?? 0), labels[String(name ?? "")] ?? String(name ?? "")];
            }}
          />
          <Area
            type="monotone"
            dataKey="clicks"
            stroke={CHART_COLORS[0] ?? ''}
            fill="url(#clickGradientTotal)"
            strokeWidth={2}
            name="clicks"
          />
          <Area
            type="monotone"
            dataKey="worker"
            stroke={CHART_COLORS[2] ?? ''}
            fill="url(#clickGradientWorker)"
            strokeWidth={1.5}
            name="worker"
          />
          <Area
            type="monotone"
            dataKey="origin"
            stroke={CHART_COLORS[4] ?? ''}
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

export function UploadTrendChart({ data }: { data: UploadTrendPoint[] }) {
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
            stroke={CHART_COLORS[1] ?? ''}
            fill="url(#uploadGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Donut Breakdown Chart ────────────────────────────────────────────────────

export function BreakdownDonut({ data }: { data: Record<string, number> }) {
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
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length] ?? ''} />
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

export function TopLinksList({ links }: { links: TopLinkEntry[] }) {
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

// ── Overview Page ────────────────────────────────────────────────────────────
