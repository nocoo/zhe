"use client";

import { useRef } from "react";
import { useSettingsViewModel } from "@/viewmodels/useSettingsViewModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, CheckCircle } from "lucide-react";

export function SettingsPage() {
  const {
    isExporting,
    isImporting,
    importResult,
    handleExport,
    handleImport,
    clearImportResult,
  } = useSettingsViewModel();

  const fileInputRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleImport(file);
    }
    // Reset so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      {/* ── 数据导出 ──────────────────────────────────────────────── */}
      <Card className="border-0 bg-secondary shadow-none">
        <CardHeader className="px-4 py-3 md:px-5 md:py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Download className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            数据导出
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
          <p className="mb-4 text-sm text-muted-foreground">
            将所有链接数据导出为 JSON 文件，可用于备份或迁移。
          </p>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            variant="outline"
            size="sm"
          >
            {isExporting ? "导出中..." : "导出链接"}
          </Button>
        </CardContent>
      </Card>

      {/* ── 数据导入 ──────────────────────────────────────────────── */}
      <Card className="border-0 bg-secondary shadow-none">
        <CardHeader className="px-4 py-3 md:px-5 md:py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Upload className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            数据导入
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
          <p className="mb-4 text-sm text-muted-foreground">
            从 JSON 文件导入链接数据。已存在的短链接将被自动跳过。
          </p>

          {isImporting ? (
            <p className="text-sm text-muted-foreground">导入中...</p>
          ) : importResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>
                  导入完成：成功 <strong>{importResult.created}</strong> 条，跳过{" "}
                  <strong>{importResult.skipped}</strong> 条
                </span>
              </div>
              <Button
                onClick={clearImportResult}
                variant="outline"
                size="sm"
              >
                确定
              </Button>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={onFileChange}
                data-testid="import-file-input"
                className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent/80 file:cursor-pointer"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
