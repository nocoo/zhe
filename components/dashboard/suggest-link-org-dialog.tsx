"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SUGGEST_NOTE_MAX } from "@/models/ai-suggest-link-org";
import {
  SUGGEST_STEPS,
  type SuggestStepId,
  suggestStepProgress,
  suggestStepState,
} from "@/models/ai-suggest-progress";
import type {
  SuggestFolderDraft,
  SuggestLinkOrgViewModel,
  SuggestOptionSource,
  SuggestTagDraft,
} from "@/viewmodels/useSuggestLinkOrgViewModel";

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)} 秒`;
}

function formatTranscript(text: string): string {
  const trimmed = text.trim();
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

function useElapsed(active: boolean): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) {
      setMs(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => setMs(Date.now() - started), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return ms;
}

function stepCaption(vm: SuggestLinkOrgViewModel, elapsedMs: number): string {
  if (vm.loading) {
    return `正在调用模型 · 已等待 ${formatDuration(elapsedMs)}`;
  }
  if (vm.error) {
    const failed = SUGGEST_STEPS.find((step) => step.id === vm.failedStep);
    return failed ? `${failed.label}失败` : "获取建议失败";
  }
  const parts = [vm.provider, vm.model];
  if (vm.durationMs !== null) parts.push(formatDuration(vm.durationMs));
  return parts.filter(Boolean).join(" · ") || "可以核对并应用建议";
}

function TranscriptPanel({
  title,
  text,
  empty,
  testId,
}: {
  title: string;
  text: string;
  empty: string;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const display = text ? formatTranscript(text) : "";
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 rounded-widget px-1 py-1 text-left text-sm hover:bg-secondary"
        data-testid={`${testId}-toggle`}
      >
        <ChevronRight
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-90")}
        />
        <span className="font-medium">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {text ? `${text.length} 字` : "暂无"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {display ? (
          <pre
            data-testid={`${testId}-body`}
            className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-card bg-secondary p-3 font-mono text-xs leading-6 text-foreground"
          >
            {display}
          </pre>
        ) : (
          <p className="mt-2 px-1 text-xs text-muted-foreground">{empty}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function StepList({
  loading,
  error,
  failedStep,
}: {
  loading: boolean;
  error: string;
  failedStep: SuggestStepId | null;
}) {
  const progress = suggestStepProgress(loading, error, failedStep);
  return (
    <div className="space-y-2" data-testid="suggest-steps">
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          data-testid="suggest-step-progress"
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ol className="flex items-center">
        {SUGGEST_STEPS.map((step, index) => {
          const state = suggestStepState(step.id, loading, error, failedStep);
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center">
              <div
                data-testid={`suggest-step-${step.id}`}
                data-state={state}
                className={cn(
                  "min-w-0 flex-1 rounded-widget px-2 py-1.5 text-center text-xs font-medium",
                  state === "current" && "bg-secondary shadow-xs",
                  state === "done" && "bg-primary/10 text-foreground",
                  state === "error" && "bg-destructive/10 text-destructive",
                  state === "pending" && "text-muted-foreground",
                )}
              >
                {step.label}
              </div>
              {index < SUGGEST_STEPS.length - 1 && (
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "mx-0.5 h-4 w-4 shrink-0",
                    state === "done" || state === "current"
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FolderGroup({
  title,
  folders,
  selectedFolderId,
  onSelect,
}: {
  title: string;
  folders: SuggestFolderDraft[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}) {
  if (folders.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs text-muted-foreground">{title}</h4>
      {folders.map((folder) => {
        const value = folder.folderId ?? "inbox";
        return (
          <label key={value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="suggest-folder"
              className="mt-1"
              checked={(selectedFolderId ?? "inbox") === value}
              onChange={() => onSelect(folder.folderId)}
            />
            <span>
              <span className="font-medium">{folder.name}</span>
              {folder.reason ? (
                <span className="block text-xs text-muted-foreground">{folder.reason}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function TagGroup({
  title,
  tags,
  source,
  onToggle,
  onRename,
}: {
  title: string;
  tags: SuggestTagDraft[];
  source: SuggestOptionSource;
  onToggle: (index: number) => void;
  onRename: (index: number, name: string) => void;
}) {
  const items = tags
    .map((tag, index) => ({ tag, index }))
    .filter((item) => item.tag.source === source);
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs text-muted-foreground">{title}</h4>
      {items.map(({ tag, index }) => (
        <div key={`${tag.tagId ?? "new"}-${tag.name}-${index}`} className="flex items-start gap-2">
          <Checkbox
            size="sm"
            checked={tag.checked}
            onCheckedChange={() => onToggle(index)}
            aria-label={`选择标签 ${tag.draftName}`}
          />
          <div className="min-w-0 flex-1">
            {tag.tagId ? (
              <p className="text-sm font-medium">{tag.name}</p>
            ) : (
              <Input
                size="sm"
                value={tag.draftName}
                onChange={(event) => onRename(index, event.target.value)}
                aria-label="新标签名"
              />
            )}
            {tag.reason ? <p className="text-xs text-muted-foreground">{tag.reason}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SuggestLinkOrgDialog({ vm }: { vm: SuggestLinkOrgViewModel }) {
  const elapsedMs = useElapsed(vm.open && vm.loading);
  const caption = stepCaption(vm, elapsedMs);

  return (
    <Dialog open={vm.open} onOpenChange={(next) => !next && vm.close()}>
      <DialogContent
        data-testid="suggest-link-org-dialog"
        className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>整理建议</DialogTitle>
          <DialogDescription data-testid="suggest-step-caption">{caption}</DialogDescription>
        </DialogHeader>

        <StepList loading={vm.loading} error={vm.error} failedStep={vm.failedStep} />

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <TranscriptPanel
            key={`prompt-${String(vm.open)}`}
            title="发送的提示"
            text={vm.prompt}
            empty="请求完成后显示发出去的提示"
            testId="suggest-prompt"
          />
          <TranscriptPanel
            key={`raw-${String(vm.open)}`}
            title="模型回复"
            text={vm.rawText}
            empty="等待模型返回"
            testId="suggest-raw"
          />

          {vm.loading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在调用模型，通常需要十几秒
            </div>
          ) : vm.error ? (
            <p className="text-sm text-destructive" data-testid="suggest-error">
              {vm.error}
            </p>
          ) : (
            <div className="space-y-5">
              <section className="space-y-3">
                <h3 className="text-sm font-medium">文件夹</h3>
                <FolderGroup
                  title="推荐"
                  folders={vm.folders.filter((folder) => folder.source === "ai")}
                  selectedFolderId={vm.selectedFolderId}
                  onSelect={vm.setSelectedFolderId}
                />
                <FolderGroup
                  title="其他"
                  folders={vm.folders.filter((folder) => folder.source === "catalog")}
                  selectedFolderId={vm.selectedFolderId}
                  onSelect={vm.setSelectedFolderId}
                />
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-medium">标签</h3>
                <TagGroup
                  title="推荐"
                  tags={vm.tags}
                  source="ai"
                  onToggle={vm.toggleTag}
                  onRename={vm.renameTag}
                />
                <TagGroup
                  title="其他"
                  tags={vm.tags}
                  source="catalog"
                  onToggle={vm.toggleTag}
                  onRename={vm.renameTag}
                />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">备注</h3>
                <Input
                  size="sm"
                  value={vm.draftNote}
                  maxLength={SUGGEST_NOTE_MAX}
                  onChange={(event) => vm.setDraftNote(event.target.value)}
                  aria-label="备注总结"
                  data-testid="suggest-note"
                />
              </section>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={vm.close}>
            取消
          </Button>
          <Button
            onClick={() => void vm.apply()}
            disabled={vm.loading || vm.applying || Boolean(vm.error)}
            data-testid="suggest-apply"
          >
            {vm.applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            应用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
