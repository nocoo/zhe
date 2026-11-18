"use client";

import { LayerCard } from "@nocoo/basalt";

export function StorageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((id) => (
          <LayerCard
            key={id}
            padding="none"
            className="h-[88px] bg-basalt-secondary p-4 animate-pulse motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-5 w-32 rounded-basalt-widget bg-basalt-secondary animate-pulse motion-reduce:animate-none" />
        <LayerCard
          padding="none"
          className="h-40 bg-basalt-secondary animate-pulse motion-reduce:animate-none"
        />
      </div>
      <div className="space-y-3">
        <div className="h-5 w-32 rounded-basalt-widget bg-basalt-secondary animate-pulse motion-reduce:animate-none" />
        <LayerCard
          padding="none"
          className="h-60 bg-basalt-secondary animate-pulse motion-reduce:animate-none"
        />
      </div>
    </div>
  );
}
