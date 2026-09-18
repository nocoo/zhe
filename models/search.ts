/** Shared search semantics and field allowlist. No React, database, or credentials. */
export const SEARCH_SOURCES = ["web", "x", "github", "idea", "todo"] as const;
export type SearchSource = (typeof SEARCH_SOURCES)[number];
export type SearchKind = "link" | "idea" | "todo";
export type SearchFilter = SearchSource | "all";
export const SEARCH_SOURCE_LABELS: Record<SearchSource, string> = {
  web: "网页",
  x: "X",
  github: "GitHub",
  idea: "想法",
  todo: "待办",
};
export interface SearchField {
  label: string;
  value: string;
  group: "title" | "identity" | "metadata" | "summary" | "body";
}
export interface SearchInput {
  kind: SearchKind;
  id: number;
  title?: string | null;
  originalTitle?: string | null;
  url?: string;
  slug?: string;
  description?: string | null;
  note?: string | null;
  content?: string | null;
  excerpt?: string | null;
  tags?: string[];
  folderName?: string | null;
  folderId?: string | null;
  favicon?: string | null;
  createdAt: number;
  tweet?: unknown;
  repository?: unknown;
  state?: string | null;
  done?: boolean;
  emoji?: string | null;
}
export interface SearchDocument {
  preview?: string;
  note?: string;
  originalTitle?: string;
  kind: SearchKind;
  id: number;
  source: SearchSource;
  title: string;
  url: string;
  createdAt: number;
  slug?: string;
  favicon?: string | null;
  folderName?: string | null;
  folderId?: string | null;
  tags: string[];
  fields: SearchField[];
  metadata: {
    author?: string;
    authorName?: string;
    mediaTypes?: string[];
    repository?: string;
    language?: string;
    stars?: number;
    commits?: number;
    forks?: number;
    publishedAt?: string;
    state?: string;
    archived?: boolean;
    done?: boolean;
    emoji?: string;
  };
}
export interface SearchSegment {
  text: string;
  highlight: boolean;
}
export interface SearchHit extends Omit<SearchDocument, "fields"> {
  match: { label: string; segments: SearchSegment[] };
  matches?: { label: string; segments: SearchSegment[] }[];
  score: number;
}
export interface SearchResponse {
  query: string;
  items: SearchHit[];
  total: number;
  counts: Record<SearchSource, number>;
  offset: number;
  limit: number;
}
const space = /[\s\p{Cc}]+/gu;
export const searchDisplayText = (text: string) => text.normalize("NFC").replace(space, " ").trim();
export const normalizeSearchText = (text: string) => searchDisplayText(text).toLowerCase();
/** Spaces combine literal keywords with AND, including across different fields. */
export const searchTerms = (query: string): string[] => [
  ...new Set(normalizeSearchText(query).split(" ").filter(Boolean)),
];
export const searchIncludes = (text: string | null | undefined, query: string) =>
  Boolean(text && searchTerms(query).every((term) => normalizeSearchText(text).includes(term)));
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function linkIdentity(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^(www|mobile)\./, "");
    return {
      host,
      source: (["x.com", "twitter.com"].includes(host)
        ? "x"
        : host === "github.com"
          ? "github"
          : "web") as SearchSource,
    };
  } catch {
    return { host: raw, source: "web" as const };
  }
}

function addTweetFields(
  tweet: Record<string, unknown>,
  add: (label: string, value: unknown, group: SearchField["group"]) => void,
  prefix = "",
) {
  const author = record(tweet.author);
  const entities = record(tweet.entities);
  add(`${prefix}帖子 ID`, tweet.id, "identity");
  add(`${prefix}正文`, tweet.text, "body");
  add(`${prefix}作者`, author.name, "identity");
  add(`${prefix}账号`, author.username, "identity");
  if (text(author.username)) add(`${prefix}账号`, `@${text(author.username)}`, "identity");
  add(`${prefix}链接`, tweet.url, "identity");
  add(`${prefix}语言`, tweet.lang, "metadata");
  for (const value of texts(entities.hashtags)) {
    add(`${prefix}话题`, value, "metadata");
    add(`${prefix}话题`, `#${value}`, "metadata");
  }
  for (const value of texts(entities.mentioned_users)) {
    add(`${prefix}提及`, value, "identity");
    add(`${prefix}提及`, `@${value}`, "identity");
  }
  for (const value of texts(entities.urls)) add(`${prefix}展开链接`, value, "identity");
  for (const type of tweetMediaTypes(tweet)) add(`${prefix}媒体类型`, type, "metadata");
  if (tweet.is_reply === true) add(`${prefix}帖子类型`, "回复 reply", "metadata");
  if (tweet.is_retweet === true) add(`${prefix}帖子类型`, "转发 repost retweet", "metadata");
  if (tweet.is_quote === true) add(`${prefix}帖子类型`, "引用 quote", "metadata");
}

function tweetMediaTypes(tweet: Record<string, unknown>): string[] {
  const labels: Record<string, string> = {
    PHOTO: "图片 photo image",
    VIDEO: "视频 video",
    GIF: "GIF 动图",
  };
  return [
    ...new Set(
      (Array.isArray(tweet.media) ? tweet.media : [])
        .map((media) => labels[text(record(media).type)])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

export function buildSearchDocument(input: SearchInput): SearchDocument {
  const fields: SearchField[] = [];
  const add = (label: string, value: unknown, group: SearchField["group"]) => {
    if (text(value).trim()) fields.push({ label, value: text(value), group });
  };
  const identity = linkIdentity(input.url ?? "");
  const source = input.kind === "link" ? identity.source : input.kind;
  const repo = record(input.repository);
  const tweet = record(input.tweet);
  const title =
    input.title ||
    input.originalTitle ||
    text(repo.fullName) ||
    identity.host ||
    (input.kind === "idea" ? "未命名想法" : "未命名待办");
  add("标题", title, "title");
  add("来源", source === "x" ? "X Twitter 推特" : SEARCH_SOURCE_LABELS[source], "metadata");
  add("原始标题", input.originalTitle, "title");
  add("短链", input.slug, "identity");
  add("链接", input.url, "identity");
  if (input.kind === "link") add("域名", identity.host, "identity");
  add("备注", input.note, "summary");
  add(source === "x" ? "正文" : "简介", input.description, source === "x" ? "body" : "summary");
  add("摘要", input.excerpt, "summary");
  add("正文", input.content, "body");
  add("分类", input.folderName, "metadata");
  add("图标", input.emoji, "metadata");
  for (const value of input.tags ?? []) add("标签", value, "metadata");
  addTweetFields(tweet, add);
  addTweetFields(record(tweet.quoted_tweet), add, "引用帖 · ");
  for (const key of ["fullName", "sourceFullName"]) add("仓库", repo[key], "title");
  const [owner, name] = text(repo.fullName).split("/");
  add("仓库账号", owner, "identity");
  add("仓库名称", name, "title");
  add("仓库简介", repo.description, "summary");
  for (const [key, label] of [
    ["language", "语言"],
    ["license", "许可证"],
    ["defaultBranch", "默认分支"],
    ["readmePath", "README 路径"],
  ] as const)
    add(label, repo[key], "metadata");
  for (const value of texts(repo.topics)) add("GitHub topic", value, "metadata");
  add("README", repo.readme, "body");
  const analysis = record(repo.analysis);
  add("AI 简介", analysis.summary, "summary");
  for (const [key, label] of [
    ["features", "AI 功能"],
    ["useCases", "AI 场景"],
    ["techStack", "AI 技术栈"],
    ["tags", "AI 主题"],
  ] as const) {
    for (const value of texts(analysis[key]))
      add(label, value, key === "features" || key === "useCases" ? "summary" : "metadata");
  }
  const metadata = buildMetadata(input, tweet, repo);
  const preview =
    input.note ||
    text(tweet.text) ||
    text(repo.description) ||
    input.description ||
    input.excerpt ||
    input.content;
  return {
    kind: input.kind,
    id: input.id,
    source,
    title,
    url:
      input.kind === "link"
        ? (input.url ?? "")
        : input.kind === "idea"
          ? `/dashboard/ideas/${input.id}`
          : `/dashboard/todos?id=${input.id}`,
    createdAt: input.createdAt,
    tags: input.tags ?? [],
    fields,
    metadata,
    ...(preview ? { preview: searchDisplayText(preview).slice(0, 240) } : {}),
    ...(input.kind === "link" && input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.originalTitle && input.originalTitle !== title
      ? { originalTitle: input.originalTitle }
      : {}),
    ...(input.slug ? { slug: input.slug } : {}),
    ...(input.favicon ? { favicon: input.favicon } : {}),
    ...(input.folderName ? { folderName: input.folderName, folderId: input.folderId } : {}),
  };
}

function buildMetadata(
  input: SearchInput,
  tweet: Record<string, unknown>,
  repo: Record<string, unknown>,
) {
  const author = record(tweet.author);
  const metadata: SearchDocument["metadata"] = {};
  if (text(author.username)) metadata.author = `@${text(author.username)}`;
  if (text(author.name)) metadata.authorName = text(author.name);
  const mediaTypes = tweetMediaTypes(tweet).map((label) => label.split(" ")[0] as string);
  if (mediaTypes.length) metadata.mediaTypes = mediaTypes;
  if (text(repo.fullName)) metadata.repository = text(repo.fullName);
  if (text(repo.language)) metadata.language = text(repo.language);
  for (const key of ["stars", "commits", "forks"] as const) {
    const value = number(repo[key]);
    if (value !== undefined) metadata[key] = value;
  }
  if (text(tweet.created_at) || text(repo.pushedAt))
    metadata.publishedAt = text(tweet.created_at) || text(repo.pushedAt);
  if (input.state) metadata.state = input.state;
  if (repo.archived === true) metadata.archived = true;
  if (input.kind === "todo") metadata.done = Boolean(input.done);
  if (input.emoji) metadata.emoji = input.emoji;
  return metadata;
}

export function searchProjection(document: SearchDocument) {
  const values = (group?: SearchField["group"]) =>
    [
      ...new Set(
        document.fields
          .filter((f) => !group || f.group === group)
          .map((f) => normalizeSearchText(f.value)),
      ),
    ].join("\n");
  return {
    source: document.source,
    text: values(),
    titles: values("title"),
    identities: values("identity"),
    metadata: values("metadata"),
    summaries: values("summary"),
  };
}

export function findSearchMatch(
  document: SearchDocument,
  query: string,
): { field: SearchField; score: number } | null {
  const terms = searchTerms(query);
  if (!terms.length) return null;
  const matches = terms.map((term) => findFieldMatch(document, term));
  if (matches.some((match) => !match)) return null;
  const phrase = findFieldMatch(document, query);
  const first = terms.length === 1 ? matches[0] : (phrase ?? matches[0]);
  if (!first) return null;
  return {
    field: first.field,
    score:
      terms.length === 1
        ? first.score
        : phrase && phrase.score < 3
          ? phrase.score
          : 7 + matches.reduce((sum, match) => sum + (match?.score ?? 0), 0),
  };
}

function findFieldMatch(
  document: SearchDocument,
  query: string,
): { field: SearchField; score: number } | null {
  const needle = normalizeSearchText(query);
  if (!needle) return null;
  let best: { field: SearchField; score: number } | null = null;
  for (const field of document.fields) {
    const value = normalizeSearchText(field.value);
    if (!value.includes(needle)) continue;
    const score =
      field.group === "title"
        ? value === needle
          ? 0
          : value.startsWith(needle)
            ? 1
            : 2
        : { identity: 3, metadata: 4, summary: 5, body: 6 }[field.group];
    if (!best || score < best.score) best = { field, score };
  }
  return best;
}

/** Map lower-case expansion offsets (e.g. İ) back to display text. */
function displayRange(value: string, start: number, end: number): [number, number] {
  if (value.toLowerCase().length === value.length) return [start, end];
  let folded = 0;
  let original = 0;
  let from = 0;
  let to = value.length;
  for (const character of value) {
    const next = folded + character.toLowerCase().length;
    if (folded <= start && start < next) from = original;
    if (folded < end && end <= next) {
      to = original + character.length;
      break;
    }
    folded = next;
    original += character.length;
  }
  return [from, to];
}

export function searchHighlight(raw: string, query: string): SearchSegment[] {
  const value = searchDisplayText(raw);
  const folded = value.toLowerCase();
  const ranges: [number, number][] = [];
  for (const term of searchTerms(query)) {
    let offset = 0;
    while (offset < folded.length) {
      const index = folded.indexOf(term, offset);
      if (index < 0) break;
      ranges.push(displayRange(value, index, index + term.length));
      offset = index + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const result: SearchSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) result.push({ text: value.slice(cursor, start), highlight: false });
    result.push({ text: value.slice(start, end), highlight: true });
    cursor = end;
  }
  if (cursor < value.length) result.push({ text: value.slice(cursor), highlight: false });
  return result.length ? result : [{ text: value, highlight: false }];
}

export function searchSnippet(raw: string, query: string, length = 200): SearchSegment[] {
  const value = searchDisplayText(raw);
  const indices = searchTerms(query)
    .map((term) => value.toLowerCase().indexOf(term))
    .filter((index) => index >= 0);
  const index = indices.length ? Math.min(...indices) : 0;
  const [start] = displayRange(value, index, index + 1);
  let from = Math.max(0, start - 55);
  if (from > 0 && /[\uDC00-\uDFFF]/.test(value.charAt(from))) from--;
  let until = Math.min(value.length, from + length);
  if (until < value.length && /[\uDC00-\uDFFF]/.test(value.charAt(until))) until++;
  const segments = searchHighlight(value.slice(from, until), query);
  // A term longer than the excerpt still needs visible matching evidence.
  if (!segments.some((part) => part.highlight) && indices.length) {
    const left = Math.max(from, start);
    return [
      ...(from ? [{ text: "…", highlight: false }] : []),
      { text: value.slice(from, left), highlight: false },
      { text: value.slice(left, until), highlight: true },
      ...(until < value.length ? [{ text: "…", highlight: false }] : []),
    ];
  }
  if (from) segments.unshift({ text: "…", highlight: false });
  if (until < value.length) segments.push({ text: "…", highlight: false });
  return segments;
}

export function toSearchHit(document: SearchDocument, query: string): SearchHit | null {
  const match = findSearchMatch(document, query);
  if (!match) return null;
  const { fields: _, ...summary } = document;
  const fields = [
    ...new Set([
      match.field,
      ...searchTerms(query).flatMap((term) => {
        const found = findFieldMatch(document, term);
        return found ? [found.field] : [];
      }),
    ]),
  ];
  const matches = fields
    .slice(0, 3)
    .map((field) => ({ label: field.label, segments: searchSnippet(field.value, query) }));
  return {
    ...summary,
    score: match.score,
    match: { label: match.field.label, segments: searchSnippet(match.field.value, query) },
    matches,
  };
}
