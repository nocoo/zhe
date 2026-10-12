"use client";

import {
  BarChart3,
  Check,
  Copy,
  Eye,
  EyeOff,
  ListRestart,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { useOpenEnrichment } from "@/contexts/enrichment";
import { destroyCard } from "@/lib/motion";
import type { BookmarkAction } from "@/models/bookmark-actions";
import type { Link } from "@/models/types";
import { useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";

export function useBookmarkCardViewModel({
  link,
  siteUrl,
  onUpdate,
  onDelete,
  onSuggest,
  suggestDisabled,
  editable,
}: {
  link: Link;
  siteUrl: string;
  onUpdate: (link: Link) => void;
  onDelete: (id: number) => void;
  onSuggest?: (() => void) | undefined;
  suggestDisabled?: boolean | undefined;
  editable: boolean;
}) {
  const card = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const openEnrichment = useOpenEnrichment();
  const vm = useLinkCardViewModel(
    link,
    siteUrl,
    async () => {
      const next =
        card.current?.closest("[data-card-layout-item]")?.nextElementSibling ??
        card.current?.closest("[data-card-layout-item]")?.previousElementSibling;
      await destroyCard(card.current);
      setConfirmDelete(false);
      onDelete(link.id);
      (
        next?.querySelector<HTMLElement>('[aria-label="更多收藏操作"]') ??
        document.querySelector<HTMLElement>('[aria-label="多选卡片"]')
      )?.focus({ preventScroll: true });
    },
    onUpdate,
  );

  const actions: BookmarkAction[] = [
    {
      id: "organize",
      label: "AI 整理",
      icon: Sparkles,
      placement: "toolbar",
      run: () => onSuggest?.(),
      disabled: !onSuggest || suggestDisabled,
      description: !onSuggest || suggestDisabled ? "请先在设置中配置 AI" : undefined,
    },
    {
      id: "copy-original",
      label: vm.copiedOriginalUrl ? "已复制原链接" : "复制原链接",
      icon: vm.copiedOriginalUrl ? Check : Copy,
      placement: "copy",
      run: vm.handleCopyOriginalUrl,
    },
    {
      id: "copy-short",
      label: vm.copied ? "已复制短链接" : "复制短链接",
      icon: vm.copied ? Check : Copy,
      placement: "copy",
      run: vm.handleCopy,
    },
    {
      id: "edit",
      label: "修改收藏",
      icon: Pencil,
      placement: "menu",
      run: () => setEditing(true),
      disabled: !editable,
    },
    {
      id: "enrichment",
      label: "数据采集",
      icon: ListRestart,
      placement: "menu",
      run: () => openEnrichment({ linkId: link.id }),
    },
    {
      id: "analytics",
      label: "访问统计",
      icon: BarChart3,
      placement: "menu",
      run: vm.handleToggleAnalytics,
    },
    {
      id: "visibility",
      label: link.isHidden ? "取消隐藏" : "隐藏帖子",
      icon: link.isHidden ? Eye : EyeOff,
      placement: "menu",
      run: vm.handleToggleHidden,
      disabled: vm.isSavingVisibility,
      pending: vm.isSavingVisibility,
    },
    {
      id: "delete",
      label: "删除收藏",
      icon: Trash2,
      placement: "menu",
      run: () => setConfirmDelete(true),
      destructive: true,
      disabled: vm.isDeleting,
    },
  ];
  return {
    ...vm,
    card,
    menuTrigger,
    actions,
    editing,
    setEditing,
    confirmDelete,
    setConfirmDelete,
  };
}

export type BookmarkCardViewModel = ReturnType<typeof useBookmarkCardViewModel>;
