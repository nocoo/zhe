"use client";

import { useEffect, useRef, useState } from "react";

export interface BulkItem {
  id: number;
  label: string;
}
type Failure = BulkItem & { error: string };
type Batch = {
  phase: "confirm" | "running" | "done";
  items: BulkItem[];
  processed: number;
  failures: Failure[];
};

/** Freeze each batch, await every deep deletion, and keep failed items available to retry. */
export function useBulkDelete(
  items: BulkItem[],
  deleteItem: (id: number) => Promise<{ success: boolean; error?: string | undefined }>,
) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState(new Set<number>());
  const [batch, setBatch] = useState<Batch | null>(null);
  const running = useRef(false);
  const visibleIds = items.map((item) => item.id).join(",");
  const visibleSelection = items.filter((item) => selected.has(item.id));

  useEffect(() => {
    const ids = new Set(visibleIds.split(",").map(Number));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleIds]);

  useEffect(() => {
    if (batch?.phase !== "running") return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [batch?.phase]);

  useEffect(() => {
    if (batch?.phase !== "done" || batch.failures.length) return;
    const timer = window.setTimeout(() => {
      setActive(false);
      setBatch(null);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [batch]);

  const toggle = (id: number) => {
    if (running.current) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const close = () => {
    if (running.current) return;
    if (batch?.phase === "done" && !batch.failures.length) setActive(false);
    setBatch(null);
  };
  const execute = async () => {
    if (!batch || running.current) return;
    const queue = batch.phase === "done" ? batch.failures : batch.items;
    if (!queue.length) return;
    running.current = true;
    let progress: Batch = { phase: "running", items: [...queue], processed: 0, failures: [] };
    setBatch(progress);
    for (const item of queue) {
      let error: string | undefined;
      try {
        const result = await deleteItem(item.id);
        if (!result.success) error = result.error || "删除失败，请重试";
      } catch {
        error = "请求失败，请重试";
      }
      if (!error)
        setSelected((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      progress = {
        ...progress,
        processed: progress.processed + 1,
        failures: error ? [...progress.failures, { ...item, error }] : progress.failures,
      };
      setBatch(progress);
    }
    running.current = false;
    setBatch({ ...progress, phase: "done" });
  };

  return {
    active,
    selected,
    batch,
    toggle,
    deselect: (id: number) =>
      setSelected((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      }),
    close,
    execute,
    count: visibleSelection.length,
    total: items.length,
    enter: () => setActive(true),
    exit: () => {
      if (!running.current) {
        setActive(false);
        setSelected(new Set());
      }
    },
    selectAll: () =>
      setSelected(
        new Set(visibleSelection.length === items.length ? [] : items.map((item) => item.id)),
      ),
    requestDelete: () => {
      if (visibleSelection.length)
        setBatch({ phase: "confirm", items: visibleSelection, processed: 0, failures: [] });
    },
  };
}

export type BulkDeleteState = ReturnType<typeof useBulkDelete>;
