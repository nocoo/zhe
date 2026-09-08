"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export function EditorSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="编辑想法" description="编写内容、标题与标签。" />
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="h-8 w-8 rounded-widget bg-secondary" />
          <div className="h-8 w-48 rounded-widget bg-secondary" />
        </div>
        <div className="flex items-center gap-2 animate-pulse">
          <div className="hidden h-5 w-12 rounded bg-secondary sm:block" />
          <div className="hidden h-5 w-12 rounded bg-secondary sm:block" />
          <div className="h-8 w-8 rounded-widget bg-secondary" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        <Card className="min-h-[12rem] flex-1 space-y-3 p-6 animate-pulse">
          <div className="h-4 w-3/4 rounded bg-background" />
          <div className="h-4 w-full rounded bg-background" />
          <div className="h-4 w-5/6 rounded bg-background" />
          <div className="h-4 w-2/3 rounded bg-background" />
          <div className="h-4 w-1/2 rounded bg-background" />
        </Card>
        <Card className="min-h-[12rem] flex-1 space-y-3 p-6 animate-pulse">
          <div className="h-4 w-3/4 rounded bg-background" />
          <div className="h-4 w-1/2 rounded bg-background" />
          <div className="h-4 w-2/3 rounded bg-background" />
          <div className="h-4 w-1/3 rounded bg-background" />
        </Card>
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
