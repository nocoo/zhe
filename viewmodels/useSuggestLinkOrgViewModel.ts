"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { updateLink, updateLinkNote } from "@/actions/links";
import { ensureTagOnLink } from "@/actions/tags";
import {
  remainingFolderOptions,
  remainingTagOptions,
  type SuggestCatalogs,
  type SuggestFolderOption,
  type SuggestTagOption,
} from "@/models/ai-suggest-link-org";
import { failedSuggestStep, type SuggestStepId } from "@/models/ai-suggest-progress";
import type { LinkMutationCallbacks } from "@/viewmodels/useLinkMutations";

export type SuggestOptionSource = "ai" | "catalog";

export type SuggestFolderDraft = SuggestFolderOption & { source: SuggestOptionSource };

export interface SuggestTagDraft extends SuggestTagOption {
  checked: boolean;
  draftName: string;
  source: SuggestOptionSource;
}

function asCatalogs(value: SuggestCatalogs | undefined): SuggestCatalogs {
  return {
    folders: value?.folders ?? [],
    tags: value?.tags ?? [],
  };
}

export async function loadHasAiKey(): Promise<boolean> {
  try {
    const res = await fetch("/api/settings/ai");
    const data = (await res.json()) as { hasApiKey?: boolean };
    return Boolean(data.hasApiKey);
  } catch {
    return false;
  }
}

export function useSuggestLinkOrgViewModel(callbacks: LinkMutationCallbacks) {
  const [open, setOpen] = useState(false);
  const [linkId, setLinkId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [folders, setFolders] = useState<SuggestFolderDraft[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [tags, setTags] = useState<SuggestTagDraft[]>([]);
  const [draftNote, setDraftNote] = useState("");
  const [hasAiKey, setHasAiKey] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [rawText, setRawText] = useState("");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [failedStep, setFailedStep] = useState<SuggestStepId | null>(null);

  const refreshHasAiKey = useCallback(async () => {
    const value = await loadHasAiKey();
    setHasAiKey(value);
    return value;
  }, []);

  const openForLink = useCallback(async (id: number) => {
    setLinkId(id);
    setOpen(true);
    setLoading(true);
    setError("");
    setFolders([]);
    setTags([]);
    setDraftNote("");
    setPrompt("");
    setRawText("");
    setModel("");
    setProvider("");
    setDurationMs(null);
    setFailedStep(null);
    try {
      const res = await fetch("/api/ai/suggest-link-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: id }),
      });
      const data = (await res.json()) as {
        folders?: SuggestFolderOption[];
        tags?: SuggestTagOption[];
        note?: string;
        catalogs?: SuggestCatalogs;
        error?: string;
        reason?: string;
        prompt?: string;
        rawText?: string;
        model?: string;
        provider?: string;
        durationMs?: number;
      };
      if (typeof data.prompt === "string") setPrompt(data.prompt);
      if (typeof data.rawText === "string") setRawText(data.rawText);
      if (typeof data.model === "string") setModel(data.model);
      if (typeof data.provider === "string") setProvider(data.provider);
      if (typeof data.durationMs === "number") setDurationMs(data.durationMs);
      if (!res.ok || !data.folders || !data.tags) {
        setError(data.error || "获取建议失败");
        setFailedStep(failedSuggestStep(data.reason));
        return;
      }
      const catalogs = asCatalogs(data.catalogs);
      setFolders([
        ...data.folders.map((folder) => ({ ...folder, source: "ai" as const })),
        ...remainingFolderOptions(data.folders, catalogs).map((folder) => ({
          ...folder,
          source: "catalog" as const,
        })),
      ]);
      setSelectedFolderId(data.folders[0]?.folderId ?? null);
      setTags([
        ...data.tags.map((tag, index) => ({
          ...tag,
          checked: index < Math.min(3, data.tags?.length ?? 0),
          draftName: tag.name,
          source: "ai" as const,
        })),
        ...remainingTagOptions(data.tags, catalogs).map((tag) => ({
          ...tag,
          checked: false,
          draftName: tag.name,
          source: "catalog" as const,
        })),
      ]);
      setDraftNote(data.note ?? "");
    } catch {
      setError("网络错误");
      setFailedStep("request");
    } finally {
      setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const toggleTag = useCallback((index: number) => {
    setTags((current) =>
      current.map((tag, i) => (i === index ? { ...tag, checked: !tag.checked } : tag)),
    );
  }, []);

  const renameTag = useCallback((index: number, name: string) => {
    setTags((current) =>
      current.map((tag, i) => (i === index ? { ...tag, draftName: name } : tag)),
    );
  }, []);

  const apply = useCallback(async () => {
    if (linkId === null) return;
    setApplying(true);
    try {
      const folderResult = await updateLink(linkId, { folderId: selectedFolderId });
      if (!folderResult.success || !folderResult.data) {
        toast.error(folderResult.error || "应用文件夹失败");
        return;
      }
      callbacks.onLinkUpdated(folderResult.data);

      const noteResult = await updateLinkNote(linkId, draftNote.trim() || null);
      if (!noteResult.success || !noteResult.data) {
        toast.error(noteResult.error || "应用备注失败");
        return;
      }
      callbacks.onLinkUpdated(noteResult.data);

      let tagFailed = false;
      const remaining: SuggestTagDraft[] = [];
      for (const tag of tags) {
        if (!tag.checked) {
          remaining.push(tag);
          continue;
        }
        const result = await ensureTagOnLink(linkId, tag.draftName);
        if (!result.success || !result.data) {
          toast.error(result.error || "部分标签未能应用");
          tagFailed = true;
          remaining.push(tag);
          continue;
        }
        callbacks.onTagCreated(result.data.tag);
        if (result.data.attached) {
          callbacks.onLinkTagAdded({ linkId, tagId: result.data.tag.id });
        }
      }
      if (tagFailed) {
        setTags(remaining);
        return;
      }
      toast.success("已应用建议");
      setOpen(false);
    } finally {
      setApplying(false);
    }
  }, [linkId, selectedFolderId, draftNote, tags, callbacks]);

  return {
    open,
    loading,
    applying,
    error,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    tags,
    draftNote,
    setDraftNote,
    prompt,
    rawText,
    model,
    provider,
    durationMs,
    failedStep,
    hasAiKey,
    refreshHasAiKey,
    openForLink,
    close,
    toggleTag,
    renameTag,
    apply,
  };
}

export type SuggestLinkOrgViewModel = ReturnType<typeof useSuggestLinkOrgViewModel>;
