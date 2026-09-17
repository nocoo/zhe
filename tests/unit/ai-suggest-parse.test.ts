// @vitest-environment node
import { describe, expect, it } from "vitest";
import { expandTemplate } from "@/lib/ai/expand-template";
import { buildSuggestLinkOrgPrompt } from "@/lib/ai/tasks/suggest-link-org";
import {
  parseSuggestLinkOrg,
  remainingFolderOptions,
  remainingTagOptions,
} from "@/models/ai-suggest-link-org";

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
        title: "简短标题",
        folders: [{ folderId: "f1", name: "wrong", reason: "适合工作" }],
        tags: [{ tagId: "t1", name: "wrong", reason: "文档类" }],
        note: "工作文档入口",
      }),
      catalogs,
    );
    expect(result.folders[0]).toMatchObject({ folderId: "f1", name: "工作" });
    expect(result.tags[0]).toMatchObject({ tagId: "t1", name: "文档" });
    expect(result.note).toBe("工作文档入口");
  });

  it("parses fenced JSON and treats missing folderId as Inbox", () => {
    const result = parseSuggestLinkOrg(
      '```json\n{"title":"简短标题","folders":[{"name":"Inbox","reason":"暂存"}],"tags":[{"tagId":"t1","name":"文档","reason":"文档"}],"note":"暂存这条链接"}\n```',
      catalogs,
    );
    expect(result.folders[0]?.folderId).toBeNull();
    expect(result.tags[0]).toMatchObject({ tagId: "t1", name: "文档" });
  });

  it("drops invented folders and tags instead of turning them into new options", () => {
    const result = parseSuggestLinkOrg(
      JSON.stringify({
        title: "短标题",
        note: "内容介绍",
        folders: [
          { folderId: "missing", name: "x", reason: "r" },
          { folderId: null, name: "虚构分类", reason: "r" },
          { folderId: "inbox", name: "Inbox", reason: "r" },
          { folderId: 1, name: "x", reason: "r" },
        ],
        tags: [
          { tagId: "unknown", name: "新的", reason: "r" },
          { tagId: null, name: "文档", reason: "r" },
          { tagId: 1, name: "x", reason: "r" },
        ],
      }),
      catalogs,
    );
    expect(result.folders).toEqual([]);
    expect(result.tags).toEqual([]);
  });
  it("accepts empty catalogs and empty recommendations", () => {
    expect(
      parseSuggestLinkOrg(
        JSON.stringify({ title: "短标题", note: "内容介绍", folders: [], tags: [] }),
        { folders: [], tags: [] },
      ),
    ).toMatchObject({ folders: [], tags: [] });
  });

  it("dedupes folders and tags and caps reason length", () => {
    const result = parseSuggestLinkOrg(
      JSON.stringify({
        title: "简短标题",
        folders: [
          { folderId: "f1", name: "工作", reason: "a".repeat(120) },
          { folderId: "f1", name: "工作", reason: "dup" },
        ],
        tags: [
          { tagId: "t1", name: "文档", reason: "r" },
          { tagId: null, name: "文档", reason: "dup name" },
        ],
        note: "n".repeat(120),
      }),
      catalogs,
    );
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0]?.reason).toHaveLength(80);
    expect(result.tags).toHaveLength(1);
    expect(result.note).toHaveLength(120);
  });

  it("fails on fullwidth commas", () => {
    expect(() =>
      parseSuggestLinkOrg('{"title":"简短标题","folders":[]，"tags":[]}', catalogs),
    ).toThrow();
  });

  it("treats a null root as a parse error", () => {
    expect(() => parseSuggestLinkOrg("null", catalogs)).toThrow("返回格式无效");
  });

  it("caps folders at 3 and tags at 5 and skips junk items", () => {
    const result = parseSuggestLinkOrg(
      JSON.stringify({
        title: "简短标题",
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
          { tagId: "a", name: "a", reason: "1" },
          { tagId: "b", name: "b", reason: "2" },
          { tagId: "c", name: "c", reason: "3" },
          { tagId: "d", name: "d", reason: "4" },
          { tagId: "e", name: "e", reason: "5" },
          { tagId: "f", name: "f", reason: "6" },
        ],
        note: "学习资料",
      }),
      {
        folders: [...catalogs.folders, { id: "f2", name: "学习" }],
        tags: "abcdef".split("").map((id) => ({ id, name: id })),
      },
    );
    expect(result.folders).toHaveLength(3);
    expect(result.tags).toHaveLength(5);
    expect(result.tags.map((t) => t.name)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("rejects a missing or blank note", () => {
    expect(() =>
      parseSuggestLinkOrg(
        JSON.stringify({
          title: "简短标题",
          folders: [{ folderId: null, name: "Inbox", reason: "r" }],
          tags: [{ tagId: "t1", name: "文档", reason: "r" }],
        }),
        catalogs,
      ),
    ).toThrow("备注总结");
    expect(() =>
      parseSuggestLinkOrg(
        JSON.stringify({
          title: "简短标题",
          folders: [{ folderId: null, name: "Inbox", reason: "r" }],
          tags: [{ tagId: "t1", name: "文档", reason: "r" }],
          note: "   ",
        }),
        catalogs,
      ),
    ).toThrow("未得到可用的备注总结");
  });

  it("lists remaining catalog folders and tags after suggestions", () => {
    const folders = remainingFolderOptions([{ folderId: "f1", name: "工作", reason: "r" }], {
      folders: [
        { id: "f1", name: "工作" },
        { id: "f2", name: "学习" },
      ],
      tags: [],
    });
    expect(folders).toEqual([
      { folderId: null, name: "Inbox", reason: "" },
      { folderId: "f2", name: "学习", reason: "" },
    ]);
    const tags = remainingTagOptions([{ tagId: "t1", name: "文档", reason: "r" }], {
      folders: [],
      tags: [
        { id: "t1", name: "文档" },
        { id: "t2", name: "阅读" },
      ],
    });
    expect(tags).toEqual([{ tagId: "t2", name: "阅读", reason: "" }]);
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
      'Sure.\n{"title":"简短标题","folders":[{"folderId":"f1","name":"工作","reason":"适合"}],"tags":[{"tagId":"t1","name":"文档","reason":"文档"}],"note":"工作文档"}\nDone.',
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
    expect(JSON.parse(prompt).current.folder).toBe("Inbox");
    expect(JSON.parse(prompt).catalogs.folders).toEqual([{ id: "f1", name: "工作" }]);
    expect(JSON.parse(prompt).catalogs.tags).toEqual([]);
    expect(prompt).toContain("https://example.com");
    expect(JSON.parse(prompt).current.note).toBe("");
  });
});
