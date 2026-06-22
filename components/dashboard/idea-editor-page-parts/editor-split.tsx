"use client";

import { X } from "lucide-react";
import { MarkdownPreview } from "@/components/markdown-preview";

export function EditorSplit({
  content,
  setContent,
}: {
  content: string;
  setContent: (v: string) => void;
}) {
  return (
    <div
      className="-mx-3 md:-mx-5 -mb-3 md:-mb-5 grid grid-cols-1 md:grid-cols-2 border-t"
      style={{ height: "calc(100vh - 12rem)" }}
    >
      <div className="flex flex-col min-h-0">
        <div className="px-4 py-2 border-b bg-muted/30">
          <span className="text-xs text-muted-foreground font-medium">编辑</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="在这里写下您的想法... (支持 Markdown)"
            className="w-full h-full resize-none border-0 bg-transparent px-4 py-3 text-sm font-mono leading-relaxed focus:outline-hidden placeholder:text-muted-foreground/50"
            spellCheck
          />
        </div>
      </div>

      <div className="flex flex-col min-h-0 border-t md:border-t-0 md:border-l">
        <div className="px-4 py-2 border-b bg-muted/30">
          <span className="text-xs text-muted-foreground font-medium">预览</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
          <MarkdownPreview content={content} />
        </div>
      </div>
    </div>
  );
}

export function ErrorToast({
  error,
  onClear,
}: {
  error: string;
  onClear: () => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground px-4 py-2 rounded-md shadow-lg flex items-center gap-2 z-50">
      <span className="text-sm">{error}</span>
      <button onClick={onClear}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
