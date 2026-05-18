"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useIdeasViewModel } from "@/viewmodels/useIdeasViewModel";
import type { IdeaListItem } from "@/lib/db/scoped";
import { IdeasToolbar } from "./ideas-page-parts/ideas-toolbar";
import { IdeasContent } from "./ideas-page-parts/ideas-content";
import {
  CreateIdeaModal,
  DeleteIdeaConfirm,
  ErrorToast,
} from "./ideas-page-parts/dialogs";

export function IdeasPage() {
  const vm = useIdeasViewModel();
  const router = useRouter();

  // Create modal state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTagIds, setNewTagIds] = useState<string[]>([]);

  const handleCreate = async () => {
    const success = await vm.handleCreateIdea({
      content: newContent,
      ...(newTitle.trim() && { title: newTitle.trim() }),
      ...(newTagIds.length > 0 && { tagIds: newTagIds }),
    });
    if (success) {
      setNewTitle("");
      setNewContent("");
      setNewTagIds([]);
    }
  };

  const handleNavigateToIdea = (idea: IdeaListItem) => {
    router.push(`/dashboard/ideas/${idea.id}`);
  };

  const toggleNewTag = (tagId: string) => {
    setNewTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  };

  return (
    <div>
      <IdeasToolbar vm={vm} />
      <IdeasContent vm={vm} onNavigateToIdea={handleNavigateToIdea} />

      <CreateIdeaModal
        vm={vm}
        newTitle={newTitle}
        setNewTitle={setNewTitle}
        newContent={newContent}
        setNewContent={setNewContent}
        newTagIds={newTagIds}
        toggleTag={toggleNewTag}
        onCreate={handleCreate}
      />

      <DeleteIdeaConfirm vm={vm} />

      {vm.error && <ErrorToast message={vm.error} onClear={vm.clearError} />}
    </div>
  );
}
