"use client";

import { Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CardGridSkeleton, CardListSkeleton } from "@/components/ui/card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useDashboardService } from "@/contexts/dashboard-service";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Folder, Link, Tag } from "@/models/types";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { useAutoRefreshMetadata } from "@/viewmodels/useLinksViewModel";
import { useSuggestLinkOrgViewModel } from "@/viewmodels/useSuggestLinkOrgViewModel";
import { CreateLinkModal } from "./create-link-modal";
import { InboxTriage } from "./inbox-triage";
import { LinkCard } from "./link-card";
import { LinksListToolbar } from "./links-list-parts/links-list-toolbar";
import { useLinksListFilters } from "./links-list-parts/useLinksListFilters";
import { useViewMode, type ViewMode } from "./links-list-parts/useViewMode";
import { SuggestLinkOrgDialog } from "./suggest-link-org-dialog";

function LinksListSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "grid") {
    return <CardGridSkeleton />;
  }
  return <CardListSkeleton />;
}

function LoadingState({ viewMode }: { viewMode: ViewMode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="animate-pulse">
          <div className="h-6 w-24 rounded bg-background" />
          <div className="h-4 w-16 rounded bg-background mt-1.5" />
        </div>
        <div className="h-9 w-24 rounded-lg bg-background animate-pulse" />
      </div>
      <LinksListSkeleton viewMode={viewMode} />
    </div>
  );
}

interface LinksContentProps {
  filteredLinks: Link[];
  linkTagsByLinkId: ReturnType<typeof useLinksListFilters>["linkTagsByLinkId"];
  emptyLinkTags: ReturnType<typeof useLinksListFilters>["emptyLinkTags"];
  viewMode: ViewMode;
  siteUrl: string;
  tags: Tag[];
  folders: Folder[];
  handleLinkDeleted: (id: number) => void;
  handleLinkUpdated: (link: Link) => void;
  editCallbacks: EditLinkCallbacks;
  createButton: React.ReactNode;
  onSuggest?: (linkId: number) => void;
  suggestDisabled?: boolean;
}

function LinksContent(props: LinksContentProps) {
  const {
    filteredLinks,
    linkTagsByLinkId,
    emptyLinkTags,
    viewMode,
    siteUrl,
    tags,
    folders,
    handleLinkDeleted,
    handleLinkUpdated,
    editCallbacks,
    createButton,
    onSuggest,
    suggestDisabled,
  } = props;

  if (filteredLinks.length === 0) {
    return (
      <EmptyState
        icon={Link2}
        title="暂无链接"
        description="点击上方按钮创建您的第一个短链接"
        action={createButton}
      />
    );
  }

  return (
    <div
      className={
        viewMode === "grid"
          ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          : "space-y-2"
      }
    >
      {filteredLinks.map((link) => (
        <LinkCard
          key={link.id}
          link={link}
          siteUrl={siteUrl}
          onDelete={handleLinkDeleted}
          onUpdate={handleLinkUpdated}
          viewMode={viewMode}
          tags={tags}
          linkTags={linkTagsByLinkId.get(link.id) ?? emptyLinkTags}
          folders={folders}
          editCallbacks={editCallbacks}
          {...(onSuggest ? { onSuggest: () => onSuggest(link.id) } : {})}
          {...(suggestDisabled !== undefined ? { suggestDisabled } : {})}
        />
      ))}
    </div>
  );
}

export function LinksList() {
  const {
    links,
    folders,
    tags,
    linkTags,
    loading,
    handleLinkCreated,
    handleLinkDeleted,
    handleLinkUpdated,
    handleTagCreated,
    handleLinkTagAdded,
    handleLinkTagRemoved,
    refreshLinks,
    siteUrl,
  } = useDashboardService();

  const editCallbacks: EditLinkCallbacks = useMemo(
    () => ({
      onLinkUpdated: handleLinkUpdated,
      onTagCreated: handleTagCreated,
      onLinkTagAdded: handleLinkTagAdded,
      onLinkTagRemoved: handleLinkTagRemoved,
    }),
    [handleLinkUpdated, handleTagCreated, handleLinkTagAdded, handleLinkTagRemoved],
  );
  const suggestVm = useSuggestLinkOrgViewModel(editCallbacks);
  useEffect(() => {
    void suggestVm.refreshHasAiKey();
  }, [suggestVm.refreshHasAiKey]);

  // Batch-refresh metadata for links missing it (replaces per-card N+1 auto-fetch)
  useAutoRefreshMetadata(links, handleLinkUpdated);

  const isMobile = useIsMobile();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useViewMode("list");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filters = useLinksListFilters({ links, linkTags, folders });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshLinks();
      if (result.success) {
        toast.success("已刷新");
      } else {
        toast.error(result.error || "刷新失败");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshLinks]);

  if (loading) return <LoadingState viewMode={viewMode} />;
  if (filters.selectedFolderId === "uncategorized") return <InboxTriage />;

  const createButton = (
    <CreateLinkModal
      siteUrl={siteUrl}
      onSuccess={handleLinkCreated}
      folders={folders}
      tags={tags}
      onTagCreated={handleTagCreated}
    />
  );

  return (
    <div>
      <LinksListToolbar
        headerTitle={filters.headerTitle}
        linkCount={filters.filteredLinks.length}
        totalCount={links.length}
        hasActiveFilters={filters.hasActiveFilters}
        activeFilterCount={filters.activeFilterCount}
        isMobile={isMobile}
        mobileFilterOpen={mobileFilterOpen}
        setMobileFilterOpen={setMobileFilterOpen}
        createButton={createButton}
        folders={folders}
        tags={tags}
        filterFolderId={filters.filterFolderId}
        filterTagIds={filters.filterTagIds}
        onFolderChange={filters.setFilterFolderId}
        onToggleTag={filters.handleToggleFilterTag}
        onClearFilters={filters.handleClearFilters}
        showFolderFilter={!filters.selectedFolderId}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      <LinksContent
        filteredLinks={filters.filteredLinks}
        linkTagsByLinkId={filters.linkTagsByLinkId}
        emptyLinkTags={filters.emptyLinkTags}
        viewMode={viewMode}
        siteUrl={siteUrl}
        tags={tags}
        folders={folders}
        handleLinkDeleted={handleLinkDeleted}
        handleLinkUpdated={handleLinkUpdated}
        editCallbacks={editCallbacks}
        createButton={createButton}
        onSuggest={(id) => {
          void suggestVm.openForLink(id);
        }}
        suggestDisabled={!suggestVm.hasAiKey}
      />
      <SuggestLinkOrgDialog vm={suggestVm} />
    </div>
  );
}
