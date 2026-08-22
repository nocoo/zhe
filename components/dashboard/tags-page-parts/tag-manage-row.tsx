"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTagStyles, type TagPaletteColor } from "@/models/tags";
import type { TagManageRow as TagManageRowData } from "@/viewmodels/useTagsViewModel";
import { TagColorPicker } from "./tag-color-picker";

interface TagManageRowProps {
  row: TagManageRowData;
  disabled: boolean;
  onRename: (id: string, name: string) => Promise<{ success: boolean }>;
  onRecolor: (id: string, color: TagPaletteColor) => Promise<{ success: boolean }>;
  onDelete: (id: string) => Promise<{ success: boolean }>;
}

function usageLabel(linkCount: number, ideaCount: number): string {
  const parts: string[] = [];
  if (linkCount > 0) parts.push(`${linkCount} 链接`);
  if (ideaCount > 0) parts.push(`${ideaCount} 想法`);
  return parts.length > 0 ? parts.join(" · ") : "未使用";
}

export function TagManageRow({ row, disabled, onRename, onRecolor, onDelete }: TagManageRowProps) {
  const [draft, setDraft] = useState(row.name);
  const styles = getTagStyles(row.name, row.color);

  useEffect(() => {
    setDraft(row.name);
  }, [row.name]);

  async function commitRename() {
    const next = draft.trim();
    if (!next || next === row.name) {
      setDraft(row.name);
      return;
    }
    const result = await onRename(row.id, next);
    if (!result.success) setDraft(row.name);
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-card bg-secondary p-3 md:flex-row md:items-center"
      data-testid="tag-manage-row"
      data-tag-id={row.id}
    >
      <span
        className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={styles.badge}
        data-testid="tag-badge"
        data-tag-name={row.name}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={styles.dot} />
        {row.name}
      </span>

      <Input
        size="sm"
        value={draft}
        disabled={disabled}
        aria-label={`重命名 ${row.name}`}
        className="md:max-w-48"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commitRename()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commitRename();
          }
          if (e.key === "Escape") {
            setDraft(row.name);
            e.currentTarget.blur();
          }
        }}
      />

      <TagColorPicker
        value={row.color}
        disabled={disabled}
        onChange={(color) => {
          void onRecolor(row.id, color);
        }}
      />

      <p className="text-xs text-muted-foreground md:ml-auto" data-testid="tag-usage">
        {usageLabel(row.linkCount, row.ideaCount)}
      </p>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={`删除 ${row.name}`}
            data-testid="tag-delete-btn"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除标签「{row.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              将从所有链接和想法上移除该标签，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void onDelete(row.id)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
