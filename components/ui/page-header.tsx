"use client";

import { PageHeader as BasaltPageHeader } from "@nocoo/basalt/components/page-header";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, filters, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      <BasaltPageHeader
        title={title}
        description={description}
        actions={actions}
        filters={filters}
      />
    </div>
  );
}
