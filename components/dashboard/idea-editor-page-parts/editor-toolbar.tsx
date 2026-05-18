"use client";

import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTagStyles } from "@/models/tags";
import type { Tag } from "@/models/types";

function TagBadges({
  tags,
  selectedTagIds,
  onToggle,
}: {
  tags: Tag[];
  selectedTagIds: string[];
  onToggle: (id: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
      {tags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id);
        const styles = getTagStyles(tag.name);
        return (
          <Badge
            key={tag.id}
            variant={isSelected ? "default" : "outline"}
            className="cursor-pointer text-xs"
            style={isSelected ? styles.badge : undefined}
            onClick={() => onToggle(tag.id)}
          >
            {tag.name}
          </Badge>
        );
      })}
    </div>
  );
}

interface EditorToolbarProps {
  title: string | null;
  setTitle: (v: string | null) => void;
  tags: Tag[];
  selectedTagIds: string[];
  toggleTag: (id: string) => void;
  dirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onBack: () => void;
}

export function EditorToolbar({
  title,
  setTitle,
  tags,
  selectedTagIds,
  toggleTag,
  dirty,
  isSaving,
  onSave,
  onBack,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Button
          variant="outline"
          size="sm"
          className="rounded-widget h-7 w-7 p-0 shrink-0"
          onClick={onBack}
          aria-label="返回想法列表"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          placeholder="标题 (可选)"
          value={title ?? ""}
          onChange={(e) => setTitle(e.target.value || null)}
          className="flex-1 max-w-md h-8 text-sm rounded-lg"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
        <TagBadges
          tags={tags}
          selectedTagIds={selectedTagIds}
          onToggle={toggleTag}
        />
        {dirty && <span className="text-xs text-muted-foreground">未保存</span>}
        <Button
          size="sm"
          className="rounded-widget h-7 w-7 p-0"
          onClick={onSave}
          disabled={!dirty || isSaving}
          aria-label="保存"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" strokeWidth={1.5} />
          )}
        </Button>
      </div>
    </div>
  );
}
