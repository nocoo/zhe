"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownPreview } from "@/components/markdown-preview";
import { useIdeaEditorViewModel } from "@/viewmodels/useIdeaEditorViewModel";
import { getTagStyles } from "@/models/tags";

export interface IdeaEditorPageProps {
  id: number;
}

/**
 * IdeaEditorPage — dedicated editor page with left-right split.
 *
 * Layout:
 * - Toolbar: back button, title input, tag picker, save button
 * - Desktop (≥ md): side-by-side 50/50 split (textarea left, preview right)
 * - Mobile (< md): stacked — editor on top, preview below
 */
export function IdeaEditorPage({ id }: IdeaEditorPageProps) {
  const router = useRouter();
  const vm = useIdeaEditorViewModel(id);

  const dirty = vm.isDirty();

  // ── Cmd/Ctrl+S to save ──
  const handleSave = useCallback(async () => {
    const success = await vm.save();
    if (success) {
      toast.success("已保存");
    }
  }, [vm]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !vm.isSaving) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty, vm.isSaving, handleSave]);

  // ── beforeunload warning when dirty ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ── Loading skeleton ──
  if (vm.loading) {
    return (
      <div className="flex flex-col h-full">
        {/* Toolbar skeleton */}
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 flex-1 max-w-md" />
          <Skeleton className="h-8 w-20" />
        </div>
        {/* Content skeleton */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0">
          <div className="p-6">
            <Skeleton className="h-full min-h-[300px]" />
          </div>
          <div className="p-6 border-t md:border-t-0 md:border-l">
            <Skeleton className="h-4 w-3/4 mb-3" />
            <Skeleton className="h-4 w-1/2 mb-3" />
            <Skeleton className="h-4 w-2/3 mb-3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </div>
    );
  }

  // ── Not found state ──
  if (vm.notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <h2 className="text-xl font-semibold text-foreground">未找到想法</h2>
        <p className="text-sm text-muted-foreground">该想法不存在或已被删除</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/ideas")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回想法列表
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b">
        {/* Back */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push("/dashboard/ideas")}
          aria-label="返回想法列表"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Title input */}
        <Input
          placeholder="标题 (可选)"
          value={vm.title ?? ""}
          onChange={(e) => vm.setTitle(e.target.value || null)}
          className="flex-1 max-w-md h-8 text-sm"
        />

        {/* Tags */}
        {vm.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {vm.tags.map((tag) => {
              const isSelected = vm.tagIds.includes(tag.id);
              const styles = getTagStyles(tag.color);
              return (
                <Badge
                  key={tag.id}
                  variant={isSelected ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  style={isSelected ? styles.badge : undefined}
                  onClick={() => vm.toggleTag(tag.id)}
                >
                  {tag.name}
                </Badge>
              );
            })}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Dirty indicator + Save */}
        <div className="flex items-center gap-2 shrink-0">
          {dirty && (
            <span className="text-xs text-muted-foreground">未保存</span>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || vm.isSaving}
          >
            {vm.isSaving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            保存
          </Button>
        </div>
      </div>

      {/* ── Editor + Preview split ── */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0">
        {/* Left: Editor */}
        <div className="flex flex-col min-h-0">
          <div className="px-6 py-2 border-b bg-muted/30">
            <span className="text-xs text-muted-foreground font-medium">编辑</span>
          </div>
          <ScrollArea className="flex-1">
            <textarea
              value={vm.content}
              onChange={(e) => vm.setContent(e.target.value)}
              placeholder="在这里写下您的想法... (支持 Markdown)"
              className="w-full h-full min-h-[400px] md:min-h-0 resize-none border-0 bg-transparent px-6 py-4 text-sm font-mono leading-relaxed focus:outline-none placeholder:text-muted-foreground/50"
              spellCheck
            />
          </ScrollArea>
        </div>

        {/* Right: Preview */}
        <div className="flex flex-col min-h-0 border-t md:border-t-0 md:border-l">
          <div className="px-6 py-2 border-b bg-muted/30">
            <span className="text-xs text-muted-foreground font-medium">预览</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-6 py-4">
              <MarkdownPreview content={vm.content} />
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ── Error Toast ── */}
      {vm.error && (
        <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground px-4 py-2 rounded-md shadow-lg flex items-center gap-2 z-50">
          <span className="text-sm">{vm.error}</span>
          <button onClick={vm.clearError}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
