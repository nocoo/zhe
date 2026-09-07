"use client";

import { Lightbulb, Plus } from "lucide-react";
import { IdeaCard, IdeaRow } from "@/components/dashboard/idea-card";
import { Button } from "@/components/ui/button";
import { CARD_GRID_CLASS, CardGridSkeleton, CardListSkeleton } from "@/components/ui/card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { IdeaListItem } from "@/lib/db/scoped";
import type { IdeasViewMode, IdeasViewModel } from "@/viewmodels/useIdeasViewModel";

function IdeasSkeleton({ viewMode }: { viewMode: IdeasViewMode }) {
  if (viewMode === "grid") {
    return <CardGridSkeleton aspectClass="aspect-square" />;
  }
  return <CardListSkeleton />;
}

function IdeasEmpty({ vm, filtered }: { vm: IdeasViewModel; filtered: boolean }) {
  return (
    <EmptyState
      icon={Lightbulb}
      title={filtered ? "未找到想法" : "暂无想法"}
      description={filtered ? "试试调整筛选条件" : "点击上方按钮记录您的第一个想法"}
      {...(!filtered && {
        action: (
          <Button size="icon-sm" onClick={() => vm.setIsCreateModalOpen(true)} aria-label="新想法">
            <Plus className="w-4 h-4" strokeWidth={1.5} />
          </Button>
        ),
      })}
    />
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
      <div className={CARD_GRID_CLASS} data-testid="card-grid">
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
    <div className="space-y-2" data-testid="card-list">
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
