"use client";

import { Lightbulb, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdeaCard, IdeaRow } from "@/components/dashboard/idea-card";
import type {
  IdeasViewModel,
  IdeasViewMode,
} from "@/viewmodels/useIdeasViewModel";
import type { IdeaListItem } from "@/lib/db/scoped";

function IdeasSkeleton({ viewMode }: { viewMode: IdeasViewMode }) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-card bg-secondary aspect-square animate-pulse"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-card bg-secondary h-[88px] animate-pulse"
        />
      ))}
    </div>
  );
}

function IdeasEmpty({
  vm,
  filtered,
}: {
  vm: IdeasViewModel;
  filtered: boolean;
}) {
  return (
    <div className="rounded-card border-0 bg-secondary shadow-none p-12 text-center">
      <Lightbulb
        className="w-10 h-10 mx-auto text-muted-foreground mb-4"
        strokeWidth={1.5}
      />
      <p className="text-sm text-muted-foreground mb-2">
        {filtered ? "未找到想法" : "暂无想法"}
      </p>
      <p className="text-xs text-muted-foreground mb-6">
        {filtered ? "试试调整筛选条件" : "点击上方按钮记录您的第一个想法"}
      </p>
      {!filtered && (
        <Button
          size="sm"
          className="rounded-widget h-7 w-7 p-0"
          onClick={() => vm.setIsCreateModalOpen(true)}
          aria-label="新想法"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}

export function IdeasContent({
  vm,
  onNavigateToIdea,
}: {
  vm: IdeasViewModel;
  onNavigateToIdea: (idea: IdeaListItem) => void;
}) {
  if (vm.loading) return <IdeasSkeleton viewMode={vm.viewMode} />;

  if (vm.ideas.length === 0) {
    const filtered = !!(vm.searchQuery || vm.selectedTagId);
    return <IdeasEmpty vm={vm} filtered={filtered} />;
  }

  if (vm.viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {vm.ideas.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            tags={vm.tags}
            onEdit={onNavigateToIdea}
            onDelete={vm.confirmDelete}
            onClick={onNavigateToIdea}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {vm.ideas.map((idea) => (
        <IdeaRow
          key={idea.id}
          idea={idea}
          tags={vm.tags}
          onEdit={onNavigateToIdea}
          onDelete={vm.confirmDelete}
          onClick={onNavigateToIdea}
        />
      ))}
    </div>
  );
}
