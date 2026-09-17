import { describe, expect, it } from "vitest";
import {
  buildSearchDocument,
  findSearchMatch,
  normalizeSearchText,
  type SearchInput,
  searchHighlight,
  searchProjection,
  searchSnippet,
  toSearchHit,
} from "@/models/search";

const base: SearchInput = {
  kind: "link",
  id: 1,
  createdAt: 1,
  url: "https://github.com/owner/repo",
  title: "标题",
  slug: "short-slug",
  description: "description",
  note: "a note",
  folderName: "folder",
  tags: ["tag-name"],
};
const repository = {
  sourceFullName: "previous/repo",
  fullName: "owner/repo",
  description: "repository-description",
  language: "TypeScript",
  defaultBranch: "main-branch",
  license: "MIT",
  topics: ["topic-needle"],
  readmePath: "docs/README.md",
  readme: `${"padding ".repeat(10000)}readme-tail`,
  analysis: {
    summary: "AI-summary",
    features: ["AI-feature"],
    useCases: ["AI-case"],
    techStack: ["AI-stack"],
    tags: ["AI-tag"],
    model: "secret-model",
    provider: "secret-provider",
  },
  stars: 42,
  commits: 100,
  forks: 4,
  archived: true,
};
const tweet = {
  text: "tweet-body",
  lang: "ja",
  author: { name: "Display Name", username: "account", profile_image_url: "private-avatar" },
  entities: {
    hashtags: ["hashtag"],
    mentioned_users: ["mention"],
    urls: ["https://expanded.example/path"],
  },
  quoted_tweet: {
    text: "quoted-body",
    author: { name: "Quoted Name", username: "quoteaccount" },
    entities: { hashtags: ["quotehash"] },
  },
};
describe("verified search fields and literal semantics", () => {
  it.each([
    "标题",
    "short-slug",
    "github.com",
    "description",
    "a note",
    "folder",
    "tag-name",
    "previous/repo",
    "owner",
    "repo",
    "repository-description",
    "typescript",
    "main-branch",
    "mit",
    "topic-needle",
    "docs/readme.md",
    "readme-tail",
    "ai-summary",
    "ai-feature",
    "ai-case",
    "ai-stack",
    "ai-tag",
  ])("indexes GitHub/base field %s", (query) => {
    const doc = buildSearchDocument({ ...base, repository });
    expect(toSearchHit(doc, query)).not.toBeNull();
    expect(searchProjection(doc).text).toContain(normalizeSearchText(query));
  });
  it.each([
    "tweet-body",
    "ja",
    "display name",
    "@account",
    "#hashtag",
    "@mention",
    "expanded.example",
    "quoted-body",
    "quoted name",
    "@quoteaccount",
    "#quotehash",
  ])("indexes X field %s", (query) =>
    expect(
      toSearchHit(
        buildSearchDocument({ ...base, url: "https://x.com/account/status/1", tweet }),
        query,
      ),
    ).not.toBeNull(),
  );
  it.each(["secret-model", "secret-provider", "private-avatar"])(
    "excludes non-search metadata %s",
    (query) =>
      expect(toSearchHit(buildSearchDocument({ ...base, repository, tweet }), query)).toBeNull(),
  );
  it("indexes full idea/todo content and own tags without ancestor-only results", () => {
    for (const kind of ["idea", "todo"] as const) {
      const doc = buildSearchDocument({
        kind,
        id: 42,
        createdAt: 1,
        content: "full body tail",
        excerpt: "brief",
        tags: ["shopping"],
        emoji: "💡",
        done: true,
      });
      for (const query of ["tail", "brief", "shopping", "💡"])
        expect(toSearchHit(doc, query)).not.toBeNull();
      expect(doc.url).toContain(kind === "idea" ? "/ideas/42" : "/todos?id=42");
    }
  });
  it("folds NFC, Unicode case and repeated whitespace; never treats punctuation as operators", () => {
    const doc = buildSearchDocument({
      ...base,
      note: "CAFÉ\n\t  中文 MIX%_Text C++ C# @a /path [x] 'quote' 😀",
    });
    for (const query of [
      "cafe\u0301 中文",
      "mix%_text",
      "C++",
      "C#",
      "@a",
      "/path",
      "[x]",
      "'quote'",
      "😀",
    ])
      expect(toSearchHit(doc, query)).not.toBeNull();
    for (const query of ["mix.*text", "description a note", "", " \n "])
      expect(toSearchHit(doc, query)).toBeNull();
  });
  it("ranks exact title, title prefix, substring, identity, metadata, summary then body", () => {
    const docs: SearchInput[] = [
      { title: "needle" },
      { title: "needle more" },
      { title: "a needle" },
      { slug: "needle" },
      { tags: ["needle"] },
      { note: "needle" },
      { content: "needle" },
    ].map((input) => ({ ...base, title: "other", ...input }));
    expect(
      docs.map((input) => findSearchMatch(buildSearchDocument(input), "needle")?.score),
    ).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("maps Unicode case expansion and avoids false prefix highlights", () => {
    expect(searchHighlight("İSTANBUL café", "i\u0307s")).toEqual([
      { text: "İS", highlight: true },
      { text: "TANBUL café", highlight: false },
    ]);
    expect(searchHighlight("hello HELLO", "hello").filter((x) => x.highlight)).toHaveLength(2);
    const result = searchSnippet(`${"😀".repeat(80)}${"match".repeat(80)}`, "match".repeat(80));
    expect(
      result
        .filter((x) => x.highlight)
        .map((x) => x.text)
        .join(""),
    ).toMatch(/^match/);
    expect(result[1]?.highlight).toBe(false);
    expect(result.every((x) => x.text.isWellFormed())).toBe(true);
    expect(searchSnippet("unmatched", "absent")).toEqual([{ text: "unmatched", highlight: false }]);
  });
  it("returns only a bounded matching snippet, not raw README or fields", () => {
    const hit = toSearchHit(buildSearchDocument({ ...base, repository }), "readme-tail");
    expect(JSON.stringify(hit).length).toBeLessThan(1500);
    expect(hit).not.toHaveProperty("fields");
    expect(hit?.match.label).toBe("README");
    expect(hit?.metadata).toMatchObject({ stars: 42, commits: 100, forks: 4, archived: true });
  });
});
