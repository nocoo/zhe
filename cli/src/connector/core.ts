// Portable X contracts: shipped with the CLI and reused by the server.
export interface XMedia {
  id: string;
  type: "PHOTO" | "VIDEO" | "GIF";
  url: string;
  thumbnail_url?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  duration?: number | undefined;
}

export interface XPost {
  id: string;
  text: string;
  url: string;
  created_at: string;
  lang: string;
  author: {
    id: string;
    username: string;
    name: string;
    profile_image_url: string;
    followers_count: number;
    is_verified: boolean;
  };
  metrics: {
    retweet_count: number;
    like_count: number;
    reply_count: number;
    quote_count: number;
    view_count: number;
    bookmark_count: number;
  };
  entities: { hashtags: string[]; mentioned_users: string[]; urls: string[] };
  is_retweet: boolean;
  is_quote: boolean;
  is_reply: boolean;
  reply_to_id?: string | undefined;
  media: XMedia[];
  quoted_tweet?: XPost | undefined;
}

export interface XCapture {
  tweet: XPost;
  media: XMedia[];
}

export class ConnectorError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
    this.name = "ConnectorError";
  }
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
};
const items = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.slice(0, 100).map(record) : [];

export function canonicalXPost(raw: string): { id: string; url: string } | null {
  try {
    const url = new URL(raw);
    const match =
      /^\/(?:[a-zA-Z0-9_]{1,50}|i\/web)\/status\/(\d{1,22})(?:\/(?:video|photo)\/[1-4])?\/?$/.exec(
        url.pathname,
      );
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      ![
        "x.com",
        "www.x.com",
        "mobile.x.com",
        "twitter.com",
        "www.twitter.com",
        "mobile.twitter.com",
      ].includes(url.hostname) ||
      !match?.[1]
    )
      return null;
    return { id: match[1], url: `https://x.com/i/status/${match[1]}` };
  } catch {
    return null;
  }
}

// Reject redirects too at the download boundary. Never fetch arbitrary URLs from a post.
export function mediaUrl(
  raw: string,
  mediaId: string,
  kind: "video" | "poster" | "photo",
): string | null {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      !/^\d{1,22}$/.test(mediaId)
    )
      return null;
    const path =
      kind === "photo"
        ? /^\/media\/[A-Za-z0-9_-]+(?:\.(?:jpg|jpeg|png|webp))?$/
        : kind === "poster"
          ? new RegExp(
              `^/(?:amplify_video_thumb|ext_tw_video_thumb)/${mediaId}/(?:pu/)?img/[A-Za-z0-9_-]+(?:\\.(?:jpg|jpeg|png|webp))?$`,
            )
          : new RegExp(
              `^/(?:amplify_video|ext_tw_video)/${mediaId}/(?:pu/)?vid/(?:avc1/)?[0-9]+x[0-9]+/[A-Za-z0-9_-]+\\.mp4$`,
            );
    const queryKeys = kind === "video" ? ["tag"] : ["format", "name"];
    if (
      url.hostname !== (kind === "video" ? "video.twimg.com" : "pbs.twimg.com") ||
      !path.test(url.pathname) ||
      [...url.searchParams.keys()].some((key) => !queryKeys.includes(key))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function normalizeMedia(legacy: Record<string, unknown>, postId: string): XMedia[] {
  const media: XMedia[] = [];
  for (const raw of items(record(legacy.extended_entities).media).slice(0, 16)) {
    const id = text(raw.id_str);
    if (raw.source_status_id_str && raw.source_status_id_str !== postId) continue;
    if (raw.ext_media_availability && record(raw.ext_media_availability).status !== "Available")
      continue;
    const dimensions = record(raw.original_info);
    if (raw.type === "photo") {
      const url = mediaUrl(text(raw.media_url_https), id, "photo");
      if (url)
        media.push({
          id,
          type: "PHOTO",
          url,
          width: count(dimensions.width),
          height: count(dimensions.height),
        });
      continue;
    }
    if (raw.type !== "video" && raw.type !== "animated_gif") continue;
    const info = record(raw.video_info);
    const variants = items(info.variants)
      .filter((v) => v.content_type === "video/mp4")
      .sort((a, b) => count(b.bitrate) - count(a.bitrate));
    const url = variants.map((v) => mediaUrl(text(v.url), id, "video")).find(Boolean);
    if (!url) continue;
    const resolution = /\/(\d+)x(\d+)\//.exec(new URL(url).pathname);
    media.push({
      id,
      type: raw.type === "video" ? "VIDEO" : "GIF",
      url,
      thumbnail_url: mediaUrl(text(raw.media_url_https), id, "poster") ?? undefined,
      width: count(dimensions.width) || count(resolution?.[1]),
      height: count(dimensions.height) || count(resolution?.[2]),
      duration: count(info.duration_millis) / 1000,
    });
  }
  return media;
}

export function normalizeXPost(raw: unknown, targetId: string, depth = 0): XCapture | null {
  const wrapper = record(raw);
  const tw = record(wrapper.tweet ?? wrapper);
  const legacy = record(tw.legacy);
  if (
    tw.rest_id !== targetId ||
    !/^\d{1,22}$/.test(targetId) ||
    tw.__typename === "TweetUnavailable"
  )
    return null;
  const user = record(record(record(tw.core).user_results).result);
  const userLegacy = record(user.legacy);
  if (userLegacy.protected === true || record(user.privacy).protected === true) return null;
  const username = text(userLegacy.screen_name) || text(record(user.core).screen_name);
  if (!/^[a-zA-Z0-9_]{1,50}$/.test(username)) return null;
  const note = record(record(record(tw.note_tweet).note_tweet_results).result);
  const body = text(note.text) || text(legacy.full_text);
  if (!body || body.length > 100_000) return null;
  const date = new Date(text(legacy.created_at));
  if (!Number.isFinite(date.getTime())) return null;
  const entities = record(note.entity_set ?? legacy.entities);
  const avatar = text(userLegacy.profile_image_url_https) || text(record(user.avatar).image_url);
  const media = normalizeMedia(legacy, targetId);
  const quote = record(record(tw.quoted_status_result).result);
  const quoteId = text(record(quote.tweet ?? quote).rest_id);
  const quoted = depth === 0 && quoteId ? normalizeXPost(quote, quoteId, 1)?.tweet : undefined;
  // The task is bound to the focal post; quote text is useful context but its media is not this post's media.
  if (quoted) quoted.media = [];
  const tweet: XPost = {
    id: targetId,
    text: body,
    url: `https://x.com/${username}/status/${targetId}`,
    created_at: date.toISOString(),
    lang: text(legacy.lang).slice(0, 20),
    author: {
      id: text(user.rest_id),
      username,
      name: (text(userLegacy.name) || text(record(user.core).name)).slice(0, 200),
      profile_image_url: /^https:\/\/pbs\.twimg\.com\/profile_images\/[A-Za-z0-9_/.-]+$/.test(
        avatar,
      )
        ? avatar
        : "",
      followers_count: count(userLegacy.followers_count),
      is_verified: user.is_blue_verified === true || userLegacy.verified === true,
    },
    metrics: {
      retweet_count: count(legacy.retweet_count),
      like_count: count(legacy.favorite_count),
      reply_count: count(legacy.reply_count),
      quote_count: count(legacy.quote_count),
      view_count: count(record(tw.views).count),
      bookmark_count: count(legacy.bookmark_count),
    },
    entities: {
      hashtags: items(entities.hashtags)
        .map((e) => text(e.text))
        .filter(Boolean),
      mentioned_users: items(entities.user_mentions)
        .map((e) => text(e.screen_name))
        .filter(Boolean),
      urls: items(entities.urls)
        .map((e) => text(e.expanded_url))
        .filter((url) => /^https?:\/\//.test(url)),
    },
    is_retweet: Boolean(legacy.retweeted_status_id_str),
    is_quote: Boolean(quoteId),
    is_reply: Boolean(legacy.in_reply_to_status_id_str),
    reply_to_id: text(legacy.in_reply_to_status_id_str) || undefined,
    media,
    quoted_tweet: quoted,
  };
  return { tweet, media };
}

export function collectTweetEntities(payload: unknown): Map<string, unknown> {
  const found = new Map<string, unknown>();
  const stack: unknown[] = [payload];
  const seen = new Set<object>();
  while (stack.length && seen.size < 50_000) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    const obj = record(value);
    if (
      typeof obj.rest_id === "string" &&
      typeof record(obj.legacy).full_text === "string" &&
      obj.core
    )
      found.set(obj.rest_id, obj);
    const children = Array.isArray(value) ? value : Object.values(obj);
    for (const child of children.slice(0, 50_000 - seen.size)) {
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return found;
}

export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function verifySignature(bytes: Uint8Array, mime: string): void {
  const text = new TextDecoder("ascii");
  if (mime === "video/mp4" && bytes.length >= 24) {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    if (
      size >= 16 &&
      size <= 4096 &&
      text.decode(bytes.slice(4, 8)) === "ftyp" &&
      /^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(text.decode(bytes.slice(8, 12)))
    )
      return;
  }
  if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return;
  if (
    mime === "image/png" &&
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
  )
    return;
  if (
    mime === "image/webp" &&
    text.decode(bytes.slice(0, 4)) === "RIFF" &&
    text.decode(bytes.slice(8, 12)) === "WEBP"
  )
    return;
  throw new ConnectorError("invalid_media", 415);
}
