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
  Star,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { InlineEditArea } from "./link-card-parts/inline-edit-area";
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
  const [retrying, setRetrying] = useState(false);
  const vm = useLinkCardViewModel(link, siteUrl, onDelete, editCallbacks.onLinkUpdated);
  const repository = bookmark?.repository;
  const name =
    repository?.fullName ?? canonicalGitHubRepo(link.originalUrl)?.fullName ?? link.metaTitle;
  const folder = folders.find((folder) => folder.id === link.folderId)?.name ?? "Inbox";
  const assignedTags = tags.filter((tag) => linkTags.some((assigned) => assigned.tagId === tag.id));
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
        padding="none"
        className="min-w-0 overflow-hidden rounded-card shadow-card ring-1 ring-border/40"
        data-testid="github-repository"
        data-link-id={link.id}
      >
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <GithubIcon
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <h2 className="break-all text-base font-semibold leading-6">
                <a
                  href={link.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  {name}
                </a>
              </h2>
              {repository?.archived && (
                <Badge variant="secondary" className="mt-1">
                  已归档
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="编辑 GitHub 收藏"
              onClick={() => setEditing(!editing)}
            >
              <Pencil strokeWidth={1.5} />
            </Button>
          </div>
          <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
            {repository?.description ||
              link.metaDescription ||
              "保存仓库后，Connector 会补全仓库信息和 README。"}
          </p>
          {repository && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm tabular-nums">
              <span className="inline-flex items-center gap-1.5" title="GitHub stars">
                <Star className="size-3.5 text-amber-500" strokeWidth={1.5} aria-hidden />
                {repository.stars.toLocaleString()}
                <span className="text-xs text-muted-foreground">stars</span>
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
                <span className="text-xs text-muted-foreground">commits</span>
              </span>
              <span className="inline-flex items-center gap-1.5" title="GitHub forks">
                <GitFork className="size-3.5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                {repository.forks.toLocaleString()}
                <span className="text-xs text-muted-foreground">forks</span>
              </span>
            </div>
          )}
          {repository && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {repository.language && <span>{repository.language}</span>}
              {repository.license && <span>{repository.license}</span>}
              <span>分支 {repository.defaultBranch}</span>
              {repository.pushedAt && (
                <span>最近提交 {new Date(repository.pushedAt).toLocaleDateString()}</span>
              )}
            </div>
          )}
          {repository?.topics.length ? (
            <div className="flex flex-wrap gap-1">
              {repository.topics.map((topic) => (
                <Badge key={topic} variant="outline">
                  {topic}
                </Badge>
              ))}
            </div>
          ) : null}
          {link.note && (
            <p className="border-l-2 border-border pl-3 text-sm leading-6">{link.note}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="mr-1 inline-flex items-center gap-1.5">
              <FolderOpen className="size-3.5" strokeWidth={1.5} aria-hidden />
              {folder}
            </span>
            {assignedTags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} size="sm" />
            ))}
          </div>
        </div>
        <LayerCard.Footer className="flex-wrap gap-2 bg-background/30 px-5 py-3">
          <div className="mr-auto text-xs text-muted-foreground" role="status">
            {state !== "complete"
              ? GITHUB_STATE_LABELS[state]
              : bookmark?.capturedAt
                ? `采集于 ${new Date(bookmark.capturedAt).toLocaleString()}`
                : "已补全"}
            {bookmark?.errorCode && (
              <p className="mt-1">
                {GITHUB_ERROR_LABELS[bookmark.errorCode] ?? "稍后重试，已有内容会保留"}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="重新采集 GitHub 仓库"
            disabled={retrying || state === "running"}
            onClick={retry}
          >
            <RefreshCw className={retrying ? "animate-spin" : ""} strokeWidth={1.5} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!repository}
            onClick={() => setReading(true)}
          >
            <BookOpen strokeWidth={1.5} />
            阅读 README
          </Button>
        </LayerCard.Footer>
        {editing && (
          <InlineEditArea
            link={link}
            tags={tags}
            linkTags={linkTags}
            folders={folders}
            editCallbacks={editCallbacks}
            isDeleting={vm.isDeleting}
            handleDelete={vm.handleDelete}
            defaultEditing={false}
            onCloseEdit={() => setEditing(false)}
          />
        )}
      </LayerCard>
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
            {reading && <Readme key={`${link.originalUrl}:${bookmark?.capturedAt}`} link={link} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
