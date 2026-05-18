"use client";

export function StorageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-secondary p-4 h-[88px]" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-5 w-32 rounded bg-secondary" />
        <div className="rounded-xl border border-border h-40" />
      </div>
      <div className="space-y-3">
        <div className="h-5 w-32 rounded bg-secondary" />
        <div className="rounded-xl border border-border h-60" />
      </div>
    </div>
  );
}
