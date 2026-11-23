"use client";

import { LayerCard } from "@nocoo/basalt";
import { toast } from "@nocoo/basalt/components/toast";
import { Link2 } from "@nocoo/basalt/icons";
import { useCallback, useMemo, useState } from "react";
import { deleteLink } from "@/actions/links";
import { AnimatedCardList } from "@/components/animated-card-list";
import {
  BOOKMARK_GRID_CLASS,
  CardGridSkeleton,
  CardListSkeleton,
} from "@/components/dashboard/card-skeleton";
import { PageHeaderSkeleton } from "@/components/page-header-skeleton";
import { useDashboardService } from "@/contexts/dashboard-service";
import { useIsMobile } from "@/hooks/use-mobile";
import { staggerStyle } from "@/lib/motion";
import type { Folder, Link, Tag } from "@/models/types";
import { type BulkDeleteState, useBulkDelete } from "@/viewmodels/useBulkDelete";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { useAutoRefreshMetadata } from "@/viewmodels/useLinksViewModel";
import { useSuggestLinkOrgViewModel } from "@/viewmodels/useSuggestLinkOrgViewModel";
import { BulkDeleteActions, SelectableCard } from "./bulk-delete";
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

function LoadingState({ viewMode, ready }: { viewMode: ViewMode; ready: boolean }) {
  return (
    <div className="space-y-basalt-layout">
      <PageHeaderSkeleton />
      {ready && <LinksListSkeleton viewMode={viewMode} />}
    </div>
  );
}

interface LinksContentProps {
  selection: BulkDeleteState;
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
  onSuggest?: (linkId: number) => void;
  suggestDisabled?: boolean;
}

function LinksContent(props: LinksContentProps) {
  const {
    selection,
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
    onSuggest,
    suggestDisabled,
  } = props;

  if (filteredLinks.length === 0) {
    return (
      <LayerCard padding="none">
        <LayerCard.Empty
          icon={<Link2 className="size-10" strokeWidth={1.5} />}
          title="暂无链接"
          description="点击右下角加号创建您的第一个短链接"
        />
      </LayerCard>
    );
  }

  return (
    <AnimatedCardList
      className={viewMode === "grid" ? BOOKMARK_GRID_CLASS : "space-y-basalt-layout-sm"}
      data-testid={viewMode === "grid" ? "card-grid" : "card-list"}
    >
      {filteredLinks.map((link, i) => (
        <SelectableCard
          selection={selection}
          itemId={link.id}
          label={link.title || link.metaTitle || link.originalUrl}
          key={link.id}
          className="animate-fade-up"
          style={staggerStyle(i)}
        >
          <LinkCard
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
        </SelectableCard>
      ))}
    </AnimatedCardList>
  );
}

export function LinksList() {
  const {
    links,
    folders,
    tags,
    linkTags,
    loading,
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

  // Batch-refresh metadata for links missing it (replaces per-card N+1 auto-fetch)
  useAutoRefreshMetadata(links, handleLinkUpdated);

  const isMobile = useIsMobile();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [viewMode, setViewMode, viewReady] = useViewMode("list");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filters = useLinksListFilters({ links, linkTags, folders });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshLinks();
      if (result.success) {
        toast.success("已刷新");
      } else {
        toast.danger(result.error || "刷新失败");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshLinks]);

  const selection = useBulkDelete(
    filters.filteredLinks.map((link) => ({
      id: link.id,
      label: link.title || link.metaTitle || link.originalUrl,
    })),
    async (id) => {
      const result = await deleteLink(id);
      if (result.success) handleLinkDeleted(id);
      return result;
    },
  );
  if (loading || !viewReady) return <LoadingState viewMode={viewMode} ready={viewReady} />;

  return (
    <div className="space-y-basalt-layout">
      <LinksListToolbar
        showHidden={filters.showHidden}
        onToggleHidden={() => filters.setShowHidden((value) => !value)}
        specialSources={filters.specialSources}
        headerTitle={filters.headerTitle}
        linkCount={filters.filteredLinks.length}
        totalCount={links.length}
        hasActiveFilters={filters.hasActiveFilters}
        activeFilterCount={filters.activeFilterCount}
        isMobile={isMobile}
        mobileFilterOpen={mobileFilterOpen}
        setMobileFilterOpen={setMobileFilterOpen}
        selecting={selection.active}
        selectionActions={<BulkDeleteActions selection={selection} />}
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
        selection={selection}
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
        onSuggest={(id) => {
          void suggestVm.openForLink(id);
        }}
      />
      <SuggestLinkOrgDialog vm={suggestVm} />
    </div>
  );
}
