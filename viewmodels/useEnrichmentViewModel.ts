"use client";

import { toast } from "@nocoo/basalt/components/toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadEnrichmentTasksAction, retryEnrichmentTasksAction } from "@/actions/enrichment";
import type { EnrichmentScope } from "@/contexts/enrichment";
import { canRetryEnrichment, type EnrichmentTask } from "@/models/connector-activity";

export function useEnrichmentViewModel(scope: EnrichmentScope) {
  const [tasks, setTasks] = useState<EnrichmentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [source, setSource] = useState<string>(scope.source ?? "all");
  const [state, setState] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(new Set<number>());
  const [detailId, setDetailId] = useState<number | null>(scope.linkId ?? null);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    try {
      const result = await loadEnrichmentTasksAction();
      if (current !== version.current) return;
      if (!result.success || !result.tasks) throw new Error("load_failed");
      setTasks(result.tasks);
      setError(false);
    } catch {
      if (current === version.current) setError(true);
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10000);
    return () => {
      ++version.current;
      window.clearInterval(timer);
    };
  }, [refresh]);
  const filtered = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (source === "all" || task.source === source) &&
          (state === "all" ||
            (state === "retry" ? canRetryEnrichment(task) : task.state === state)) &&
          `${task.title} ${task.url} ${task.linkId}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [tasks, source, state, search],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 40));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * 40, (currentPage + 1) * 40);
  const retryable = visible.filter((task) => canRetryEnrichment(task));
  const selectedIds = retryable
    .filter((task) => selected.has(task.linkId))
    .map((task) => task.linkId);
  const changeFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(0);
    setSelected(new Set());
  };
  const retry = async (ids: number[]) => {
    if (retrying || !ids.length) return;
    setRetrying(true);
    try {
      const result = await retryEnrichmentTasksAction(ids);
      if (!result.success || !result.queued) throw new Error("retry_failed");
      if (result.queued.length) toast.success(`已将 ${result.queued.length} 条任务重新排队`);
      if (result.queued.length < ids.length) toast.info("部分任务状态已变化，已跳过");
      setSelected(new Set());
      await refresh();
    } catch {
      toast.error("重新排队失败，请稍后重试");
    } finally {
      setRetrying(false);
    }
  };
  return {
    tasks,
    loading,
    error,
    retrying,
    refresh,
    retry,
    source,
    state,
    search,
    currentPage,
    pages,
    filtered,
    visible,
    retryable,
    selectedIds,
    detailId,
    setDetailId,
    setSource: (value: string) => changeFilter(setSource, value),
    setState: (value: string) => changeFilter(setState, value),
    setSearch: (value: string) => changeFilter(setSearch, value),
    setPage: (value: number) => {
      setPage(value);
      setSelected(new Set());
    },
    toggle: (id: number) =>
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: () =>
      setSelected(
        selectedIds.length === retryable.length
          ? new Set()
          : new Set(retryable.map((task) => task.linkId)),
      ),
  };
}
