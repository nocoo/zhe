"use client";

import { toast } from "@nocoo/basalt/components/toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyLinkOrganization } from "@/actions/link-organization";
import { createTag } from "@/actions/tags";
import {
  remainingFolderOptions,
  remainingTagOptions,
  type SuggestFolderOption,
  type SuggestNewTagOption,
  type SuggestTagOption,
} from "@/models/ai-suggest-link-org";
import {
  failedSuggestStep,
  type SuggestEvent,
  type SuggestStepId,
} from "@/models/ai-suggest-progress";
import { validateTagName } from "@/models/tags";
import type { LinkMutationCallbacks } from "@/viewmodels/useLinkMutations";

export type SuggestOptionSource = "ai" | "catalog";
export type SuggestFolderDraft = SuggestFolderOption & { source: SuggestOptionSource };
export interface SuggestTagDraft extends SuggestTagOption {
  checked: boolean;
  color?: string | undefined;
  source: SuggestOptionSource;
}

async function readSuggestEvents(res: Response, receive: (event: SuggestEvent) => void) {
  if (!res.body) throw new Error("无法读取整理进度");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) receive(JSON.parse(line) as SuggestEvent);
      if (chunk.done) break;
    }
    if (buffer.trim()) receive(JSON.parse(buffer) as SuggestEvent);
  } finally {
    reader.releaseLock();
  }
}

export function useSuggestLinkOrgViewModel(callbacks: LinkMutationCallbacks) {
  const [open, setOpen] = useState(false);
  const [linkId, setLinkId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [tagError, setTagError] = useState("");
  const [error, setError] = useState("");
  const [folders, setFolders] = useState<SuggestFolderDraft[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [tags, setTags] = useState<SuggestTagDraft[]>([]);
  const [newTagSuggestions, setNewTagSuggestions] = useState<SuggestNewTagOption[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [prompt, setPrompt] = useState("");
  const [rawText, setRawText] = useState("");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [stage, setStage] = useState<SuggestStepId>("prepare");
  const [failedStep, setFailedStep] = useState<SuggestStepId | null>(null);
  const [supplied, setSupplied] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [history, setHistory] = useState<unknown>(null);
  const [log, setLog] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const revision = useRef(0);
  const initialTagIds = useRef<string[]>([]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const openForLink = useCallback(async (id: number, regenerate = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLinkId(id);
    setOpen(true);
    setLoading(true);
    setError("");
    setTagError("");
    setReady(false);
    setStage("prepare");
    setPrompt("");
    setRawText("");
    setModel("");
    setProvider("");
    setDurationMs(null);
    setFailedStep(null);
    setSupplied([]);
    setNotices([]);
    setLog([]);
    setHistory(null);
    if (!regenerate) {
      setFolders([]);
      setTags([]);
      setNewTagSuggestions([]);
      setDraftTitle("");
      setDraftNote("");
    }
    let context: Extract<SuggestEvent, { type: "context" }> | undefined;
    let finished = false;
    const receive = (event: SuggestEvent) => {
      if (controller.signal.aborted) return;
      if (event.type === "stage") {
        setStage(event.stage);
        setLog((current) => [...current, event.message]);
        if (event.rawText !== undefined) setRawText(event.rawText);
      } else if (event.type === "context") {
        context = event;
        revision.current = event.revision;
        initialTagIds.current = event.current.tagIds;
        setSupplied(event.supplied);
        setNotices(event.notices);
        setPrompt(event.prompt);
        setModel(event.model);
        setProvider(event.provider);
        setHistory(event.historicalAnalysis);
        if (!regenerate) {
          setDraftTitle(event.current.title);
          setDraftNote(event.current.note);
        }
        setLog((current) => [
          ...current,
          `资料已就绪：${event.supplied.join("、")}`,
          ...event.notices,
        ]);
      } else if (event.type === "result") {
        if (!context) throw new Error("缺少来源资料状态，请重试");
        const result = event.result;
        setFolders([
          ...result.folders.map((f) => ({ ...f, source: "ai" as const })),
          ...remainingFolderOptions(result.folders, context.catalogs).map((f) => ({
            ...f,
            source: "catalog" as const,
          })),
        ]);
        setSelectedFolderId((result.folders[0] ?? { folderId: context.current.folderId }).folderId);
        const assigned = new Set(context.current.tagIds);
        const colors = new Map(context.catalogs.tags.map((tag) => [tag.id, tag.color]));
        setNewTagSuggestions(result.newTags ?? []);
        setTags([
          ...result.tags.map((t) => ({
            ...t,
            checked: true,
            color: colors.get(t.tagId),
            source: "ai" as const,
          })),
          ...remainingTagOptions(result.tags, context.catalogs).map((t) => ({
            ...t,
            checked: Boolean(t.tagId && assigned.has(t.tagId)),
            color: colors.get(t.tagId),
            source: "catalog" as const,
          })),
        ]);
        setDraftTitle(result.title);
        setDraftNote(result.note);
        setDurationMs(event.durationMs);
        setRawText(event.rawText);
        setStage("ready");
        setReady(true);
        finished = true;
        setLog((current) => [...current, "建议已生成，可以编辑并应用"]);
      } else {
        setError(event.message);
        setFailedStep(failedSuggestStep(event.reason));
        if (event.rawText !== undefined) setRawText(event.rawText);
        setLog((current) => [...current, event.message]);
        finished = true;
      }
    };
    try {
      const res = await fetch("/api/ai/suggest-link-org", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ linkId: id }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "获取建议失败");
      }
      await readSuggestEvents(res, receive);
      if (!finished) throw new Error("连接中断，建议尚未完成，请重试");
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "网络错误");
        setFailedStep("request");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    if (applying || creatingTag) return;
    request.current?.abort();
    setLoading(false);
    setOpen(false);
  }, [applying, creatingTag]);
  const toggleTag = useCallback(
    (index: number) =>
      setTags((current) =>
        current.map((t, i) => (i === index ? { ...t, checked: !t.checked } : t)),
      ),
    [],
  );
  const addTag = useCallback(
    async (raw: string) => {
      if (creatingTag) return false;
      const name = validateTagName(raw);
      if (!name) {
        setTagError("请输入有效的标签名称");
        return false;
      }
      const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        setTags((current) =>
          current.map((t) => (t.tagId === existing.tagId ? { ...t, checked: true } : t)),
        );
        setTagError("");
        return true;
      }
      setCreatingTag(true);
      setTagError("");
      try {
        const result = await createTag({ name });
        if (!result.success || !result.data) {
          setTagError("标签创建失败，请重试");
          return false;
        }
        const tag = result.data;
        callbacks.onTagCreated(tag);
        setTags((current) => [
          ...current,
          {
            tagId: tag.id,
            name: tag.name,
            color: tag.color,
            reason: "",
            checked: true,
            source: "catalog",
          },
        ]);
        return true;
      } catch {
        setTagError("标签创建失败，请重试");
        return false;
      } finally {
        setCreatingTag(false);
      }
    },
    [creatingTag, tags, callbacks],
  );
  const regenerate = useCallback(() => {
    if (linkId !== null) void openForLink(linkId, true);
  }, [linkId, openForLink]);
  const apply = useCallback(async () => {
    if (linkId === null || !ready || applying || creatingTag) return;
    setApplying(true);
    setError("");
    try {
      const result = await applyLinkOrganization({
        linkId,
        revision: revision.current,
        title: draftTitle,
        note: draftNote,
        folderId: selectedFolderId,
        tagIds: tags.filter((t) => t.checked).map((t) => t.tagId),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      callbacks.onLinkUpdated(result.data.link);
      const nextIds = new Set(result.data.tags.map((t) => t.id));
      for (const id of initialTagIds.current)
        if (!nextIds.has(id)) callbacks.onLinkTagRemoved(linkId, id);
      for (const tag of result.data.tags) {
        callbacks.onTagCreated(tag);
        if (!initialTagIds.current.includes(tag.id))
          callbacks.onLinkTagAdded({ linkId, tagId: tag.id });
      }
      toast.success("已应用整理，标题和备注已更新");
      setOpen(false);
    } catch {
      setError("保存失败，当前编辑内容已保留，请重试");
    } finally {
      setApplying(false);
    }
  }, [
    linkId,
    ready,
    applying,
    creatingTag,
    draftTitle,
    draftNote,
    selectedFolderId,
    tags,
    callbacks,
  ]);
  return {
    open,
    loading,
    applying,
    creatingTag,
    tagError,
    error,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    tags,
    newTagSuggestions: newTagSuggestions.filter(
      (suggestion) => !tags.some((tag) => tag.name.toLowerCase() === suggestion.name.toLowerCase()),
    ),
    draftTitle,
    setDraftTitle,
    draftNote,
    setDraftNote,
    prompt,
    rawText,
    model,
    provider,
    durationMs,
    failedStep,
    stage,
    supplied,
    notices,
    history,
    log,
    ready,
    openForLink,
    close,
    toggleTag,
    addTag,
    regenerate,
    apply,
  };
}
export type SuggestLinkOrgViewModel = ReturnType<typeof useSuggestLinkOrgViewModel>;
