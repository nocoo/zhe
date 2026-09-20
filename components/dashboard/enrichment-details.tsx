"use client";

import { useEffect, useState } from "react";
import { loadXBookmarks } from "@/actions/connector";
import { loadEnrichmentEventsAction } from "@/actions/enrichment";
import { Button } from "@/components/ui/button";
import type { XBookmark } from "@/lib/connector/jobs";
import {
  ENRICHMENT_STATES,
  type EnrichmentEvent,
  type EnrichmentTask,
  enrichmentError,
} from "@/models/connector-activity";
import type { Link } from "@/models/types";
import { GitHubReadme } from "./github-repository-card";
import { XBookmarkContent } from "./x-bookmark-content";

export function EnrichmentDetails({
  linkId,
  task,
  link,
}: {
  linkId: number;
  task: EnrichmentTask | undefined;
  link: Link | undefined;
}) {
  const [events, setEvents] = useState<EnrichmentEvent[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bookmark, setBookmark] = useState<XBookmark>();
  useEffect(() => {
    let active = true;
    void loadEnrichmentEventsAction(linkId)
      .then((result) => {
        if (!active) return;
        if (!result.success || !result.events) throw new Error("load_failed");
        const incoming = result.events;
        setEvents((current) =>
          [...new Map([...current, ...incoming].map((event) => [event.id, event])).values()].sort(
            (a, b) => b.id - a.id,
          ),
        );
        setMore(Boolean(result.more));
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    if (task?.source === "x")
      void loadXBookmarks([linkId])
        .then((result) => {
          if (active && result.success) setBookmark(result.data?.[0]);
        })
        .catch(() => {
          if (active) setError(true);
        });
    return () => {
      active = false;
    };
  }, [linkId, task]);
  const loadMore = async () => {
    setLoading(true);
    try {
      const result = await loadEnrichmentEventsAction(linkId, events.at(-1)?.id);
      if (!result.success || !result.events) throw new Error("load_failed");
      const incoming = result.events;
      setEvents((current) =>
        [...new Map([...current, ...incoming].map((event) => [event.id, event])).values()].sort(
          (a, b) => b.id - a.id,
        ),
      );
      setMore(Boolean(result.more));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  const previewUrl = task?.previewUrl ?? link?.screenshotUrl;
  return (
    <div className="mt-4 space-y-5">
      <section className="space-y-2" aria-label="执行记录">
        <h4 className="text-sm font-medium">执行记录</h4>
        {task && (
          <p className="text-xs text-muted-foreground">
            已记录 {task.recordedFailures} 次失败
            {!task.historyComplete && " · 早期逐次记录缺失，以下现状快照不计入失败统计"}
          </p>
        )}
        {!events.length && !loading && (
          <p className="text-sm text-muted-foreground">
            尚无执行记录，Connector 发现任务后会自动排队。
          </p>
        )}
        <ol className="divide-y divide-border rounded-widget border border-border text-xs">
          {events.map((event) => (
            <li key={event.id} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <time className="text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString("zh-CN")}
                </time>
                <span className="font-medium">
                  {event.kind === "snapshot"
                    ? "已有状态快照"
                    : event.kind === "queued"
                      ? "已加入队列"
                      : event.kind === "started"
                        ? "开始执行"
                        : ENRICHMENT_STATES[event.state]}
                </span>
                <span>本轮第 {event.attempts} 次尝试</span>
                {event.connectorName && (
                  <span className="text-muted-foreground">{event.connectorName}</span>
                )}
              </div>
              {event.errorCode && (
                <p className="break-words text-warning">
                  {enrichmentError(event.errorCode)} ({event.errorCode})
                </p>
              )}
              {(event.kind === "finished" || event.kind === "snapshot") && (
                <p className="text-muted-foreground">
                  {event.source === "screenshot"
                    ? `截图 ${event.mediaCount} 张`
                    : `${event.source === "github" ? "README" : "正文"} ${event.textChars} 字符${event.source === "x" ? ` · 附件 ${event.mediaCount}/${event.mediaTotal}` : ""}`}
                  {event.archivedBytes > 0 && ` · ${(event.archivedBytes / 1024).toFixed(1)} KiB`}
                </p>
              )}
            </li>
          ))}
        </ol>
        {loading && (
          <p role="status" className="text-xs text-muted-foreground">
            正在读取记录…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-warning">
            执行记录或采集内容暂时无法读取。
          </p>
        )}
        {more && (
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadMore()}>
            加载更早记录
          </Button>
        )}
      </section>
      <section className="min-w-0 space-y-3" aria-label="补全结果">
        <h4 className="text-sm font-medium">补全结果</h4>
        {task?.source === "x" ? (
          bookmark?.tweet ? (
            <XBookmarkContent bookmark={bookmark} />
          ) : (
            <p className="text-sm text-muted-foreground">尚未获得帖子正文与附件。</p>
          )
        ) : task?.source === "github" && link ? (
          <GitHubReadme key={task.updatedAt} link={link} />
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt="已保存的网站截图"
            className="w-full rounded-widget border border-border"
          />
        ) : (
          <p className="text-sm text-muted-foreground">尚未获得采集内容。</p>
        )}
      </section>
    </div>
  );
}
