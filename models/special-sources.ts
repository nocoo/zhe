export type SpecialSource = "github" | "x";
export type SpecialSources = Record<SpecialSource, boolean>;
export const DEFAULT_SPECIAL_SOURCES: SpecialSources = { github: true, x: false };

/** Covers the entire source site, including profiles and native X articles. */
export function getSpecialSource(raw: string): SpecialSource | null {
  try {
    const { hostname } = new URL(raw);
    if (["x.com", "twitter.com"].some((host) => hostname === host || hostname.endsWith(`.${host}`)))
      return "x";
    if (hostname === "github.com" || hostname.endsWith(".github.com")) return "github";
  } catch {
    /* Ordinary malformed URLs do not become a special source. */
  }
  return null;
}

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
