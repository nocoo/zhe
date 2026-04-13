"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

/** Route-to-label mapping for breadcrumbs */
const ROUTE_LABELS: Record<string, string> = {
  "/dashboard/overview": "概览",
  "/dashboard/uploads": "系统集成",
  "/dashboard/backy": "Backy",
  "/dashboard/xray": "Xray",
  "/dashboard/storage": "存储管理",
  "/dashboard/data-management": "数据管理",
  "/dashboard/webhook": "Webhook",
  "/dashboard/api-keys": "API Keys",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const pageLabel = ROUTE_LABELS[pathname] ?? "链接管理";

  // Root dashboard page — just show the title
  if (pathname === "/dashboard") {
    return (
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5">
          <li>
            <span
              className="text-lg md:text-xl font-semibold font-display text-foreground"
              aria-current="page"
            >
              链接管理
            </span>
          </li>
        </ol>
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5">
        <li>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            仪表盘
          </Link>
        </li>
        <li>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </li>
        <li>
          <span
            className="text-lg md:text-xl font-semibold font-display text-foreground"
            aria-current="page"
          >
            {pageLabel}
          </span>
        </li>
      </ol>
    </nav>
  );
}
