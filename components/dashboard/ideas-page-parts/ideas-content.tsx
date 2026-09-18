"use client";

import { Lightbulb, Plus } from "lucide-react";
import { IdeaCard, IdeaRow } from "@/components/dashboard/idea-card";
import { Button } from "@/components/ui/button";
import { CARD_GRID_CLASS, CardGridSkeleton, CardListSkeleton } from "@/components/ui/card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { IdeaListItem } from "@/lib/db/scoped";
import { staggerStyle } from "@/lib/motion";
import type { BulkDeleteState } from "@/viewmodels/useBulkDelete";
import type { IdeasViewMode, IdeasViewModel } from "@/viewmodels/useIdeasViewModel";
import { SelectableCard } from "../bulk-delete";

function IdeasSkeleton({ viewMode }: { viewMode: IdeasViewMode }) {
  if (viewMode === "grid") {
    return <CardGridSkeleton variant="idea" />;
  }
  return <CardListSkeleton variant="idea" />;
}

function IdeasEmpty({ vm, filtered }: { vm: IdeasViewModel; filtered: boolean }) {
  return (
    <EmptyState
      icon={Lightbulb}
      title={filtered ? "未找到想法" : "暂无想法"}
      description={filtered ? "试试调整筛选条件" : "点击上方按钮记录您的第一个想法"}
      {...(!filtered && {
        action: (
          <Button size="icon" onClick={() => vm.setIsCreateModalOpen(true)} aria-label="新想法">
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
  selection,
}: {
  vm: IdeasViewModel;
  selection: BulkDeleteState;
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
        {vm.ideas.map((idea, i) => (
          <SelectableCard
            selection={selection}
            itemId={idea.id}
            label={idea.title || idea.excerpt || "未命名想法"}
            key={idea.id}
            className="animate-fade-up motion-reduce:animate-none"
            style={staggerStyle(i)}
          >
            <IdeaCard
              idea={idea}
              tags={vm.tags}
              onEdit={onNavigateToIdea}
              onDelete={vm.confirmDelete}
              onClick={onNavigateToIdea}
            />
          </SelectableCard>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="card-list">
      {vm.ideas.map((idea, i) => (
        <SelectableCard
          selection={selection}
          itemId={idea.id}
          label={idea.title || idea.excerpt || "未命名想法"}
          key={idea.id}
          className="animate-fade-up motion-reduce:animate-none"
          style={staggerStyle(i)}
        >
          <IdeaRow
            idea={idea}
            tags={vm.tags}
            onEdit={onNavigateToIdea}
            onDelete={vm.confirmDelete}
            onClick={onNavigateToIdea}
          />
        </SelectableCard>
      ))}
    </div>
  );
}
