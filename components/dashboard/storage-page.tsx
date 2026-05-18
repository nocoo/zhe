/**
 * Storage management page — shows R2 and D1 usage stats with orphan file
 * detection and batch cleanup.
 */

"use client";

import { useState, useCallback, Fragment } from "react";
import { useStoragePage } from "./storage-page-parts/useStoragePage";
import { SummaryGrid } from "./storage-page-parts/summary-grid";
import {
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Database,
  HardDrive,
  ImageIcon,
  FileText,
  File,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  formatBytes,
  getFileName,
  getFileCategory,
} from "@/models/storage";
import type { StorageScanResult, StorageFile } from "@/models/storage";

// ── Summary card ──

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  variant = "default",
  index = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  variant?: "default" | "warning" | "success";
  index?: number;
}) {
  return (
    <div
      className={cn(
        "animate-fade-up rounded-xl p-4",
        variant === "warning" && "bg-warning/5",
        variant === "success" && "bg-success/5",
        variant === "default" && "bg-secondary",
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <p className="mt-2 text-xl font-semibold font-display tabular-nums tracking-tight">{value}</p>
      {sub && (
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      )}
    </div>
  );
}

// ── D1 section ──

function D1Section({ data }: { data: StorageScanResult["d1"] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="text-sm font-medium">Cloudflare D1</h3>
        {data.connected ? (
          <Badge variant="success" className="text-[10px]">
            connected
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-[10px]">
            disconnected
          </Badge>
        )}
      </div>

      {data.connected && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Table
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                  Rows
                </th>
              </tr>
            </thead>
            <tbody>
              {data.tables.map((table) => (
                <tr
                  key={table.name}
                  className="border-t border-border hover:bg-accent/30 transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-foreground">
                    {table.name}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {table.rows.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── File icon helper ──

function FileIcon({ fileKey }: { fileKey: string }) {
  const category = getFileCategory(fileKey);
  if (category === "image") {
    return (
      <ImageIcon className="h-3.5 w-3.5 text-info shrink-0" strokeWidth={1.5} />
    );
  }
  if (category === "document") {
    return (
      <FileText className="h-3.5 w-3.5 text-warning shrink-0" strokeWidth={1.5} />
    );
  }
  return (
    <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
  );
}

// ── R2 file row ──

function R2FileRow({
  file,
  selected,
  onToggle,
}: {
  file: StorageFile;
  selected: boolean;
  onToggle: () => void;
}) {
  const isOrphan = !file.isReferenced;
  const isImage = getFileCategory(file.key) === "image";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors",
        isOrphan && "bg-warning/5",
      )}
    >
      {isOrphan ? (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${getFileName(file.key)}`}
        />
      ) : (
        <span className="w-4 shrink-0" />
      )}

      {/* Thumbnail for images, icon for others */}
      {isImage && file.publicUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={file.publicUrl}
          alt={getFileName(file.key)}
          className="h-8 w-8 rounded object-cover shrink-0 bg-secondary"
          loading="lazy"
        />
      ) : (
        <div className="h-8 w-8 rounded bg-secondary flex items-center justify-center shrink-0">
          <FileIcon fileKey={file.key} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono text-foreground truncate">
          {getFileName(file.key)}
        </p>
        <p className="text-xs text-muted-foreground truncate">{file.key}</p>
      </div>

      <span className="text-xs font-mono text-muted-foreground shrink-0">
        {formatBytes(file.size)}
      </span>

      {isOrphan ? (
        <Badge variant="warning" className="text-[10px] shrink-0">
          orphan
        </Badge>
      ) : (
        <Badge variant="success" className="text-[10px] shrink-0">
          linked
        </Badge>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        asChild
      >
        <a
          href={`https://s.zhe.to/${file.key}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`打开 ${getFileName(file.key)}`}
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
        </a>
      </Button>
    </div>
  );
}

// ── Sort types ──

type SortField = "time" | "size";
type SortDirection = "asc" | "desc";

// ── R2 section ──

function R2Section({
  data,
  selectedKeys,
  onToggleKey,
  onSelectAllOrphans,
  onClearSelection,
  onDeleteSelected,
  cleaning,
}: {
  data: StorageScanResult["r2"];
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
  onSelectAllOrphans: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  cleaning: boolean;
}) {
  const [sortField, setSortField] = useState<SortField>("time");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const hasOrphans = data.summary.orphanFiles > 0;

  // Compute selected size
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

  // Sort: orphans first, then by selected field + direction
  const sortedFiles = [...data.files].sort((a, b) => {
    if (a.isReferenced !== b.isReferenced) {
      return a.isReferenced ? 1 : -1;
    }
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "size") {
      return (a.size - b.size) * dir;
    }
    return a.lastModified.localeCompare(b.lastModified) * dir;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3" strokeWidth={1.5} />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3" strokeWidth={1.5} />
    ) : (
      <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="text-sm font-medium">Cloudflare R2</h3>
        {data.connected ? (
          <Badge variant="success" className="text-[10px]">
            connected
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-[10px]">
            disconnected
          </Badge>
        )}
      </div>

      {data.connected && (
        <Fragment>
          {/* Action bar */}
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
                    <AlertTriangle
                      className="h-3.5 w-3.5 text-warning"
                      strokeWidth={1.5}
                    />
                    选择全部孤儿文件
                  </Button>

                  {selectedKeys.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onClearSelection}
                    >
                      清除选择
                    </Button>
                  )}
                </Fragment>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Sort controls */}
              <div className="flex items-center gap-1" role="group" aria-label="排序">
                <Button
                  variant={sortField === "time" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleSort("time")}
                  className="gap-1 text-xs h-7 px-2"
                  role="columnheader"
                  aria-sort={sortField === "time" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  时间
                  <SortIcon field="time" />
                </Button>
                <Button
                  variant={sortField === "size" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggleSort("size")}
                  className="gap-1 text-xs h-7 px-2"
                  role="columnheader"
                  aria-sort={sortField === "size" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  大小
                  <SortIcon field="size" />
                </Button>
              </div>

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

          {/* File list */}
          {sortedFiles.length > 0 ? (
            <div className="rounded-xl border border-border overflow-hidden">
              {sortedFiles.map((file) => (
                <R2FileRow
                  key={file.key}
                  file={file}
                  selected={selectedKeys.has(file.key)}
                  onToggle={() => onToggleKey(file.key)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border p-8 text-center">
              <CheckCircle
                className="h-8 w-8 text-success mx-auto mb-2"
                strokeWidth={1.5}
              />
              <p className="text-sm text-muted-foreground">
                R2 存储为空
              </p>
            </div>
          )}
        </Fragment>
      )}
    </div>
  );
}

// ── Loading skeleton ──

function StorageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-secondary p-4 h-[88px]" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-5 w-32 rounded bg-secondary" />
        <div className="rounded-xl border border-border h-40" />
      </div>
      <div className="space-y-3">
        <div className="h-5 w-32 rounded bg-secondary" />
        <div className="rounded-xl border border-border h-60" />
      </div>
    </div>
  );
}

// ── Main component ──

export function StoragePage({ initialData }: { initialData?: StorageScanResult }) {
  const sp = useStoragePage(initialData);
  const { data, loading, selectedKeys, cleaning, showConfirm, setShowConfirm } = sp;

  if (loading && !data) {
    return <StorageSkeleton />;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <SummaryGrid data={data} SummaryCard={SummaryCard} />

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={sp.scan}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            strokeWidth={1.5}
          />
          重新扫描
        </Button>
      </div>

      <D1Section data={data.d1} />

      <R2Section
        data={data.r2}
        selectedKeys={selectedKeys}
        onToggleKey={sp.toggleKey}
        onSelectAllOrphans={sp.selectAllOrphans}
        onClearSelection={sp.clearSelection}
        onDeleteSelected={() => setShowConfirm(true)}
        cleaning={cleaning}
      />

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除孤儿文件？</AlertDialogTitle>
            <AlertDialogDescription>
              即将从 R2 永久删除 {selectedKeys.size} 个文件
              {data.r2.files.length > 0 && (
                <>
                  {" "}
                  (
                  {formatBytes(
                    data.r2.files
                      .filter((f) => selectedKeys.has(f.key))
                      .reduce((sum, f) => sum + f.size, 0),
                  )}
                  )
                </>
              )}
              。仅确认为孤儿（D1 中无引用）的文件会被删除。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={sp.handleCleanup}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              删除 {selectedKeys.size} 个文件
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
