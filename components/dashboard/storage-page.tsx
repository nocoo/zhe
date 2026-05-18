/**
 * Storage management page — shows R2 and D1 usage stats with orphan file
 * detection and batch cleanup. Implementation is split across
 * ./storage-page-parts/*.tsx to keep each unit focused.
 */

"use client";

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
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/models/storage";
import type { StorageScanResult } from "@/models/storage";
import { useStoragePage } from "./storage-page-parts/useStoragePage";
import { SummaryGrid } from "./storage-page-parts/summary-grid";
import { SummaryCard } from "./storage-page-parts/summary-card";
import { D1Section } from "./storage-page-parts/d1-section";
import { R2Section } from "./storage-page-parts/r2-section";
import { StorageSkeleton } from "./storage-page-parts/storage-skeleton";

function DeleteConfirmDialog({
  open,
  onOpenChange,
  selectedKeys,
  data,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedKeys: Set<string>;
  data: StorageScanResult;
  onConfirm: () => void;
}) {
  const selectedBytes = data.r2.files
    .filter((f) => selectedKeys.has(f.key))
    .reduce((sum, f) => sum + f.size, 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除孤儿文件？</AlertDialogTitle>
          <AlertDialogDescription>
            即将从 R2 永久删除 {selectedKeys.size} 个文件
            {data.r2.files.length > 0 && (
              <>
                {" "}
                ({formatBytes(selectedBytes)})
              </>
            )}
            。仅确认为孤儿（D1 中无引用）的文件会被删除。此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            删除 {selectedKeys.size} 个文件
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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

      <DeleteConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        selectedKeys={selectedKeys}
        data={data}
        onConfirm={sp.handleCleanup}
      />
    </div>
  );
}
