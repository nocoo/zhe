"use client";

export function StorageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((id) => (
          <div key={id} className="h-[88px] rounded-card bg-secondary p-4 animate-pulse" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-5 w-32 rounded-widget bg-secondary animate-pulse" />
        <div className="h-40 rounded-card bg-secondary animate-pulse" />
      </div>
      <div className="space-y-3">
        <div className="h-5 w-32 rounded-widget bg-secondary animate-pulse" />
        <div className="h-60 rounded-card bg-secondary animate-pulse" />
      </div>
    </div>
  );
}
