import { validateTagName } from "@/models/tags";

export const SUGGEST_NOTE_MAX = 120;

export interface SuggestFolderOption {
  folderId: string | null;
  name: string;
  reason: string;
}

export interface SuggestTagOption {
  tagId: string | null;
  name: string;
  reason: string;
}

export interface SuggestLinkOrgResult {
  folders: SuggestFolderOption[];
  tags: SuggestTagOption[];
  note: string;
}

export interface SuggestCatalogs {
  folders: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}

export class SuggestParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuggestParseError";
  }
}

function stripFence(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return cleaned;
}

function extractJsonObject(text: string): string {
  const cleaned = stripFence(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return cleaned;
  return cleaned.slice(start, end + 1);
}

function asReason(value: unknown): string {
  return String(value).trim().slice(0, 80);
}

function normalizeOptionalId(value: unknown): string | null | undefined {
  if (value === undefined || value === "" || value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function parseFolders(rawItems: unknown[], folderById: Map<string, string>): SuggestFolderOption[] {
  const folders: SuggestFolderOption[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const folderId = normalizeOptionalId(item.folderId);
    if (folderId === undefined) continue;
    if (typeof item.name !== "string" || typeof item.reason !== "string") continue;
    if (folderId === "inbox") continue;
    if (folderId !== null && !folderById.has(folderId)) continue;
    const name = folderId === null ? "Inbox" : (folderById.get(folderId) ?? item.name);
    const key = folderId ?? "inbox";
    if (seen.has(key)) continue;
    seen.add(key);
    folders.push({ folderId, name, reason: asReason(item.reason) });
    if (folders.length === 3) break;
  }
  return folders;
}

function parseTags(rawItems: unknown[], tagById: Map<string, string>): SuggestTagOption[] {
  const tags: SuggestTagOption[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    let tagId = normalizeOptionalId(item.tagId);
    if (tagId === undefined) continue;
    if (typeof item.name !== "string" || typeof item.reason !== "string") continue;
    if (tagId && !tagById.has(tagId)) tagId = null;
    const name = tagId ? (tagById.get(tagId) ?? item.name) : item.name;
    const valid = validateTagName(name);
    if (!valid) continue;
    const dedupe = valid.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    tags.push({ tagId, name: valid, reason: asReason(item.reason) });
    if (tags.length === 5) break;
  }
  return tags;
}

export function parseSuggestLinkOrg(text: string, catalogs: SuggestCatalogs): SuggestLinkOrgResult {
  const payload = extractJsonObject(text);
  if (!payload.trim()) {
    throw new SuggestParseError("模型没有返回内容");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new SuggestParseError("模型返回不是有效 JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SuggestParseError("返回格式无效");
  }
  const root = parsed as Record<string, unknown>;
  if (!Array.isArray(root.folders) || !Array.isArray(root.tags)) {
    throw new SuggestParseError("返回必须包含文件夹和标签列表");
  }
  const folders = parseFolders(root.folders, new Map(catalogs.folders.map((f) => [f.id, f.name])));
  const tags = parseTags(root.tags, new Map(catalogs.tags.map((t) => [t.id, t.name])));
  if (folders.length === 0 || tags.length === 0) {
    throw new SuggestParseError("未得到可用的文件夹或标签建议");
  }
  if (typeof root.note !== "string") {
    throw new SuggestParseError("返回必须包含备注总结");
  }
  const note = root.note.trim().slice(0, SUGGEST_NOTE_MAX);
  if (!note) {
    throw new SuggestParseError("未得到可用的备注总结");
  }
  return { folders, tags, note };
}

function folderKey(folderId: string | null): string {
  return folderId ?? "inbox";
}

export function remainingFolderOptions(
  suggested: SuggestFolderOption[],
  catalogs: SuggestCatalogs,
): SuggestFolderOption[] {
  const seen = new Set(suggested.map((item) => folderKey(item.folderId)));
  const extras: SuggestFolderOption[] = [];
  if (!seen.has("inbox")) {
    extras.push({ folderId: null, name: "Inbox", reason: "" });
  }
  for (const folder of catalogs.folders) {
    if (seen.has(folder.id)) continue;
    extras.push({ folderId: folder.id, name: folder.name, reason: "" });
  }
  return extras;
}

export function remainingTagOptions(
  suggested: SuggestTagOption[],
  catalogs: SuggestCatalogs,
): SuggestTagOption[] {
  const seenIds = new Set(
    suggested.map((item) => item.tagId).filter((id): id is string => Boolean(id)),
  );
  const seenNames = new Set(suggested.map((item) => item.name.trim().toLowerCase()));
  const extras: SuggestTagOption[] = [];
  for (const tag of catalogs.tags) {
    if (seenIds.has(tag.id) || seenNames.has(tag.name.trim().toLowerCase())) continue;
    extras.push({ tagId: tag.id, name: tag.name, reason: "" });
  }
  return extras;
}
