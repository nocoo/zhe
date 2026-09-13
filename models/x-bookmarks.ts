import { canonicalXPost, type XPost } from "@/cli/src/connector/core";
import type { XBookmark } from "@/lib/connector/jobs";
import type { Link } from "./types";

export const X_CONTENT_TYPES = [
  { value: "all", label: "全部" },
  { value: "video", label: "视频" },
  { value: "image", label: "图片" },
  { value: "gif", label: "GIF" },
  { value: "article", label: "文章" },
  { value: "text", label: "文字" },
  { value: "pending", label: "待补全" },
] as const;

export type XContentType = (typeof X_CONTENT_TYPES)[number]["value"];

export function getXBookmarkForLink(
  link: Pick<Link, "originalUrl">,
  bookmark: XBookmark | undefined,
): XBookmark | undefined {
  const post = canonicalXPost(link.originalUrl);
  if (!post || (bookmark?.tweet && bookmark.tweet.id !== post.id)) return undefined;
  return bookmark;
}

function isArticleLink(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.replace(/^(www|mobile)\./, "");
    if (host === "t.co" || host === "pic.twitter.com") return false;
    if (host === "x.com" || host === "twitter.com")
      return /^\/(?:i\/)?article\//.test(url.pathname);
    return true;
  } catch {
    return false;
  }
}

export function getXContentTypes(tweet: XPost | null | undefined): XContentType[] {
  if (!tweet) return ["pending"];
  const types: XContentType[] = [];
  if (tweet.media.some((media) => media.type === "VIDEO")) types.push("video");
  if (tweet.media.some((media) => media.type === "PHOTO")) types.push("image");
  if (tweet.media.some((media) => media.type === "GIF")) types.push("gif");
  // ponytail: stored captures have no native article flag; classify long text and
  // expanded links until the Connector records a dedicated article type.
  if (tweet.text.length > 600 || tweet.entities.urls.some(isArticleLink)) types.push("article");
  if (!types.length) types.push("text");
  return types;
}
