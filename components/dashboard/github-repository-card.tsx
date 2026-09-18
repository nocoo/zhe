"use client";

import { LayerCard } from "@nocoo/basalt";
import { toast } from "@nocoo/basalt/components/toast";
import {
  BookOpen,
  Check,
  CircleAlert,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Scale,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadGitHubReadme, retryGitHubBookmarkAction } from "@/actions/github-connector";
import { canonicalGitHubRepo, type GitHubRepository } from "@/cli/src/connector/github-core";
import { MarkdownPreview } from "@/components/markdown-preview";
import { GithubIcon } from "@/components/site-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { GitHubBookmark } from "@/lib/connector/github-jobs";
import { cn, formatNumber } from "@/lib/utils";
import {
  GITHUB_ERROR_LABELS,
  GITHUB_STATE_LABELS,
  githubReadmeUrl,
} from "@/models/github-bookmarks";
import { linkPresentation } from "@/models/link-presentation";
import { getTagStyles } from "@/models/tags";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import { type EditLinkCallbacks, useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";
import { CardEditDialog } from "./link-card-parts/card-edit-dialog";
import { CardText, CardTitleText } from "./link-card-parts/curated-text";
import { TagBadge } from "./shared-link-components";

function Readme({ link }: { link: Link }) {
  const [repository, setRepository] = useState<GitHubRepository | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [source, setSource] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadGitHubReadme(link.id)
      .then((result) => {
        if (cancelled) return;
        if (
          !result.success ||
          !result.data ||
          result.data.sourceFullName.toLowerCase() !==
            canonicalGitHubRepo(link.originalUrl)?.fullName.toLowerCase()
        )
          setError(true);
        else setRepository(result.data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [link.id, link.originalUrl]);
  if (loading)
    return (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        正在加载 README…
      </p>
    );
  if (error || !repository)
    return (
      <p role="alert" className="py-6 text-sm text-muted-foreground">
        README 暂时无法读取，请关闭后重试。
      </p>
    );
  if (repository.readme === null)
    return <p className="py-6 text-sm text-muted-foreground">这个仓库没有 README。</p>;
  return (
    <div className="min-w-0 space-y-4" data-testid="github-readme">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
        <span className="mr-auto break-all text-xs text-muted-foreground">
          {repository.readmePath} · {repository.defaultBranch}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={source}
          onClick={() => setSource(!source)}
        >
          {source ? "阅读视图" : "Markdown 原文"}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a
            href={`https://github.com/${repository.fullName}#readme`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink />
            GitHub
          </a>
        </Button>
      </div>
      {source ? (
        <pre className="whitespace-pre-wrap break-words rounded-card bg-secondary p-4 text-xs leading-6">
          <code>{repository.readme}</code>
        </pre>
      ) : (
        <MarkdownPreview
          content={repository.readme}
          placeholder="README 文件为空"
          className="break-words prose-pre:overflow-x-auto"
          urlTransform={(url, key) => githubReadmeUrl(url, key === "src", repository)}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            img: ({ src, alt }) =>
              src ? (
                <img src={src} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" />
              ) : null,
          }}
        />
      )}
    </div>
  );
}

function RepositoryInfo({
  repository,
  license,
  state,
  errorText,
}: {
  repository: GitHubBookmark["repository"] | undefined;
  license: string | null;
  state: GitHubBookmark["state"];
  errorText: string | null;
}) {
  const metrics = [
    { icon: Star, label: "Stars", count: repository?.stars, title: "GitHub stars" },
    {
      icon: GitCommitHorizontal,
      label: "Commits",
      count: repository?.commits,
      title: `默认分支 ${repository?.defaultBranch ?? ""} 的 commit 总数`,
    },
    { icon: GitFork, label: "Forks", count: repository?.forks, title: "GitHub forks" },
  ];
  return (
    <>
      <dl
        className="grid h-8 grid-cols-3 items-end gap-2 border-t border-border/60 pt-2"
        aria-label="仓库统计"
        data-testid="github-card-metrics"
      >
        {metrics.map(({ icon: Icon, label, count, title }) => (
          <div
            key={label}
            className="flex h-5 min-w-0 items-center gap-1.5 whitespace-nowrap leading-5"
            title={`${title} · ${count?.toLocaleString() ?? "等待补全"}`}
          >
            <dt className="text-muted-foreground">
              <Icon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="sr-only">{label}</span>
            </dt>
            <dd className="flex min-w-0 items-baseline gap-1 text-xs font-semibold tabular-nums">
              <span aria-hidden>{count === undefined ? "—" : formatNumber(count)}</span>
              <span className="sr-only">{count?.toLocaleString() ?? "未采集"}</span>
              <span
                className="hidden text-[11px] font-normal text-muted-foreground @[22rem]/repository:inline"
                aria-hidden
              >
                {label}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {state !== "complete" ? (
        <RepositoryStatus state={state} errorText={errorText} />
      ) : (
        <div
          className="grid h-5 min-w-0 grid-cols-3 items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-muted-foreground"
          data-testid="github-card-metadata"
        >
          <span
            className="inline-flex min-w-0 items-center gap-1.5"
            title={`主要语言：${repository?.language || "未标注"}`}
          >
            <Code2 className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="truncate">{repository?.language || "未标注"}</span>
          </span>
          <span
            className="inline-flex min-w-0 items-center gap-1.5"
            title={`默认分支：${repository?.defaultBranch ?? "未知"}`}
          >
            <GitBranch className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="truncate">{repository?.defaultBranch ?? "—"}</span>
          </span>
          {license && (
            <span className="inline-flex min-w-0 items-center gap-1.5" title={`许可证：${license}`}>
              <Scale className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="truncate">{license}</span>
            </span>
          )}
        </div>
      )}
    </>
  );
}

function RepositoryStatus({
  state,
  errorText,
}: {
  state: GitHubBookmark["state"];
  errorText: string | null;
}) {
  return (
    <div
      role="status"
      title={errorText || GITHUB_STATE_LABELS[state]}
      data-testid="github-card-metadata"
      className={cn(
        "flex h-5 min-w-0 items-center gap-1.5 text-xs leading-5 text-muted-foreground",
        (state === "failed" || state === "unavailable") && "[&>svg]:text-warning",
      )}
    >
      {state === "running" ? (
        <RefreshCw
          className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          strokeWidth={1.5}
          aria-hidden
        />
      ) : errorText ? (
        <CircleAlert className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
      ) : (
        <Clock3 className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
      )}
      <span className="truncate">{errorText || GITHUB_STATE_LABELS[state]}</span>
    </div>
  );
}

export function GitHubRepositoryCard({
  link,
  bookmark,
  folders,
  tags,
  linkTags,
  siteUrl,
  editCallbacks,
  onDelete,
  onRefresh,
  onSuggest,
}: {
  link: Link;
  bookmark: GitHubBookmark | undefined;
  folders: Folder[];
  tags: Tag[];
  linkTags: LinkTag[];
  siteUrl: string;
  editCallbacks: EditLinkCallbacks;
  onDelete: (id: number) => void;
  onRefresh: () => void;
  onSuggest?: () => void;
}) {
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const card = useRef<HTMLDivElement | null>(null);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const vm = useLinkCardViewModel(
    link,
    siteUrl,
    () => setDeleted(true),
    editCallbacks.onLinkUpdated,
  );
  const repository = bookmark?.repository;
  const name =
    repository?.fullName ?? canonicalGitHubRepo(link.originalUrl)?.fullName ?? link.metaTitle;
  const folder = folders.find((folder) => folder.id === link.folderId)?.name ?? "未分类";
  const assignedTags = tags.filter((tag) => linkTags.some((assigned) => assigned.tagId === tag.id));
  const display = linkPresentation(link, name, repository?.description || link.metaDescription);
  const topics = repository?.topics ?? [];
  const state = bookmark?.state ?? "pending";
  const license =
    repository?.license && !["NOASSERTION", "OTHER"].includes(repository.license)
      ? repository.license
      : null;
  const statusText = GITHUB_STATE_LABELS[state];
  const errorText = bookmark?.errorCode
    ? (GITHUB_ERROR_LABELS[bookmark.errorCode] ?? "稍后重试，已有内容会保留")
    : null;
  const capturedAt = bookmark?.capturedAt ? new Date(bookmark.capturedAt).toLocaleString() : null;
  const retry = async () => {
    setRetrying(true);
    try {
      const result = await retryGitHubBookmarkAction(link.id);
      if (result.success) {
        toast.success("已加入补全队列");
        onRefresh();
      } else toast.error("暂时无法重新采集，请稍后重试");
    } catch {
      toast.error("暂时无法重新采集，请稍后重试");
    } finally {
      setRetrying(false);
    }
  };
  return (
    <>
      <LayerCard
        ref={card}
        padding="none"
        className="group @container/repository min-w-0 overflow-hidden rounded-card shadow-card ring-1 ring-border/40 transition-shadow hover:shadow-card-hover"
        data-testid="github-repository"
        data-link-id={link.id}
      >
        <div className="space-y-2 p-3">
          <div className="flex h-7 items-center gap-2">
            <h2 className="min-w-0 flex-1 text-sm font-semibold leading-5">
              <a
                href={link.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary"
              >
                <CardTitleText title={display.title} original={display.originalTitle} />
              </a>
            </h2>
            {repository?.archived && (
              <Badge variant="secondary" className="shrink-0 text-[11px]">
                已归档
              </Badge>
            )}
            <span
              title="来源：GitHub"
              className="inline-flex shrink-0 items-center rounded-widget bg-foreground p-1.5 text-background"
            >
              <GithubIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
              <span className="sr-only">GitHub</span>
            </span>
          </div>
          <section
            aria-label="收藏与仓库标签（可横向滚动）"
            tabIndex={assignedTags.length || topics.length ? 0 : undefined}
            className="flex h-6 min-w-0 items-center gap-3 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-widget [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-testid="github-card-tags"
          >
            {assignedTags.map((tag) => (
              <span key={tag.id} className="inline-flex shrink-0" title={`收藏标签：${tag.name}`}>
                <TagBadge tag={tag} />
              </span>
            ))}
            {assignedTags.length > 0 && topics.length > 0 && (
              <span className="h-3 w-px shrink-0 bg-border" aria-hidden />
            )}
            {topics.map((topic) => (
              <span
                key={topic}
                className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
                title={`GitHub 仓库标签：${topic}`}
                data-testid="github-repository-label"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={getTagStyles(topic).dot}
                  aria-hidden
                />
                {topic}
              </span>
            ))}
          </section>
          <div
            className="min-w-0 [&>details>summary]:min-h-10"
            data-testid="github-card-description"
          >
            <CardText text={display.description || "仓库信息待补全，可先打开原仓库。"} />
          </div>
          <RepositoryInfo
            repository={repository}
            license={license}
            state={state}
            errorText={errorText}
          />
        </div>
        <LayerCard.Footer
          className="h-11 gap-2 border-border/60 bg-background/40 px-3 py-1"
          data-testid="github-card-footer"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5" title={folder}>
              <FolderOpen className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="truncate">{folder}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="阅读 README"
                      aria-description={statusText}
                      disabled={!repository}
                      onClick={() => setReading(true)}
                      className="relative"
                    >
                      <BookOpen strokeWidth={1.5} aria-hidden />
                      {state !== "complete" && (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute right-1.5 top-1.5 size-1.5 rounded-full bg-muted-foreground",
                            state === "running" &&
                              "bg-primary animate-pulse motion-reduce:animate-none",
                            ["failed", "unavailable"].includes(state) && "bg-warning",
                          )}
                        />
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  阅读 README · {statusText}
                  {capturedAt ? ` · 采集于 ${capturedAt}` : ""}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={editTrigger}
                  variant="ghost"
                  size="icon"
                  aria-label="更多收藏操作"
                  className="data-[state=open]:bg-accent data-[state=open]:text-foreground"
                >
                  <MoreHorizontal strokeWidth={1.5} aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" collisionPadding={8} className="w-44">
                <DropdownMenuItem onSelect={vm.handleCopy}>
                  {vm.copied ? (
                    <Check className="text-success" aria-hidden />
                  ) : (
                    <Copy aria-hidden />
                  )}
                  {vm.copied ? "已复制" : "复制短链接"}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden />
                    打开原仓库
                  </a>
                </DropdownMenuItem>
                {onSuggest && (
                  <DropdownMenuItem onSelect={onSuggest}>
                    <Sparkles aria-hidden />
                    AI 整理
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil aria-hidden />
                  编辑收藏
                </DropdownMenuItem>
                <DropdownMenuItem disabled={retrying || state === "running"} onSelect={retry}>
                  <RefreshCw
                    className={retrying ? "animate-spin motion-reduce:animate-none" : ""}
                    aria-hidden
                  />
                  重新采集 GitHub 仓库
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </LayerCard.Footer>
      </LayerCard>
      {editing && (
        <CardEditDialog
          source={card}
          trigger={editTrigger}
          link={link}
          tags={tags}
          linkTags={linkTags}
          folders={folders}
          editCallbacks={editCallbacks}
          isDeleting={vm.isDeleting}
          handleDelete={vm.handleDelete}
          deleted={deleted}
          onClose={() => setEditing(false)}
          onDeleted={() => onDelete(link.id)}
        />
      )}
      <Dialog open={reading} onOpenChange={setReading}>
        <DialogContent size="xl" className="max-h-[90dvh] overflow-hidden">
          <div className="flex items-start gap-3">
            <DialogHeader className="min-w-0 flex-1">
              <DialogTitle className="break-all">{name}</DialogTitle>
              <DialogDescription>
                README 全文 · 默认分支 {repository?.defaultBranch}
              </DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="关闭 README">
                <X strokeWidth={1.5} />
              </Button>
            </DialogClose>
          </div>
          <div className="min-h-0 overflow-y-auto">
            <div className="mb-5 space-y-3 border-b border-border/60 pb-4 text-sm leading-6">
              <p className="break-words">{repository?.description || link.metaDescription}</p>
              {repository && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {[
                    ["主要语言", repository.language || "未标注"],
                    ["许可证", license || "未标注"],
                    [
                      "最近提交",
                      repository.pushedAt ? new Date(repository.pushedAt).toLocaleString() : "未知",
                    ],
                    ["采集时间", capturedAt || "未知"],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="flex flex-wrap gap-1.5">
                {topics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex max-w-full items-center gap-1.5 break-all text-xs text-muted-foreground"
                    title={`GitHub 仓库标签：${topic}`}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={getTagStyles(topic).dot}
                      aria-hidden
                    />
                    {topic}
                  </span>
                ))}
              </div>
              {link.note && (
                <p className="whitespace-pre-wrap break-words border-l-2 border-border pl-3">
                  {link.note}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-2 text-xs text-muted-foreground">{folder}</span>
                {assignedTags.map((tag) => (
                  <TagBadge key={tag.id} tag={tag} size="sm" />
                ))}
              </div>
            </div>
            {reading && <Readme key={`${link.originalUrl}:${bookmark?.capturedAt}`} link={link} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
