import { PageHeader, type PageHeaderProps } from "@nocoo/basalt/components/page-header";
import type { LucideProps } from "@nocoo/basalt/icons";
import type { ComponentType } from "react";

export function DashboardPageHeader({
  icon: Icon,
  title,
  ...props
}: PageHeaderProps & { icon: ComponentType<LucideProps> }) {
  return (
    <PageHeader
      {...props}
      title={
        <span className="flex items-center gap-basalt-space-lg">
          <Icon className="size-6 shrink-0" strokeWidth={1.5} aria-hidden />
          <span className="min-w-0">{title}</span>
        </span>
      }
    />
  );
}
