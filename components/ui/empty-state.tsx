"use client";

import { Empty } from "@nocoo/basalt/components/empty";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  "data-testid": testId,
}: EmptyStateProps) {
  return (
    <Empty
      title={title}
      icon={<Icon className="w-10 h-10" strokeWidth={1.5} />}
      className={cn("rounded-card bg-secondary p-12", className)}
      {...(description === undefined ? {} : { description })}
      {...(action === undefined ? {} : { action })}
      {...(testId === undefined ? {} : { "data-testid": testId })}
    />
  );
}
