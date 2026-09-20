"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardService } from "@/contexts/dashboard-service";
import type { EnrichmentScope } from "@/contexts/enrichment";
import {
  canRetryEnrichment,
  ENRICHMENT_SOURCES,
  ENRICHMENT_STATES,
  type EnrichmentTask,
  enrichmentContent,
  enrichmentError,
} from "@/models/connector-activity";
import { useEnrichmentViewModel } from "@/viewmodels/useEnrichmentViewModel";
import { EnrichmentDetails } from "./enrichment-details";

export function EnrichmentTaskStatus({ task }: { task: EnrichmentTask }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="secondary">{ENRICHMENT_STATES[task.state]}</Badge>
      <span className="text-muted-foreground">
        尝试 {task.attempts} 次 · 重试 {Math.max(0, task.attempts - 1)} 次
        {task.recordedFailures > 0 && ` · 已记录失败 ${task.recordedFailures} 次`}
      </span>
      {["failed", "partial"].includes(task.state) && (
        <span className="text-warning">
          {task.attempts >= 5
            ? "已达自动重试上限"
            : `下次尝试：${new Date(task.nextAttemptAt).toLocaleString("zh-CN")}`}
        </span>
      )}
    </div>
  );
}

export function EnrichmentDialog({
  scope,
  onClose,
}: {
  scope: EnrichmentScope;
  onClose: () => void;
}) {
  const vm = useEnrichmentViewModel(scope);
  const { links } = useDashboardService();
  const task = vm.tasks.find((item) => item.linkId === vm.detailId);
  const link = links.find((item) => item.id === vm.detailId);
  const allSelected = vm.selectedIds.length > 0 && vm.selectedIds.length === vm.retryable.length;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        size="xl"
        className="max-h-[90dvh] gap-0 overflow-hidden p-0"
        data-testid="enrichment-dialog"
      >
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3"
              aria-label="关闭补全记录"
            >
              <X />
            </Button>
          </DialogClose>
          <DialogTitle>补全记录</DialogTitle>
          <DialogDescription>
            X 正文与附件、GitHub 仓库、网站截图的排队情况和采集结果
          </DialogDescription>
        </DialogHeader>
        {vm.detailId !== null ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              <Button variant="ghost" size="sm" onClick={() => vm.setDetailId(null)}>
                <ArrowLeft />
                全部记录
              </Button>
              <span className="mr-auto text-xs text-muted-foreground">
                #{vm.detailId}
                {task ? ` · ${ENRICHMENT_SOURCES[task.source]}` : ""}
              </span>
              {task && canRetryEnrichment(task) && (
                <Button
                  size="sm"
                  disabled={vm.retrying}
                  onClick={() => void vm.retry([task.linkId])}
                >
                  <RefreshCw className={vm.retrying ? "animate-spin" : ""} />
                  重新补全
                </Button>
              )}
              {(task || link) && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={task?.url ?? link?.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink />
                    打开原链接
                  </a>
                </Button>
              )}
            </div>
            <div className="min-h-0 overflow-y-auto px-5 py-4">
              <h3 className="mb-3 break-words text-base font-medium">
                {task?.title ?? link?.title ?? link?.metaTitle ?? link?.originalUrl}
              </h3>
              {task && (
                <>
                  <EnrichmentTaskStatus task={task} />
                  <p className="mt-2 text-sm text-muted-foreground">{enrichmentContent(task)}</p>
                  {task.errorCode && (
                    <p className="mt-2 break-words text-sm text-warning">
                      {enrichmentError(task.errorCode)}{" "}
                      <span className="text-xs">({task.errorCode})</span>
                    </p>
                  )}
                </>
              )}
              {vm.loading ? (
                <p className="py-6 text-sm" role="status">
                  正在读取补全记录…
                </p>
              ) : (
                <EnrichmentDetails key={vm.detailId} linkId={vm.detailId} task={task} link={link} />
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3 border-b border-border px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={vm.search}
                  onChange={(event) => vm.setSearch(event.target.value)}
                  placeholder="搜索标题、网址或编号"
                  aria-label="搜索补全记录"
                  className="min-w-40 flex-1"
                />
                <Select value={vm.source} onValueChange={vm.setSource}>
                  <SelectTrigger size="sm" className="w-32" aria-label="补全类型">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    {Object.entries(ENRICHMENT_SOURCES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={vm.state} onValueChange={vm.setState}>
                  <SelectTrigger size="sm" className="w-32" aria-label="补全状态">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="retry">可重试</SelectItem>
                    {Object.entries(ENRICHMENT_STATES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="刷新补全记录"
                  onClick={() => void vm.refresh()}
                >
                  <RefreshCw />
                </Button>
              </div>
              <div
                className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                role="status"
              >
                {Object.entries(ENRICHMENT_STATES).map(([state, label]) => (
                  <span key={state}>
                    {label} {vm.tasks.filter((task) => task.state === state).length}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  aria-label="选择本页可重试任务"
                  checked={allSelected ? true : vm.selectedIds.length ? "indeterminate" : false}
                  disabled={!vm.retryable.length || vm.retrying}
                  onCheckedChange={vm.toggleAll}
                />
                <span className="mr-auto text-xs text-muted-foreground">
                  已选 {vm.selectedIds.length} 条
                </span>
                <Button
                  size="sm"
                  disabled={!vm.selectedIds.length || vm.retrying}
                  onClick={() => void vm.retry(vm.selectedIds)}
                >
                  {vm.retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}重新补全所选
                  {vm.selectedIds.length ? ` (${vm.selectedIds.length})` : ""}
                </Button>
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto" data-testid="enrichment-tasks">
              {vm.loading ? (
                <p className="p-5 text-sm" role="status">
                  正在读取补全记录…
                </p>
              ) : !vm.visible.length ? (
                <p className="p-5 text-sm text-muted-foreground">没有符合条件的补全记录</p>
              ) : (
                vm.visible.map((item) => (
                  <div
                    key={item.linkId}
                    className="flex items-start gap-3 border-b border-border/60 px-5 py-3"
                    data-testid={`enrichment-task-${item.linkId}`}
                  >
                    <Checkbox
                      className="mt-1"
                      aria-label={`选择 ${item.title}`}
                      checked={vm.selectedIds.includes(item.linkId)}
                      disabled={!canRetryEnrichment(item) || vm.retrying}
                      onCheckedChange={() => vm.toggle(item.linkId)}
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <span
                          className="min-w-0 flex-1 truncate text-sm font-medium"
                          title={item.title}
                        >
                          {item.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {ENRICHMENT_SOURCES[item.source]}
                        </span>
                      </div>
                      <EnrichmentTaskStatus task={item} />
                      <p className="text-xs text-muted-foreground">{enrichmentContent(item)}</p>
                      {item.errorCode && (
                        <p className="break-words text-xs text-warning">
                          {enrichmentError(item.errorCode)}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          #{item.linkId} · {new Date(item.updatedAt).toLocaleString("zh-CN")}
                        </span>
                        {item.connectorName && <span>Connector：{item.connectorName}</span>}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => vm.setDetailId(item.linkId)}>
                      详情
                    </Button>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
              <span className="mr-auto">共 {vm.filtered.length} 条 · 每 10 秒更新</span>
              <span>
                {vm.currentPage + 1} / {vm.pages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="上一页记录"
                disabled={vm.currentPage === 0}
                onClick={() => vm.setPage(vm.currentPage - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="下一页记录"
                disabled={vm.currentPage + 1 >= vm.pages}
                onClick={() => vm.setPage(vm.currentPage + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </>
        )}
        {vm.error && (
          <p role="alert" className="px-5 py-3 text-sm text-warning">
            补全记录暂时无法读取，请刷新重试。
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
