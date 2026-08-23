// @vitest-environment node
import { describe, expect, it } from "vitest";
import { expandTemplate } from "@/lib/ai/expand-template";
import { buildSuggestLinkOrgPrompt } from "@/lib/ai/tasks/suggest-link-org";
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
  it("rejects non-array folders or tags", () => {
    expect(() => parseSuggestLinkOrg('{"folders":{},"tags":[]}', catalogs)).toThrow("列表");
  });

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
    ).toThrow("未得到可用");
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

  it("dedupes folders and tags and caps reason length", () => {
    const result = parseSuggestLinkOrg(
      JSON.stringify({
        folders: [
          { folderId: "f1", name: "工作", reason: "a".repeat(120) },
          { folderId: "f1", name: "工作", reason: "dup" },
        ],
        tags: [
          { tagId: "t1", name: "文档", reason: "r" },
          { tagId: null, name: "文档", reason: "dup name" },
        ],
      }),
      catalogs,
    );
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0]?.reason).toHaveLength(80);
    expect(result.tags).toHaveLength(1);
  });

  it("fails on fullwidth commas", () => {
    expect(() => parseSuggestLinkOrg('{"folders":[]，"tags":[]}', catalogs)).toThrow();
  });

  it("treats a null root as a parse error", () => {
    expect(() => parseSuggestLinkOrg("null", catalogs)).toThrow("返回格式无效");
  });

  it("caps folders at 3 and tags at 5 and skips junk items", () => {
    const result = parseSuggestLinkOrg(
      JSON.stringify({
        folders: [
          null,
          { folderId: null },
          { folderId: null, name: "Inbox", reason: "one" },
          { folderId: "f1", name: "工作", reason: "two" },
          { folderId: "f2", name: "学习", reason: "three" },
          { folderId: null, name: "Inbox", reason: "four" },
        ],
        tags: [
          "nope",
          { tagId: 1, name: "x", reason: "r" },
          { tagId: null, name: "", reason: "r" },
          { tagId: null, name: "a", reason: "1" },
          { tagId: null, name: "b", reason: "2" },
          { tagId: null, name: "c", reason: "3" },
          { tagId: null, name: "d", reason: "4" },
          { tagId: null, name: "e", reason: "5" },
          { tagId: null, name: "f", reason: "6" },
        ],
      }),
      { folders: [...catalogs.folders, { id: "f2", name: "学习" }], tags: catalogs.tags },
    );
    expect(result.folders).toHaveLength(3);
    expect(result.tags).toHaveLength(5);
    expect(result.tags.map((t) => t.name)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("rejects a JSON array root", () => {
    expect(() => parseSuggestLinkOrg("[]", catalogs)).toThrow("返回格式无效");
  });

  it("rejects empty or whitespace-only output in Chinese", () => {
    expect(() => parseSuggestLinkOrg("", catalogs)).toThrow("模型没有返回内容");
    expect(() => parseSuggestLinkOrg("   \n", catalogs)).toThrow("模型没有返回内容");
    expect(() => parseSuggestLinkOrg("```json\n\n```", catalogs)).toThrow("模型没有返回内容");
  });

  it("extracts a JSON object from surrounding prose", () => {
    const result = parseSuggestLinkOrg(
      'Sure.\n{"folders":[{"folderId":"f1","name":"工作","reason":"适合"}],"tags":[{"tagId":"t1","name":"文档","reason":"文档"}]}\nDone.',
      catalogs,
    );
    expect(result.folders[0]).toMatchObject({ folderId: "f1", name: "工作" });
    expect(result.tags[0]).toMatchObject({ tagId: "t1", name: "文档" });
  });

  it("does not leak JSON.parse SyntaxError messages", () => {
    expect(() => parseSuggestLinkOrg("{", catalogs)).toThrow("模型返回不是有效 JSON");
    expect(() => parseSuggestLinkOrg("{", catalogs)).not.toThrow(/Unexpected end of JSON input/);
    expect(() => parseSuggestLinkOrg("not json", catalogs)).toThrow("模型返回不是有效 JSON");
  });
});

describe("buildSuggestLinkOrgPrompt", () => {
  it("injects Inbox and empty tag catalog", () => {
    const prompt = buildSuggestLinkOrgPrompt({
      url: "https://example.com",
      title: "Example",
      description: "",
      note: "",
      currentFolder: "Inbox",
      currentTags: "（无）",
      catalogs: { folders: [{ id: "f1", name: "工作" }], tags: [] },
    });
    expect(prompt).toContain("folderId=null name=Inbox");
    expect(prompt).toContain("folderId=f1 name=工作");
    expect(prompt).toContain("tagCatalog:\n（无）");
    expect(prompt).toContain("https://example.com");
  });
});
