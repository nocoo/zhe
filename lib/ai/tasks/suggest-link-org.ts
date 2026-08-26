import { expandTemplate } from "@/lib/ai/expand-template";
import type { SuggestCatalogs } from "@/models/ai-suggest-link-org";

const ROLE = `You are organizing one bookmark for this user. Suggest only. Do not invent folders.`;

const RULES = `Folder must be an id from the catalog or Inbox (folderId=null). Prefer existing tags. New tags only when no existing tag fits. Chinese reason. Chinese note: one sentence summary for the bookmark note, max 120 chars. 1–3 folders, 1–5 tags.`;

const FORMAT = `Return only JSON with this shape:
{"folders":[{"folderId":null,"name":"Inbox","reason":"..."}],"tags":[{"tagId":null,"name":"...","reason":"..."}],"note":"..."}
ASCII punctuation outside strings. No trailing commas. No markdown wrapper.`;

export function buildSuggestLinkOrgPrompt(vars: {
  url: string;
  title: string;
  description: string;
  note: string;
  currentFolder: string;
  currentTags: string;
  catalogs: SuggestCatalogs;
}): string {
  const folderCatalog = [
    "- folderId=null name=Inbox",
    ...vars.catalogs.folders.map((f) => `- folderId=${f.id} name=${f.name}`),
  ].join("\n");
  const tagCatalog =
    vars.catalogs.tags.map((t) => `- id=${t.id} name=${t.name}`).join("\n") || "（无）";

  const data = expandTemplate(
    [
      "url: {{url}}",
      "title: {{title}}",
      "description: {{description}}",
      "note: {{note}}",
      "currentFolder: {{currentFolder}}",
      "currentTags: {{currentTags}}",
      "folderCatalog:",
      "{{folderCatalog}}",
      "tagCatalog:",
      "{{tagCatalog}}",
    ].join("\n"),
    {
      url: vars.url,
      title: vars.title,
      description: vars.description,
      note: vars.note,
      currentFolder: vars.currentFolder,
      currentTags: vars.currentTags,
      folderCatalog,
      tagCatalog,
    },
  );

  return [ROLE, data, RULES, FORMAT].join("\n\n");
}
