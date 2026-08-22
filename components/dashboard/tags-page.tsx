"use client";

import { Plus, Tags } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { type TagPaletteColor, tagColorFromName } from "@/models/tags";
import { useTagsViewModel } from "@/viewmodels/useTagsViewModel";
import { TagColorPicker } from "./tags-page-parts/tag-color-picker";
import { TagManageRow } from "./tags-page-parts/tag-manage-row";

export function TagsPage() {
  const vm = useTagsViewModel();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagPaletteColor>(tagColorFromName(""));
  const [colorTouched, setColorTouched] = useState(false);

  function resetCreate() {
    setNewName("");
    setNewColor(tagColorFromName(""));
    setColorTouched(false);
    vm.cancelCreate();
  }

  async function submitCreate() {
    const result = await vm.handleCreate(newName, newColor);
    if (result.success) {
      setNewName("");
      setNewColor(tagColorFromName(""));
      setColorTouched(false);
    }
  }

  return (
    <div data-testid="tags-page">
      <PageHeader
        title="标签"
        description={`共 ${vm.rows.length} 个`}
        actions={
          <Button
            size="xs"
            onClick={vm.startCreate}
            disabled={vm.creating}
            data-testid="tag-create-btn"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            新建标签
          </Button>
        }
      />

      {vm.creating && (
        <div
          className="mb-4 flex flex-col gap-3 rounded-card bg-secondary p-3 md:flex-row md:items-center"
          data-testid="tag-create-form"
        >
          <Input
            size="sm"
            value={newName}
            placeholder="标签名"
            aria-label="新标签名"
            className="md:max-w-48"
            autoFocus
            onChange={(e) => {
              const next = e.target.value;
              setNewName(next);
              if (!colorTouched) setNewColor(tagColorFromName(next));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitCreate();
              if (e.key === "Escape") resetCreate();
            }}
          />
          <TagColorPicker
            value={newColor}
            onChange={(color) => {
              setColorTouched(true);
              setNewColor(color);
            }}
          />
          <div className="flex items-center gap-2 md:ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={resetCreate}
              disabled={vm.savingId === "new"}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => void submitCreate()}
              disabled={vm.savingId === "new"}
              data-testid="tag-create-submit"
            >
              创建
            </Button>
          </div>
        </div>
      )}

      {vm.rows.length === 0 && !vm.creating ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Tags className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground" data-testid="tags-empty">
            还没有标签。创建一个来组织链接和想法。
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="tags-list">
          {vm.rows.map((row) => (
            <TagManageRow
              key={row.id}
              row={row}
              disabled={vm.savingId === row.id}
              onRename={vm.handleRename}
              onRecolor={vm.handleRecolor}
              onDelete={vm.handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
