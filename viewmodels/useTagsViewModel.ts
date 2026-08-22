"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createTag, deleteTag, updateTag } from "@/actions/tags";
import { useDashboardActions, useDashboardState } from "@/contexts/dashboard-service";
import {
  isDuplicateTagName,
  type TagPaletteColor,
  tagColorFromName,
  validateTagName,
} from "@/models/tags";

export interface TagManageRow {
  id: string;
  name: string;
  color: string;
  linkCount: number;
  ideaCount: number;
}

export type TagsViewModel = ReturnType<typeof useTagsViewModel>;

export function useTagsViewModel() {
  const { tags, linkTags, ideas } = useDashboardState();
  const { handleTagCreated, handleTagDeleted, handleTagUpdated, ensureIdeasLoaded } =
    useDashboardActions();

  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    void ensureIdeasLoaded();
  }, [ensureIdeasLoaded]);

  const rows = useMemo<TagManageRow[]>(() => {
    return [...tags]
      .sort((a, b) => a.name.localeCompare(b.name, "zh"))
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        linkCount: linkTags.filter((lt) => lt.tagId === tag.id).length,
        ideaCount: ideas.filter((idea) => idea.tagIds.includes(tag.id)).length,
      }));
  }, [tags, linkTags, ideas]);

  const startCreate = useCallback(() => setCreating(true), []);
  const cancelCreate = useCallback(() => setCreating(false), []);

  const handleCreate = useCallback(
    async (name: string, color?: TagPaletteColor) => {
      const validName = validateTagName(name);
      if (!validName) {
        toast.error("标签名无效");
        return { success: false as const };
      }
      if (isDuplicateTagName(validName, tags)) {
        toast.error("标签名已存在");
        return { success: false as const };
      }

      setSavingId("new");
      try {
        const result = await createTag({
          name: validName,
          color: color ?? tagColorFromName(validName),
        });
        if (result.success && result.data) {
          handleTagCreated(result.data);
          setCreating(false);
          toast.success("已创建标签");
          return { success: true as const };
        }
        toast.error(result.error || "创建标签失败");
        return { success: false as const };
      } finally {
        setSavingId(null);
      }
    },
    [handleTagCreated, tags],
  );

  const handleRename = useCallback(
    async (id: string, name: string) => {
      const validName = validateTagName(name);
      if (!validName) {
        toast.error("标签名无效");
        return { success: false as const };
      }
      if (isDuplicateTagName(validName, tags, id)) {
        toast.error("标签名已存在");
        return { success: false as const };
      }

      setSavingId(id);
      try {
        const result = await updateTag(id, { name: validName });
        if (result.success && result.data) {
          handleTagUpdated(result.data);
          toast.success("已重命名");
          return { success: true as const };
        }
        toast.error(result.error || "重命名失败");
        return { success: false as const };
      } finally {
        setSavingId(null);
      }
    },
    [handleTagUpdated, tags],
  );

  const handleRecolor = useCallback(
    async (id: string, color: TagPaletteColor) => {
      setSavingId(id);
      try {
        const result = await updateTag(id, { color });
        if (result.success && result.data) {
          handleTagUpdated(result.data);
          return { success: true as const };
        }
        toast.error(result.error || "更新颜色失败");
        return { success: false as const };
      } finally {
        setSavingId(null);
      }
    },
    [handleTagUpdated],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setSavingId(id);
      try {
        const result = await deleteTag(id);
        if (result.success) {
          handleTagDeleted(id);
          toast.success("已删除标签");
          return { success: true as const };
        }
        toast.error(result.error || "删除标签失败");
        return { success: false as const };
      } finally {
        setSavingId(null);
      }
    },
    [handleTagDeleted],
  );

  return {
    rows,
    creating,
    savingId,
    startCreate,
    cancelCreate,
    handleCreate,
    handleRename,
    handleRecolor,
    handleDelete,
  };
}
