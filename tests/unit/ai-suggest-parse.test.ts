// @vitest-environment node
import { describe, expect, it } from "vitest";
import { expandTemplate } from "@/lib/ai/expand-template";
import { parseSuggestLinkOrg } from "@/models/ai-suggest-link-org";

const catalogs = {
  folders: [{ id: "f1", name: "工作" }],
  tags: [{ id: "t1", name: "文档" }],
};

describe("expandTemplate", () => {
  it("expands known keys and leaves unknown keys", () => {
    expect(expandTemplate("Hello {{name}}", { name: "World" })).toBe("Hello World");
    expect(expandTemplate("{{known}} {{unknown}}", { known: "yes" })).toBe("yes {{unknown}}");
    expect(expandTemplate("{{scores.focus}}", { "scores.focus": "80" })).toBe("80");
  });
});

describe("parseSuggestLinkOrg", () => {
  it("parses happy JSON and overwrites catalog names", () => {
    const result = parseSuggestLinkOrg(
      JSON.stringify({
        folders: [{ folderId: "f1", name: "wrong", reason: "适合工作" }],
        tags: [{ tagId: "t1", name: "wrong", reason: "文档类" }],
      }),
      catalogs,
    );
    expect(result.folders[0]).toMatchObject({ folderId: "f1", name: "工作" });
    expect(result.tags[0]).toMatchObject({ tagId: "t1", name: "文档" });
  });

  it("parses fenced JSON and treats missing folderId as Inbox", () => {
    const result = parseSuggestLinkOrg(
      '```json\n{"folders":[{"name":"Inbox","reason":"暂存"}],"tags":[{"tagId":null,"name":"新标签","reason":"新建"}]}\n```',
      catalogs,
    );
    expect(result.folders[0]?.folderId).toBeNull();
    expect(result.tags[0]).toMatchObject({ tagId: null, name: "新标签" });
  });

  it("drops unknown folders, inbox string, long tag names, and bad types", () => {
    expect(() =>
      parseSuggestLinkOrg(
        JSON.stringify({
          folders: [
            { folderId: "missing", name: "x", reason: "r" },
            { folderId: "inbox", name: "Inbox", reason: "r" },
            { folderId: 1, name: "n", reason: "r" },
          ],
          tags: [{ tagId: null, name: "x".repeat(31), reason: "r" }],
        }),
        catalogs,
      ),
    ).toThrow("non-empty");
  });

  it("treats unknown tagId as a new tag", () => {
    const result = parseSuggestLinkOrg(
      JSON.stringify({
        folders: [{ folderId: null, name: "Inbox", reason: "r" }],
        tags: [{ tagId: "unknown", name: "新的", reason: "r" }],
      }),
      catalogs,
    );
    expect(result.tags[0]).toMatchObject({ tagId: null, name: "新的" });
  });

  it("fails on fullwidth commas", () => {
    expect(() => parseSuggestLinkOrg('{"folders":[]，"tags":[]}', catalogs)).toThrow();
  });
});
