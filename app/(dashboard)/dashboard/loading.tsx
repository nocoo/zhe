/**
 * Shared loading skeleton for all dashboard sub-pages.
 *
 * Next.js wraps the page in a Suspense boundary using this as fallback,
 * so navigating between async pages shows this skeleton instead of the
 * previous page lingering while SSR data is fetched.
 *
 * Each page component also has its own internal skeleton for client-side
 * loading states — this only covers the SSR transition gap.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header row: title + action button */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="h-4 w-48 rounded bg-muted mt-1.5" />
        </div>
        <div className="h-9 w-24 rounded-lg bg-muted" />
      </div>

      {/* Content blocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-secondary p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-4 w-4 rounded bg-muted" />
            </div>
            <div className="h-5 w-28 rounded bg-muted" />
            <div className="h-3 w-36 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
