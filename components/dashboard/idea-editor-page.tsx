"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useIdeaEditorViewModel } from "@/viewmodels/useIdeaEditorViewModel";
import { useEditorShortcuts } from "./idea-editor-page-parts/useEditorShortcuts";
import { EditorSkeleton, IdeaNotFound } from "./idea-editor-page-parts/states";
import { EditorToolbar } from "./idea-editor-page-parts/editor-toolbar";
import { EditorSplit, ErrorToast } from "./idea-editor-page-parts/editor-split";

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

  const handleSave = useCallback(async () => {
    const success = await vm.save();
    if (success) toast.success("已保存");
  }, [vm]);

  useEditorShortcuts({ dirty, isSaving: vm.isSaving, onSave: handleSave });

  if (vm.loading) return <EditorSkeleton />;
  if (vm.notFound) {
    return <IdeaNotFound onBack={() => router.push("/dashboard/ideas")} />;
  }

  return (
    <div>
      <EditorToolbar
        title={vm.title}
        setTitle={vm.setTitle}
        tags={vm.tags}
        selectedTagIds={vm.tagIds}
        toggleTag={vm.toggleTag}
        dirty={dirty}
        isSaving={vm.isSaving}
        onSave={handleSave}
        onBack={() => router.push("/dashboard/ideas")}
      />
      <EditorSplit content={vm.content} setContent={vm.setContent} />
      {vm.error && <ErrorToast error={vm.error} onClear={vm.clearError} />}
    </div>
  );
}
