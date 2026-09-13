import {
  ConnectorError,
  canonicalXPost,
  mediaUrl,
  record,
  type XCapture,
  type XMedia,
  type XPost,
} from "@/cli/src/connector/core";

function invalid(): never {
  throw new ConnectorError("invalid_capture", 400);
}
function string(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim())) invalid();
  return value;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) invalid();
  return value.map((s) => string(s, 4096));
}

function validatePost(raw: unknown, id: string, depth = 0): XPost {
  const post = record(raw);
  if (post.id !== id || canonicalXPost(string(post.url, 2048))?.id !== id) invalid();
  const author = record(post.author);
  const username = string(author.username, 50);
  if (!/^[a-zA-Z0-9_]+$/.test(username)) invalid();
  const date = new Date(string(post.created_at, 50));
  if (!Number.isFinite(date.getTime())) invalid();
  const avatar = string(author.profile_image_url, 2048, true);
  if (avatar && !/^https:\/\/pbs\.twimg\.com\/profile_images\/[A-Za-z0-9_/.-]+$/.test(avatar))
    invalid();
  const metrics = record(post.metrics);
  const entities = record(post.entities);
  if (!Array.isArray(post.media) || post.media.length > 16) invalid();
  const media: XMedia[] = post.media.map((rawMedia: unknown) => {
    const m = record(rawMedia);
    const mediaId = string(m.id, 22);
    const type = m.type;
    if (!["PHOTO", "VIDEO", "GIF"].includes(String(type))) invalid();
    const url = mediaUrl(string(m.url, 4096), mediaId, type === "PHOTO" ? "photo" : "video");
    if (!url) invalid();
    const thumbnail =
      m.thumbnail_url === undefined
        ? undefined
        : mediaUrl(string(m.thumbnail_url, 4096), mediaId, "poster");
    if (thumbnail === null) invalid();
    const duration = m.duration;
    if (
      duration !== undefined &&
      (typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration < 0 ||
        duration > 86400)
    )
      invalid();
    return {
      id: mediaId,
      type: type as XMedia["type"],
      url,
      thumbnail_url: thumbnail,
      width: m.width === undefined ? undefined : count(m.width),
      height: m.height === undefined ? undefined : count(m.height),
      duration: duration as number | undefined,
    };
  });
  if (new Set(media.map((m) => m.id)).size !== media.length) invalid();
  const quoted = post.quoted_tweet;
  if (depth && quoted !== undefined) invalid();
  const quotedTweet =
    quoted === undefined ? undefined : validatePost(quoted, string(record(quoted).id, 22), 1);
  if (quotedTweet?.media.length) invalid();
  const replyId = post.reply_to_id === undefined ? undefined : string(post.reply_to_id, 22);
  if (replyId && !/^\d+$/.test(replyId)) invalid();
  return {
    id,
    url: `https://x.com/${username}/status/${id}`,
    text: string(post.text, 100_000),
    created_at: date.toISOString(),
    lang: string(post.lang, 20, true),
    author: {
      id: string(author.id, 50, true),
      username,
      name: string(author.name, 200, true),
      profile_image_url: avatar,
      followers_count: count(author.followers_count),
      is_verified: author.is_verified === true,
    },
    metrics: {
      like_count: count(metrics.like_count),
      retweet_count: count(metrics.retweet_count),
      reply_count: count(metrics.reply_count),
      quote_count: count(metrics.quote_count),
      view_count: count(metrics.view_count),
      bookmark_count: count(metrics.bookmark_count),
    },
    entities: {
      hashtags: strings(entities.hashtags),
      mentioned_users: strings(entities.mentioned_users),
      urls: strings(entities.urls).filter((url) => /^https?:\/\//.test(url)),
    },
    is_retweet: post.is_retweet === true,
    is_quote: post.is_quote === true,
    is_reply: post.is_reply === true,
    reply_to_id: replyId,
    quoted_tweet: quotedTweet,
    media,
  };
}

export function validateCapture(raw: unknown, postId: string): XCapture {
  const tweet = validatePost(record(raw).tweet, postId);
  return { tweet, media: tweet.media };
}
