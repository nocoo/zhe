"use client";

import { Check, ChevronRight, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SUGGEST_TITLE_MAX } from "@/models/ai-suggest-link-org";
import { SUGGEST_STEPS } from "@/models/ai-suggest-progress";
import type { SuggestLinkOrgViewModel } from "@/viewmodels/useSuggestLinkOrgViewModel";

function Transcript({ title, text }: { title: string; text: string }) {
  return (
    <details className="min-w-0">
      <summary className="cursor-pointer py-1 text-xs leading-5 text-muted-foreground">
        {title}
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-widget border border-border p-3 font-mono text-xs leading-5">
        {text || "暂无"}
      </pre>
    </details>
  );
}

export function SuggestLinkOrgDialog({ vm }: { vm: SuggestLinkOrgViewModel }) {
  const [elapsed, setElapsed] = useState(0);
  const [tagQuery, setTagQuery] = useState("");
  const [newTag, setNewTag] = useState("");
  useEffect(() => {
    if (!vm.loading) return;
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(timer);
  }, [vm.loading]);
  useEffect(() => {
    if (vm.open) {
      setTagQuery("");
      setNewTag("");
    }
  }, [vm.open]);
  if (!vm.open) return null;
  const busy = vm.loading || vm.applying || vm.creatingTag;
  const current = SUGGEST_STEPS.findIndex((s) => s.id === (vm.failedStep ?? vm.stage));
  const titleTooLong = Array.from(vm.draftTitle.trim()).length > SUGGEST_TITLE_MAX;
  const visibleTags = vm.tags.filter((tag) => tag.checked || tag.source === "ai");
  const createTag = async () => {
    if (await vm.addTag(newTag)) setNewTag("");
  };
  return (
    <Dialog open={vm.open} onOpenChange={(open) => !open && vm.close()}>
      <DialogContent
        size="xl"
        className="max-h-[90dvh] overflow-hidden sm:w-[40rem]"
        data-testid="suggest-link-org-dialog"
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <DialogHeader className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
              AI 整理
            </DialogTitle>
            <DialogDescription data-testid="suggest-step-caption" aria-live="polite">
              {vm.loading
                ? `正在整理 · 已等待 ${(elapsed / 1000).toFixed(1)} 秒`
                : vm.ready
                  ? "建议已生成，可直接修改"
                  : vm.error
                    ? "整理未完成"
                    : "整理标题、备注和分类"}
            </DialogDescription>
          </DialogHeader>
          <Button
            size="icon"
            variant="ghost"
            className="-mr-2 -mt-2"
            aria-label="关闭 AI 整理"
            disabled={vm.applying || vm.creatingTag}
            onClick={vm.close}
          >
            <X strokeWidth={1.5} />
          </Button>
        </div>
        <ol
          className="flex shrink-0 items-center gap-2 border-b border-border pb-4"
          aria-label="整理进度"
          data-testid="suggest-steps"
        >
          {SUGGEST_STEPS.map((step, index) => {
            const failed = Boolean(vm.failedStep && index === current);
            const done = index < current || (vm.ready && index === current);
            return (
              <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  data-testid={`suggest-step-${step.id}`}
                  data-state={
                    failed ? "error" : done ? "done" : index === current ? "current" : "pending"
                  }
                  aria-current={index === current ? "step" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap text-xs leading-5",
                    failed
                      ? "text-destructive"
                      : index === current
                        ? "font-medium text-primary"
                        : "text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-3.5 shrink-0" aria-hidden />
                  ) : vm.loading && index === current ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                  ) : null}
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{["资料", "生成", "校验", "待应用"][index]}</span>
                </span>
                {index < SUGGEST_STEPS.length - 1 && (
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" aria-hidden />
                )}
              </li>
            );
          })}
        </ol>
        <div className="min-h-0 space-y-4 overflow-y-auto -m-1 p-1">
          {vm.notices.map((notice) => (
            <p key={notice} className="text-xs leading-5 text-muted-foreground">
              {notice}
            </p>
          ))}
          {vm.error && (
            <div
              role="alert"
              className="space-y-2 text-sm leading-5 text-destructive"
              data-testid="suggest-error"
            >
              <p>{vm.error}</p>
              {vm.error.includes("配置") && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dashboard/settings/ai">AI 设置</Link>
                </Button>
              )}
            </div>
          )}
          <fieldset disabled={busy || !vm.ready} className="min-w-0 space-y-4 disabled:opacity-60">
            <div className="space-y-1.5">
              <Label htmlFor="suggest-title" className="block text-xs font-medium leading-4">
                标题
              </Label>
              <Input
                id="suggest-title"
                value={vm.draftTitle}
                onChange={(event) => vm.setDraftTitle(event.target.value)}
                placeholder="标题"
                data-testid="suggest-title"
                aria-invalid={titleTooLong}
                aria-describedby={titleTooLong ? "suggest-title-error" : undefined}
              />
              {titleTooLong && (
                <p id="suggest-title-error" className="text-xs text-destructive">
                  标题过长，请精简
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suggest-note" className="block text-xs font-medium leading-4">
                备注
              </Label>
              <Textarea
                id="suggest-note"
                rows={3}
                className="max-h-48 resize-y"
                value={vm.draftNote}
                onChange={(event) => vm.setDraftNote(event.target.value)}
                placeholder="备注"
                data-testid="suggest-note"
              />
            </div>
            <div className="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="suggest-folder" className="block text-xs font-medium leading-4">
                  文件夹
                </Label>
                <Select
                  value={vm.selectedFolderId ?? "__inbox__"}
                  onValueChange={(value) =>
                    vm.setSelectedFolderId(value === "__inbox__" ? null : value)
                  }
                >
                  <SelectTrigger id="suggest-folder" className="w-full">
                    <SelectValue placeholder="选择文件夹" />
                  </SelectTrigger>
                  <SelectContent>
                    {vm.folders.map((folder) => (
                      <SelectItem
                        key={folder.folderId ?? "inbox"}
                        value={folder.folderId ?? "__inbox__"}
                      >
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vm.folders
                  .filter((f) => f.source === "ai" && f.folderId !== vm.selectedFolderId)
                  .map((folder) => (
                    <Button
                      key={folder.folderId ?? "inbox"}
                      variant="ghost"
                      size="sm"
                      className="mr-1"
                      onClick={() => vm.setSelectedFolderId(folder.folderId)}
                    >
                      {folder.name}
                    </Button>
                  ))}
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium leading-4">标签</p>
                <div className="flex min-h-9 flex-wrap items-center gap-2">
                  {visibleTags.map((tag) => (
                    <Button
                      key={tag.tagId}
                      variant="outline"
                      aria-pressed={tag.checked}
                      onClick={() => vm.toggleTag(vm.tags.indexOf(tag))}
                      className={cn("max-w-full", tag.checked && "border-primary/40 text-primary")}
                    >
                      <span className="truncate">{tag.name}</span>
                      {tag.checked && <Check aria-hidden strokeWidth={1.5} />}
                    </Button>
                  ))}
                  {!visibleTags.length && (
                    <span className="text-xs text-muted-foreground">未选择标签</span>
                  )}
                </div>
              </div>
            </div>
            <details className="min-w-0">
              <summary className="cursor-pointer text-xs leading-5 text-muted-foreground">
                管理标签
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Input
                    aria-label="搜索已有标签"
                    placeholder="搜索已有标签"
                    value={tagQuery}
                    onChange={(event) => setTagQuery(event.target.value)}
                  />
                  <div className="flex max-h-36 flex-wrap gap-2 overflow-auto">
                    {vm.tags
                      .filter((tag) =>
                        tag.name.toLowerCase().includes(tagQuery.trim().toLowerCase()),
                      )
                      .map((tag) => (
                        <Button
                          key={tag.tagId}
                          size="sm"
                          variant="outline"
                          aria-pressed={tag.checked}
                          onClick={() => vm.toggleTag(vm.tags.indexOf(tag))}
                          className={cn(tag.checked && "border-primary/40 text-primary")}
                        >
                          {tag.name}
                          {tag.checked && <Check aria-hidden />}
                        </Button>
                      ))}
                    {!vm.tags.length && <p className="text-xs text-muted-foreground">暂无标签</p>}
                  </div>
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="新标签名称"
                      placeholder="新标签名称"
                      value={newTag}
                      onChange={(event) => setNewTag(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void createTag();
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      disabled={!newTag.trim() || busy}
                      onClick={() => void createTag()}
                      className="shrink-0"
                    >
                      创建标签
                    </Button>
                  </div>
                  {vm.tagError && (
                    <p role="alert" className="text-xs text-destructive">
                      {vm.tagError}
                    </p>
                  )}
                </div>
              </div>
            </details>
          </fieldset>
          <details className="min-w-0 border-t border-border pt-3">
            <summary className="cursor-pointer text-xs leading-5 text-muted-foreground">
              运行详情
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs leading-5 text-muted-foreground">
                {[
                  vm.provider,
                  vm.model,
                  vm.durationMs === null ? "" : `${(vm.durationMs / 1000).toFixed(1)} 秒`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">{vm.supplied.join(" · ")}</p>
              <Transcript
                title="推荐理由"
                text={[...vm.folders, ...vm.tags]
                  .filter((item) => item.reason)
                  .map((item) => `${item.name}：${item.reason}`)
                  .join("\n")}
              />
              <Transcript title="输入资料" text={vm.prompt} />
              <Transcript title="模型回复" text={vm.rawText} />
              <Transcript title="过程记录" text={vm.log.join("\n")} />
              {vm.history != null && (
                <Transcript title="历史分析" text={JSON.stringify(vm.history, null, 2)} />
              )}
            </div>
          </details>
        </div>
        <DialogFooter className="mt-0 grid shrink-0 grid-cols-3 gap-2 border-t border-border pt-4 sm:flex sm:items-center [&>button]:whitespace-nowrap [&>button]:px-3">
          <Button
            variant="ghost"
            size="lg"
            onClick={vm.close}
            disabled={vm.applying || vm.creatingTag}
          >
            取消
          </Button>
          <Button variant="outline" size="lg" onClick={vm.regenerate} disabled={busy}>
            {vm.ready ? "重新生成" : "重试"}
          </Button>
          <Button
            size="lg"
            onClick={() => void vm.apply()}
            disabled={busy || !vm.ready || titleTooLong}
            data-testid="suggest-apply"
          >
            {vm.applying ? <Loader2 className="animate-spin" /> : null}
            {vm.applying ? "保存中" : "应用"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
