"use client";

import { useState, useCallback } from "react";
import { importLinks, exportLinks, updatePreviewStyle } from "@/actions/settings";
import type { ImportResult } from "@/actions/settings";
import { useDashboardService } from "@/contexts/dashboard-service";
import type { PreviewStyle } from "@/models/settings";

/** Return type of useSettingsViewModel — can be used as a prop type */
export type SettingsViewModel = ReturnType<typeof useSettingsViewModel>;

/**
 * Settings viewmodel — manages export/import state, preview style, and actions.
 */
export function useSettingsViewModel() {
  const { previewStyle, setPreviewStyle } = useDashboardService();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await exportLinks();
      if (!result.success || !result.data) {
        alert(result.error || "导出失败");
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
        alert("文件不是有效的 JSON 格式");
        return;
      }

      const result = await importLinks(parsed as Parameters<typeof importLinks>[0]);
      if (!result.success) {
        alert(result.error || "导入失败");
        return;
      }

      setImportResult(result.data!);
    } finally {
      setIsImporting(false);
    }
  }, []);

  const clearImportResult = useCallback(() => {
    setImportResult(null);
  }, []);

  const handlePreviewStyleChange = useCallback(
    async (newStyle: PreviewStyle) => {
      const previous = previewStyle;
      // Optimistic update
      setPreviewStyle(newStyle);
      const result = await updatePreviewStyle(newStyle);
      if (!result.success) {
        // Rollback on failure
        setPreviewStyle(previous);
      }
    },
    [previewStyle, setPreviewStyle],
  );

  return {
    isExporting,
    isImporting,
    importResult,
    previewStyle,
    handleExport,
    handleImport,
    clearImportResult,
    handlePreviewStyleChange,
  };
}
