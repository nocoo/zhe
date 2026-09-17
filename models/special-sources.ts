import { getSpecialSource, type SpecialSource } from "@/cli/src/connector/sources";

export { getSpecialSource, type SpecialSource };
export type SpecialSources = Record<SpecialSource, boolean>;
export const DEFAULT_SPECIAL_SOURCES: SpecialSources = { github: true, x: false };

export function matchesSpecialSources(url: string, sources: SpecialSources): boolean {
  const source = getSpecialSource(url);
  return source === null || sources[source];
}

/** AI suggestions never treat an X attachment as a standalone media bookmark. */
export function suggestedFoldersForSource<T extends { name: string }>(
  url: string,
  folders: T[],
): T[] {
  if (getSpecialSource(url) !== "x") return folders;
  const mediaNames = new Set([
    "视频",
    "图片",
    "图像",
    "照片",
    "video",
    "videos",
    "image",
    "images",
    "photo",
    "photos",
  ]);
  return folders.filter((folder) => !mediaNames.has(folder.name.trim().toLowerCase()));
}
