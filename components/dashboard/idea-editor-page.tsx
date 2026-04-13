"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
      <div>
        {/* Toolbar skeleton */}
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 flex-1 max-w-md rounded-md" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        {/* Content skeleton */}
        <div className="-mx-3 md:-mx-5 -mb-3 md:-mb-5 grid grid-cols-1 md:grid-cols-2 border-t">
          <div className="p-6">
            <Skeleton className="h-[400px]" />
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
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
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
    <div>
      {/* ── Toolbar — matching links-list header pattern ── */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Back */}
          <Button
            variant="outline"
            size="sm"
            className="rounded-widget h-7 w-7 p-0 shrink-0"
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
            className="flex-1 max-w-md h-8 text-sm rounded-lg"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
          {/* Tags */}
          {vm.tags.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
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

          {/* Dirty indicator + Save */}
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

      {/* ── Editor + Preview split — bleeds to card edges ── */}
      <div className="-mx-3 md:-mx-5 -mb-3 md:-mb-5 grid grid-cols-1 md:grid-cols-2 border-t" style={{ height: "calc(100vh - 12rem)" }}>
        {/* Left: Editor */}
        <div className="flex flex-col min-h-0">
          <div className="px-4 py-2 border-b bg-muted/30">
            <span className="text-xs text-muted-foreground font-medium">编辑</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <textarea
              value={vm.content}
              onChange={(e) => vm.setContent(e.target.value)}
              placeholder="在这里写下您的想法... (支持 Markdown)"
              className="w-full h-full resize-none border-0 bg-transparent px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none placeholder:text-muted-foreground/50"
              spellCheck
            />
          </div>
        </div>

        {/* Right: Preview */}
        <div className="flex flex-col min-h-0 border-t md:border-t-0 md:border-l">
          <div className="px-4 py-2 border-b bg-muted/30">
            <span className="text-xs text-muted-foreground font-medium">预览</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
            <MarkdownPreview content={vm.content} />
          </div>
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
