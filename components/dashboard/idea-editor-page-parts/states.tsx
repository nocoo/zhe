"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EditorSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="h-7 w-7 rounded-md bg-background" />
          <div className="h-8 w-48 rounded-lg bg-background" />
        </div>
        <div className="flex items-center gap-2 animate-pulse">
          <div className="h-5 w-12 rounded bg-background hidden sm:block" />
          <div className="h-5 w-12 rounded bg-background hidden sm:block" />
          <div className="h-7 w-7 rounded-md bg-background" />
        </div>
      </div>
      <div
        className="-mx-3 md:-mx-5 -mb-3 md:-mb-5 grid grid-cols-1 md:grid-cols-2 border-t"
        style={{ height: "calc(100vh - 12rem)" }}
      >
        <div className="p-6 animate-pulse space-y-3">
          <div className="h-4 w-3/4 rounded bg-background" />
          <div className="h-4 w-full rounded bg-background" />
          <div className="h-4 w-5/6 rounded bg-background" />
          <div className="h-4 w-2/3 rounded bg-background" />
          <div className="h-4 w-1/2 rounded bg-background" />
        </div>
        <div className="p-6 border-t md:border-t-0 md:border-l animate-pulse space-y-3">
          <div className="h-4 w-3/4 rounded bg-background" />
          <div className="h-4 w-1/2 rounded bg-background" />
          <div className="h-4 w-2/3 rounded bg-background" />
          <div className="h-4 w-1/3 rounded bg-background" />
        </div>
      </div>
    </div>
  );
}

export function IdeaNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <h2 className="text-xl font-semibold text-foreground">未找到想法</h2>
      <p className="text-sm text-muted-foreground">该想法不存在或已被删除</p>
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        返回想法列表
      </Button>
    </div>
  );
}
