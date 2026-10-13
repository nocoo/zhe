"use client";

import { LayerCard } from "@nocoo/basalt";
import {
  BookOpen,
  CircleAlert,
  Clock3,
  Code2,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  RefreshCw,
  Scale,
  Star,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { loadGitHubReadme } from "@/actions/github-connector";
import { canonicalGitHubRepo, type GitHubRepository } from "@/cli/src/connector/github-core";
import { MarkdownPreview } from "@/components/markdown-preview";
import { GithubIcon } from "@/components/site-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BOOKMARK_CARD_CLASS } from "@/components/ui/card-skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useBookmarkCardViewModel } from "@/viewmodels/useBookmarkCardViewModel";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { BookmarkCardDialogs } from "./bookmark-card-dialogs";
import { BookmarkCardFooter } from "./bookmark-card-footer";
import { CardTitleText } from "./link-card-parts/curated-text";
import { Description, SourceLinks } from "./link-card-parts/shared-rows";
import { TagBadge } from "./shared-link-components";

export function GitHubReadme({ link }: { link: Link }) {
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
  onSuggest?: () => void;
}) {
  const [reading, setReading] = useState(false);
  const vm = useBookmarkCardViewModel({
    link,
    siteUrl,
    onDelete,
    onUpdate: editCallbacks.onLinkUpdated,
    onSuggest,
    editable: true,
  });
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
  const errorText = bookmark?.errorCode
    ? (GITHUB_ERROR_LABELS[bookmark.errorCode] ?? "稍后重试，已有内容会保留")
    : null;
  const capturedAt = bookmark?.capturedAt ? new Date(bookmark.capturedAt).toLocaleString() : null;
  return (
    <>
      <LayerCard
        ref={vm.card}
        padding="none"
        className={`${BOOKMARK_CARD_CLASS} @container/repository h-96`}
        data-testid="github-repository"
        data-card-actions-container
        data-link-id={link.id}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
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
          <SourceLinks link={link} shortUrl={vm.shortUrl} />
          <div
            className="flex h-6 shrink-0 items-center gap-2 overflow-hidden"
            data-testid="github-card-tags"
          >
            {topics.slice(0, 3).map((topic) => (
              <span
                key={topic}
                title={`GitHub topic: ${topic}`}
                className="min-w-0 truncate text-xs text-muted-foreground"
                data-testid="github-repository-label"
              >
                {topic}
              </span>
            ))}
            {topics.length > 3 && (
              <span className="shrink-0 text-xs text-muted-foreground">+{topics.length - 3}</span>
            )}
          </div>
          <div className="min-h-0 flex-1" data-testid="github-card-description">
            <Description
              link={{ ...link, metaDescription: repository?.description || link.metaDescription }}
            />
          </div>
          <RepositoryInfo
            repository={repository}
            license={license}
            state={state}
            errorText={errorText}
          />
        </div>
        <BookmarkCardFooter
          link={link}
          folder={folder}
          tags={assignedTags}
          actions={[
            {
              id: "read-readme",
              label: "阅读 README",
              icon: BookOpen,
              placement: "toolbar",
              disabled: !repository,
              run: () => setReading(true),
            },
            ...vm.actions,
          ]}
          triggerRef={vm.menuTrigger}
        />
      </LayerCard>
      <BookmarkCardDialogs
        vm={vm}
        link={link}
        tags={tags}
        linkTags={linkTags}
        folders={folders}
        editCallbacks={editCallbacks}
      />
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
            {reading && (
              <GitHubReadme key={`${link.originalUrl}:${bookmark?.capturedAt}`} link={link} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
