import { CardListSkeleton } from "@/components/ui/card-skeleton";
import { PageHeaderSkeleton } from "@/components/ui/page-header";

/**
 * Shared loading skeleton for all dashboard sub-pages.
 *
 * Next.js wraps the page in a Suspense boundary using this as fallback,
 * so navigating between async pages shows this skeleton instead of the
 * previous page lingering while SSR data is fetched.
 *
 * Matches PageHeader + list-card rhythm used by most dashboard pages.
 * Pages with a known title still render their own header + content skeleton.
 */
export default function DashboardLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <CardListSkeleton />
    </div>
  );
}
