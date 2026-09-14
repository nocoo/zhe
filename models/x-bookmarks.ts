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

export interface XMediaDimensions {
  id: string;
  width: number;
  height: number;
}

export function getXBookmarkForLink(
  link: Pick<Link, "originalUrl">,
  bookmark: XBookmark | undefined,
): XBookmark | undefined {
  const post = canonicalXPost(link.originalUrl);
  if (!post || (bookmark?.tweet && bookmark.tweet.id !== post.id)) return undefined;
  return bookmark;
}

function parsePostLink(raw: string) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const hostname = url.hostname.replace(/^(www|mobile)\./, "");
    const isX = hostname === "x.com" || hostname === "twitter.com";
    const isXArticle = isX && /^\/(?:i\/)?article\//.test(url.pathname);
    return {
      url: raw,
      hostname,
      isXArticle,
      isArticle: isXArticle || (!isX && hostname !== "t.co" && hostname !== "pic.twitter.com"),
    };
  } catch {
    return null;
  }
}

/** Display an expanded URL once, while retaining meaningful text and ambiguous short links. */
export function getXPostPresentation(tweet: XPost) {
  const links = [...new Set(tweet.entities.urls)].flatMap((raw) => {
    const link = parsePostLink(raw);
    return link ? [link] : [];
  });
  const text = tweet.text.trim();
  // Captures have no short-to-expanded mapping. Only a single standalone t.co
  // URL with a single destination can safely be replaced by its link preview.
  const redundant =
    links.some((link) => link.url === text) ||
    (links.length === 1 && /^https?:\/\/t\.co\/[\w-]+$/.test(text));
  return { text: redundant ? "" : tweet.text, links };
}

export function getXContentTypes(tweet: XPost | null | undefined): XContentType[] {
  if (!tweet) return ["pending"];
  const types: XContentType[] = [];
  if (tweet.media.some((media) => media.type === "VIDEO")) types.push("video");
  if (tweet.media.some((media) => media.type === "PHOTO")) types.push("image");
  if (tweet.media.some((media) => media.type === "GIF")) types.push("gif");
  // ponytail: stored captures have no native article flag; classify long text and
  // expanded links until the Connector records a dedicated article type.
  if (tweet.text.length > 600 || tweet.entities.urls.some((url) => parsePostLink(url)?.isArticle))
    types.push("article");
  if (!types.length) types.push("text");
  return types;
}
