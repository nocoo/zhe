import {
  canonicalXPost,
  videoFileSize,
  videoResolution,
  type XPost,
} from "@/cli/src/connector/core";
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

export function xMediaFailureMessage(
  code: string,
  attempts: NonNullable<XBookmark["mediaErrors"]>[number]["attempts"] = [],
  type: "PHOTO" | "VIDEO" | "GIF" = "VIDEO",
): string {
  if (code === "media_too_large") {
    if (type === "PHOTO") return "图片未归档：文件超过 10 MiB 上限。";
    const checked = attempts
      .map((a) => `${videoResolution(a.width, a.height)} ${videoFileSize(a.size)}`)
      .join("、");
    return `视频未归档：${checked ? `${checked}，均` : "可用版本均"}超过 100 MB 上限。`;
  }
  const messages: Record<string, string> = {
    video_variant_unavailable: "没有可归档的 4K、1080p 或 720p MP4 版本",
    media_http_error: "X 媒体服务器未能返回文件",
    unsupported_media_type: "媒体格式不受支持",
    invalid_media_length: "媒体服务器未返回有效的文件大小",
    invalid_media: "媒体文件格式校验未通过",
    download_failed: "媒体下载中断，请检查 Connector 网络连接",
    decode_failed: "媒体解码校验失败，请检查 Connector 的 FFmpeg",
    size_mismatch: "下载不完整，文件大小与服务器声明不一致",
    unsafe_redirect: "媒体重定向地址未通过校验",
    unsafe_media_address: "媒体服务器地址未通过校验",
    media_dns_unavailable: "无法解析媒体服务器地址",
    upload_failed: "媒体已下载，但上传归档失败",
    interrupted: "Connector 处理被中断",
    needs_login: "本地浏览器尚未登录 X",
    opencli_unavailable: "无法连接本地 OpenCLI 浏览器扩展",
    unsupported_opencli_version: "OpenCLI 版本不匹配，请更新 Connector",
    adapter_contract_changed: "X 接口发生变化，请更新 Connector",
    post_unavailable: "原帖不可访问，可能已删除或受限",
  };
  return messages[code] ?? "此记录未保留具体失败原因；重新补全可获取详细信息";
}

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
