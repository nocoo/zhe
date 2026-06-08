"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { importLinks, exportLinks } from "@/actions/settings";
import type { ImportResult } from "@/actions/settings";

/** Return type of useSettingsViewModel — can be used as a prop type */
export type SettingsViewModel = ReturnType<typeof useSettingsViewModel>;

/**
 * Settings viewmodel — manages export/import state and actions.
 */
export function useSettingsViewModel() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await exportLinks();
      if (!result.success || !result.data) {
        toast.error(result.error || "导出失败");
        return;
      }

      // Trigger browser download
      const json = JSON.stringify(result.data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zhe-links-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("导出成功");
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleImport = useCallback(async (file: File) => {
    setIsImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error("文件不是有效的 JSON 格式");
        return;
      }

      const result = await importLinks(parsed as Parameters<typeof importLinks>[0]);
      if (!result.success) {
        toast.error(result.error || "导入失败");
        return;
      }

      setImportResult(result.data ?? null);
      if (result.data) {
        toast.success(
          `导入完成:成功 ${result.data.created} 条,跳过 ${result.data.skipped} 条`,
        );
      }
    } finally {
      setIsImporting(false);
    }
  }, []);

  const clearImportResult = useCallback(() => {
    setImportResult(null);
  }, []);

  return {
    isExporting,
    isImporting,
    importResult,
    handleExport,
    handleImport,
    clearImportResult,
  };
}
