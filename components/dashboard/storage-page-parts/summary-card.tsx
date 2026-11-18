"use client";

import { LayerCard } from "@nocoo/basalt";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  variant?: "default" | "warning" | "success";
  index?: number;
}

export function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  variant = "default",
  index = 0,
}: SummaryCardProps) {
  return (
    <LayerCard
      padding="none"
      className={cn(
        "p-4",
        variant === "warning" && "bg-basalt-warning/5",
        variant === "success" && "bg-basalt-success/5",
        variant === "default" && "bg-basalt-secondary",
      )}
      style={{ animationDelay: `calc(var(--motion-stagger) * ${index})` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-basalt-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
      </div>
      <p className="mt-2 text-xl font-semibold font-display tabular-nums tracking-tight">{value}</p>
      {sub && <p className="text-xs text-basalt-muted-foreground mt-0.5">{sub}</p>}
    </LayerCard>
  );
}
