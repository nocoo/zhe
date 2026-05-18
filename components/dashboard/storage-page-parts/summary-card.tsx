"use client";

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
    <div
      className={cn(
        "animate-fade-up rounded-xl p-4",
        variant === "warning" && "bg-warning/5",
        variant === "success" && "bg-success/5",
        variant === "default" && "bg-secondary",
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <p className="mt-2 text-xl font-semibold font-display tabular-nums tracking-tight">
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
