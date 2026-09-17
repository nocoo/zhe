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
import { linkPresentation } from "@/models/link-presentation";
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
  const folder = folders.find((folder) => folder.id === link.folderId)?.name ?? "Inbox";
  const assignedTags = tags.filter((tag) => linkTags.some((assigned) => assigned.tagId === tag.id));
  const display = linkPresentation(link, name, repository?.description || link.metaDescription);
  const topics = repository?.topics ?? [];
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
        className="group flex h-full min-w-0 flex-col overflow-hidden rounded-card shadow-card ring-1 ring-border/40 transition-shadow hover:shadow-card-hover"
        data-testid="github-repository"
        data-link-id={link.id}
      >
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="flex shrink-0 items-start gap-2">
            <GithubIcon
              className="mt-2 size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="min-w-0 flex-1 pt-1.5">
              <h2 className="min-w-0 text-sm font-semibold leading-5" title={name ?? undefined}>
                <a
                  href={link.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  <CardTitleText title={display.title} original={display.originalTitle} />
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
          <div className="min-w-0 space-y-1">
            <CardText
              text={display.description || "来源资料尚未补全，可先用已有信息进行 AI 整理。"}
            />
            <CardText text={display.originalDescription} auxiliary />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
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
              <span className="text-muted-foreground">仓库统计待补全</span>
            )}
            {repository?.language && (
              <span className="ml-auto truncate text-muted-foreground" title={repository.language}>
                {repository.language}
              </span>
            )}
          </div>
          {repository && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {repository.license && (
                <span className="truncate" title={repository.license}>
                  {repository.license}
                </span>
              )}
              <span
                className="min-w-0 flex-1 truncate"
                title={`默认分支 ${repository.defaultBranch}${repository.pushedAt ? ` · 最近提交 ${new Date(repository.pushedAt).toLocaleDateString()}` : ""}`}
              >
                分支 {repository.defaultBranch}
              </span>
              {repository.archived && (
                <Badge variant="secondary" className="shrink-0">
                  已归档
                </Badge>
              )}
            </div>
          )}
          {topics.length > 0 && (
            <div
              className="flex min-w-0 items-center gap-1 overflow-hidden"
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
          )}
          <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-muted-foreground">
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
            <div
              className="ml-auto max-w-full text-xs leading-4 text-muted-foreground"
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
          </div>
        </div>
        <LayerCard.Footer className="mt-auto flex-col items-stretch gap-1 border-border/60 bg-background/40 px-3 py-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onSuggest}>
              <Sparkles />
              AI 整理
            </Button>
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
