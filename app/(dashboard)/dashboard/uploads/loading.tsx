export default function UploadsLoading() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 w-16 rounded bg-muted" />
          <div className="h-4 w-20 rounded bg-muted mt-1.5" />
        </div>
      </div>

      {/* Upload zone skeleton */}
      <div className="mb-6">
        <div className="h-32 rounded-[14px] border-2 border-dashed border-muted bg-secondary" />
      </div>

      {/* Upload item skeletons */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[14px] bg-secondary p-4 flex items-center gap-4"
          >
            <div className="h-12 w-12 rounded-lg bg-muted shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
            <div className="h-8 w-16 rounded bg-muted shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
