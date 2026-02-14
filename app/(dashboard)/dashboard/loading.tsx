export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 w-24 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted mt-1.5" />
        </div>
        <div className="h-9 w-24 rounded-lg bg-muted" />
      </div>

      {/* Link card skeletons */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[14px] bg-secondary p-4 flex items-center gap-4"
          >
            <div className="h-9 w-9 rounded-lg bg-muted shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-3 w-64 rounded bg-muted" />
            </div>
            <div className="h-8 w-16 rounded bg-muted shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
