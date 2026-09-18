"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useViewMode } from "@/components/dashboard/links-list-parts/useViewMode";
import {
  CardGridSkeleton,
  CardListSkeleton,
  GITHUB_CARD_GRID_CLASS,
} from "@/components/ui/card-skeleton";
import { PageHeaderSkeleton } from "@/components/ui/page-header";

/**
 * Shared loading skeleton for all dashboard sub-pages.
 *
 * Next.js wraps the page in a Suspense boundary using this as fallback,
 * so navigating between async pages shows this skeleton instead of the
 * previous page lingering while SSR data is fetched.
 *
 * Match the destination collection and its saved view preference.
 */
export default function DashboardLoading() {
  const pathname = usePathname();
  const [viewMode, , ready] = useViewMode();
  let cards: ReactNode = <CardListSkeleton />;
  if (pathname === "/dashboard/github")
    cards = <CardGridSkeleton variant="github" gridClass={GITHUB_CARD_GRID_CLASS} count={8} />;
  else if (pathname === "/dashboard/x") cards = <CardGridSkeleton variant="x" />;
  else if (pathname === "/dashboard/ideas") cards = <CardGridSkeleton variant="idea" />;
  else if (pathname === "/dashboard")
    cards = ready ? viewMode === "grid" ? <CardGridSkeleton /> : <CardListSkeleton /> : null;
  return (
    <div className="@container/github">
      <PageHeaderSkeleton />
      {cards}
    </div>
  );
}
