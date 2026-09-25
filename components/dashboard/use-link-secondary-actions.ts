"use client";

import { Eye, EyeOff, ListRestart } from "lucide-react";
import { useOpenEnrichment } from "@/contexts/enrichment";
import type { CardAction } from "./card-actions";

export function useLinkSecondaryActions(
  link: { id: number; isHidden: boolean },
  pending: boolean,
  onToggle: () => void,
): CardAction[] {
  const open = useOpenEnrichment();
  return [
    {
      label: link.isHidden ? "取消隐藏" : "隐藏帖子",
      icon: link.isHidden ? EyeOff : Eye,
      disabled: pending,
      pending,
      onSelect: onToggle,
    },
    { label: "查看补全记录", icon: ListRestart, onSelect: () => open({ linkId: link.id }) },
  ];
}
