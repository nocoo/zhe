"use client";

import { LayerCard } from "@nocoo/basalt";
import { Button } from "@nocoo/basalt/components/button";
import { Input } from "@nocoo/basalt/components/input";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { Tags } from "@nocoo/basalt/icons";
import { useState } from "react";
import { usePageCreateAction } from "@/contexts/create-action";
import { staggerStyle } from "@/lib/motion";
import { type TagPaletteColor, tagColorFromName } from "@/models/tags";
import { useTagsViewModel } from "@/viewmodels/useTagsViewModel";
import { TagColorPicker } from "./tags-page-parts/tag-color-picker";
import { TagManageRow } from "./tags-page-parts/tag-manage-row";

export function TagsPage() {
  const vm = useTagsViewModel();
  usePageCreateAction({ label: "新建标签", onClick: vm.startCreate, disabled: vm.creating });
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
    <div className="space-y-basalt-layout" data-testid="tags-page">
      <PageHeader title="标签" description={`共 ${vm.rows.length} 个`} />

      {vm.creating && (
        <LayerCard
          padding="none"
          className="flex flex-col gap-3 bg-basalt-secondary p-3 md:flex-row md:items-center"
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
              size="default"
              variant="outline"
              onClick={resetCreate}
              disabled={vm.savingId === "new"}
            >
              取消
            </Button>
            <Button
              size="default"
              onClick={() => void submitCreate()}
              disabled={vm.savingId === "new"}
              data-testid="tag-create-submit"
            >
              创建
            </Button>
          </div>
        </LayerCard>
      )}

      {vm.rows.length === 0 && !vm.creating ? (
        <LayerCard padding="none">
          <LayerCard.Empty
            icon={<Tags className="size-10" strokeWidth={1.5} />}
            title="还没有标签"
            description="创建一个来组织链接和想法。"
            data-testid="tags-empty"
          />
        </LayerCard>
      ) : (
        <div className="space-y-2" data-testid="tags-list">
          {vm.rows.map((row, i) => (
            <div key={row.id} className="animate-fade-up" style={staggerStyle(i)}>
              <TagManageRow
                row={row}
                disabled={vm.savingId === row.id}
                onRename={vm.handleRename}
                onRecolor={vm.handleRecolor}
                onDelete={vm.handleDelete}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
