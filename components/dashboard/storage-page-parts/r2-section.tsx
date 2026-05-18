"use client";

import { Fragment, useCallback, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle,
  HardDrive,
  Loader2,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/models/storage";
import type { StorageFile, StorageScanResult } from "@/models/storage";
import { R2FileRow } from "./r2-file-row";

type SortField = "time" | "size";
type SortDirection = "asc" | "desc";

interface R2SectionProps {
  data: StorageScanResult["r2"];
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
  onSelectAllOrphans: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  cleaning: boolean;
}

function R2Header({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <HardDrive className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      <h3 className="text-sm font-medium">Cloudflare R2</h3>
      {connected ? (
        <Badge variant="success" className="text-[10px]">connected</Badge>
      ) : (
        <Badge variant="destructive" className="text-[10px]">disconnected</Badge>
      )}
    </div>
  );
}

function SortIcon({
  field,
  active,
  dir,
}: {
  field: SortField;
  active: SortField;
  dir: SortDirection;
}) {
  if (field !== active) {
    return <ArrowUpDown className="h-3 w-3" strokeWidth={1.5} />;
  }
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3" strokeWidth={1.5} />
  ) : (
    <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
  );
}

function SortControls({
  sortField,
  sortDir,
  toggleSort,
}: {
  sortField: SortField;
  sortDir: SortDirection;
  toggleSort: (field: SortField) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="排序">
      {(["time", "size"] as const).map((field) => (
        <Button
          key={field}
          variant={sortField === field ? "secondary" : "ghost"}
          size="sm"
          onClick={() => toggleSort(field)}
          className="gap-1 text-xs h-7 px-2"
          role="columnheader"
          aria-sort={
            sortField === field
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
        >
          {field === "time" ? "时间" : "大小"}
          <SortIcon field={field} active={sortField} dir={sortDir} />
        </Button>
      ))}
    </div>
  );
}

interface ActionBarProps {
  hasOrphans: boolean;
  selectedKeys: Set<string>;
  selectedSize: number;
  cleaning: boolean;
  sortField: SortField;
  sortDir: SortDirection;
  toggleSort: (field: SortField) => void;
  onSelectAllOrphans: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
}

function ActionBar(props: ActionBarProps) {
  const {
    hasOrphans,
    selectedKeys,
    selectedSize,
    cleaning,
    sortField,
    sortDir,
    toggleSort,
    onSelectAllOrphans,
    onClearSelection,
    onDeleteSelected,
  } = props;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {hasOrphans && (
          <Fragment>
            <Button
              variant="outline"
              size="sm"
              onClick={onSelectAllOrphans}
              className="gap-1.5"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-warning" strokeWidth={1.5} />
              选择全部孤儿文件
            </Button>
            {selectedKeys.size > 0 && (
              <Button variant="ghost" size="sm" onClick={onClearSelection}>
                清除选择
              </Button>
            )}
          </Fragment>
        )}
      </div>

      <div className="flex items-center gap-2">
        <SortControls sortField={sortField} sortDir={sortDir} toggleSort={toggleSort} />

        {selectedKeys.size > 0 && (
          <Fragment>
            <span className="text-xs text-muted-foreground">
              已选 {selectedKeys.size} 个文件 ({formatBytes(selectedSize)})
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDeleteSelected}
              disabled={cleaning}
              className="gap-1.5"
            >
              {cleaning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              )}
              删除选中
            </Button>
          </Fragment>
        )}
      </div>
    </div>
  );
}

function FileList({
  files,
  selectedKeys,
  onToggleKey,
}: {
  files: StorageFile[];
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
}) {
  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-border p-8 text-center">
        <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">R2 存储为空</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {files.map((file) => (
        <R2FileRow
          key={file.key}
          file={file}
          selected={selectedKeys.has(file.key)}
          onToggle={() => onToggleKey(file.key)}
        />
      ))}
    </div>
  );
}

/** Sort: orphans first, then by selected field + direction. */
function sortFiles(files: StorageFile[], field: SortField, dir: SortDirection): StorageFile[] {
  return [...files].sort((a, b) => {
    if (a.isReferenced !== b.isReferenced) return a.isReferenced ? 1 : -1;
    const sign = dir === "asc" ? 1 : -1;
    if (field === "size") return (a.size - b.size) * sign;
    return a.lastModified.localeCompare(b.lastModified) * sign;
  });
}

export function R2Section(props: R2SectionProps) {
  const {
    data,
    selectedKeys,
    onToggleKey,
    onSelectAllOrphans,
    onClearSelection,
    onDeleteSelected,
    cleaning,
  } = props;

  const [sortField, setSortField] = useState<SortField>("time");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const hasOrphans = data.summary.orphanFiles > 0;

  const selectedSize = data.files
    .filter((f) => selectedKeys.has(f.key))
    .reduce((sum, f) => sum + f.size, 0);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("desc");
      return field;
    });
  }, []);

  const sortedFiles = sortFiles(data.files, sortField, sortDir);

  return (
    <div className="space-y-3">
      <R2Header connected={data.connected} />

      {data.connected && (
        <Fragment>
          <ActionBar
            hasOrphans={hasOrphans}
            selectedKeys={selectedKeys}
            selectedSize={selectedSize}
            cleaning={cleaning}
            sortField={sortField}
            sortDir={sortDir}
            toggleSort={toggleSort}
            onSelectAllOrphans={onSelectAllOrphans}
            onClearSelection={onClearSelection}
            onDeleteSelected={onDeleteSelected}
          />
          <FileList
            files={sortedFiles}
            selectedKeys={selectedKeys}
            onToggleKey={onToggleKey}
          />
        </Fragment>
      )}
    </div>
  );
}
