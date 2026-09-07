"use client";

import { X } from "lucide-react";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Card } from "@/components/ui/card";

export function EditorSplit({
  content,
  setContent,
}: {
  content: string;
  setContent: (v: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
      <Card
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        role="region"
        aria-label="编辑"
      >
        <div className="px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">编辑</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="在这里写下您的想法... (支持 Markdown)"
            className="h-full min-h-[20rem] w-full resize-none border-0 bg-transparent px-4 py-3 font-mono text-sm leading-relaxed focus:outline-hidden placeholder:text-muted-foreground/50"
            spellCheck
          />
        </div>
      </Card>

      <Card
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        role="region"
        aria-label="预览"
      >
        <div className="px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">预览</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          <MarkdownPreview content={content} />
        </div>
      </Card>
    </div>
  );
}

export function ErrorToast({ error, onClear }: { error: string; onClear: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground px-4 py-2 rounded-md shadow-lg flex items-center gap-2 z-50">
      <span className="text-sm">{error}</span>
      <button type="button" onClick={onClear}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
