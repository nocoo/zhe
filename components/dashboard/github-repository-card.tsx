"use client";

import { LayerCard } from "@nocoo/basalt";
import { toast } from "@nocoo/basalt/components/toast";
import {
  BookOpen,
  ExternalLink,
  FolderOpen,
  GitCommitHorizontal,
  GitFork,
  Pencil,
  RefreshCw,
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
import type { GitHubBookmark } from "@/lib/connector/github-jobs";
import {
  GITHUB_ERROR_LABELS,
  GITHUB_STATE_LABELS,
  githubReadmeUrl,
} from "@/models/github-bookmarks";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import { type EditLinkCallbacks, useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";
import { GitHubAnalysisButton } from "./github-analysis-button";
import { CardEditDialog } from "./link-card-parts/card-edit-dialog";
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
  const folder = folders.find((folder) => folder.id === link.folderId)?.name ?? "Inbox";
  const assignedTags = tags.filter((tag) => linkTags.some((assigned) => assigned.tagId === tag.id));
  const description =
    bookmark?.analysis?.summary ||
    repository?.description ||
    link.metaDescription ||
    "保存仓库后，Connector 会补全仓库信息和 README。";
  const topics = bookmark?.analysis?.tags.length
    ? bookmark.analysis.tags
    : (repository?.topics ?? []);
  const state = bookmark?.state ?? "pending";
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
        className="flex h-full min-w-0 flex-col overflow-hidden rounded-card shadow-card ring-1 ring-border/40"
        data-testid="github-repository"
        data-link-id={link.id}
      >
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex h-10 shrink-0 items-start gap-2">
            <GithubIcon
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <h2
                className="line-clamp-2 break-all text-sm font-semibold leading-5"
                title={name ?? undefined}
              >
                <a
                  href={link.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  {name}
                </a>
              </h2>
            </div>
            <Button
              ref={editTrigger}
              variant="ghost"
              size="icon"
              aria-label="编辑 GitHub 收藏"
              onClick={() => setEditing(true)}
            >
              <Pencil strokeWidth={1.5} />
            </Button>
          </div>
          <p
            className="line-clamp-3 h-15 shrink-0 text-sm leading-5 text-muted-foreground"
            title={description}
          >
            {bookmark?.analysis && (
              <Sparkles className="mr-1 inline size-3.5 text-primary" aria-label="AI 摘要" />
            )}
            {description}
          </p>
          <div className="grid h-5 shrink-0 grid-cols-3 gap-2 text-xs tabular-nums">
            {repository ? (
              <>
                <span className="inline-flex items-center gap-1.5" title="GitHub stars">
                  <Star className="size-3.5 text-amber-500" strokeWidth={1.5} aria-hidden />
                  {repository.stars.toLocaleString()}
                  <span className="sr-only">stars</span>
                </span>
                <span
                  className="inline-flex items-center gap-1.5"
                  title={`默认分支 ${repository.defaultBranch} 的 commit 总数`}
                >
                  <GitCommitHorizontal
                    className="size-3.5 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  {repository.commits.toLocaleString()}
                  <span className="sr-only">commits</span>
                </span>
                <span className="inline-flex items-center gap-1.5" title="GitHub forks">
                  <GitFork
                    className="size-3.5 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  {repository.forks.toLocaleString()}
                  <span className="sr-only">forks</span>
                </span>
              </>
            ) : (
              <span className="col-span-3 text-muted-foreground">仓库统计待补全</span>
            )}
          </div>
          <div className="flex h-5 shrink-0 items-center gap-2 overflow-hidden text-xs text-muted-foreground">
            {repository?.language && (
              <span className="truncate" title={repository.language}>
                {repository.language}
              </span>
            )}
            {repository?.license && (
              <span className="truncate" title={repository.license}>
                {repository.license}
              </span>
            )}
            {repository && (
              <span
                className="min-w-0 flex-1 truncate"
                title={`默认分支 ${repository.defaultBranch}${repository.pushedAt ? ` · 最近提交 ${new Date(repository.pushedAt).toLocaleDateString()}` : ""}`}
              >
                分支 {repository.defaultBranch}
              </span>
            )}
            {repository?.archived && (
              <Badge variant="secondary" className="shrink-0">
                已归档
              </Badge>
            )}
          </div>
          <div
            className="flex h-8 shrink-0 items-center gap-1 overflow-hidden"
            data-testid="github-card-topics"
          >
            {topics.slice(0, 3).map((topic) => (
              <Badge key={topic} variant="outline" className="min-w-0 max-w-28" title={topic}>
                <span className="truncate">{topic}</span>
              </Badge>
            ))}
            {topics.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 px-2"
                aria-label="查看全部仓库标签"
                onClick={() => setReading(true)}
              >
                +{topics.length - 3}
              </Button>
            )}
          </div>
          <p
            className="line-clamp-2 h-10 shrink-0 border-l-2 border-border pl-3 text-xs leading-5 text-muted-foreground"
            title={link.note || undefined}
          >
            {link.note ||
              (bookmark?.analysis?.features.length
                ? bookmark.analysis.features.slice(0, 2).join(" · ")
                : "暂无备注")}
          </p>
          <div className="mt-auto flex h-8 shrink-0 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
            <span className="mr-auto inline-flex min-w-0 items-center gap-1.5" title={folder}>
              <FolderOpen className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="truncate">{folder}</span>
            </span>
            {assignedTags.slice(0, 2).map((tag) => (
              <span key={tag.id} className="min-w-0 max-w-20">
                <TagBadge tag={tag} size="sm" />
              </span>
            ))}
            {assignedTags.length > 2 && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 px-2"
                aria-label="查看全部收藏标签"
                onClick={() => setReading(true)}
              >
                +{assignedTags.length - 2}
              </Button>
            )}
          </div>
        </div>
        <LayerCard.Footer className="mt-auto flex-col items-stretch gap-2 bg-background/30 px-4 py-3">
          <div
            className="h-8 overflow-hidden text-xs leading-4 text-muted-foreground"
            role="status"
          >
            <p
              className="truncate"
              title={
                bookmark?.capturedAt ? new Date(bookmark.capturedAt).toLocaleString() : undefined
              }
            >
              {state !== "complete"
                ? GITHUB_STATE_LABELS[state]
                : bookmark?.capturedAt
                  ? `采集于 ${new Date(bookmark.capturedAt).toLocaleDateString()}`
                  : "已补全"}
            </p>
            {bookmark?.errorCode && (
              <p
                className="truncate"
                title={GITHUB_ERROR_LABELS[bookmark.errorCode] ?? "稍后重试，已有内容会保留"}
              >
                {GITHUB_ERROR_LABELS[bookmark.errorCode] ?? "稍后重试，已有内容会保留"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <GitHubAnalysisButton
              key={`${link.originalUrl}:${bookmark?.capturedAt}`}
              linkId={link.id}
              name={name || "GitHub 仓库"}
              analysis={bookmark?.analysis ?? null}
              hasReadme={Boolean(bookmark?.hasReadme)}
              onSaved={onRefresh}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!repository}
              onClick={() => setReading(true)}
              className="ml-auto"
            >
              <BookOpen strokeWidth={1.5} />
              阅读 README
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="重新采集 GitHub 仓库"
              disabled={retrying || state === "running"}
              onClick={retry}
            >
              <RefreshCw className={retrying ? "animate-spin" : ""} strokeWidth={1.5} />
            </Button>
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
              <div className="flex flex-wrap gap-1.5">
                {[...new Set([...topics, ...(repository?.topics ?? [])])].map((topic) => (
                  <Badge
                    key={topic}
                    variant="outline"
                    className="max-w-full whitespace-normal break-words"
                  >
                    {topic}
                  </Badge>
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
