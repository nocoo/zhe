"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { scanStorage, cleanupOrphanFiles } from "@/actions/storage";
import { computeSummary } from "@/models/storage";
import type { StorageScanResult } from "@/models/storage";

/** State + actions for the storage page (split out so the page component stays small). */
export function useStoragePage(initialData?: StorageScanResult) {
  const [data, setData] = useState<StorageScanResult | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [cleaning, setCleaning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const scan = useCallback(async () => {
    setLoading(true);
    setSelectedKeys(new Set());
    try {
      const result = await scanStorage();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        toast.error(result.error ?? "扫描存储失败");
      }
    } catch {
      toast.error("扫描存储失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData) return;
    scan();
  }, [scan, initialData]);

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllOrphans = useCallback(() => {
    if (!data) return;
    const orphanKeys = data.r2.files.filter((f) => !f.isReferenced).map((f) => f.key);
    setSelectedKeys(new Set(orphanKeys));
  }, [data]);

  const clearSelection = useCallback(() => setSelectedKeys(new Set()), []);

  const handleCleanup = useCallback(async () => {
    setShowConfirm(false);
    setCleaning(true);
    try {
      const keys = Array.from(selectedKeys);
      const result = await cleanupOrphanFiles(keys);
      if (result.success && result.data) {
        toast.success(
          `已删除 ${result.data.deleted} 个文件${
            result.data.skipped > 0 ? ` (${result.data.skipped} 个已跳过)` : ""
          }`,
        );
        if (data) {
          const deletedKeys = new Set(result.data.deletedKeys);
          const remainingFiles = data.r2.files.filter((f) => !deletedKeys.has(f.key));
          setData({
            ...data,
            r2: { ...data.r2, files: remainingFiles, summary: computeSummary(remainingFiles) },
          });
        }
        setSelectedKeys(new Set());
      } else {
        toast.error(result.error ?? "清理失败");
      }
    } catch {
      toast.error("清理孤儿文件失败");
    } finally {
      setCleaning(false);
    }
  }, [selectedKeys, data]);

  return {
    data, loading,
    selectedKeys,
    cleaning,
    showConfirm, setShowConfirm,
    scan,
    toggleKey,
    selectAllOrphans,
    clearSelection,
    handleCleanup,
  };
}
