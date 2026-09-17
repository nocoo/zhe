import type { Link } from "./types";

/** Curated fields win everywhere; source-specific views only supply raw fallbacks. */
export function linkPresentation(
  link: Pick<Link, "title" | "note" | "metaTitle" | "metaDescription" | "originalUrl">,
  originalTitle = link.metaTitle,
  originalDescription = link.metaDescription,
) {
  const title = link.title?.trim() || "";
  const note = link.note?.trim() || "";
  let fallback: string;
  try {
    fallback = new URL(link.originalUrl).hostname;
  } catch {
    fallback = link.originalUrl;
  }
  const rawTitle = originalTitle?.trim() || fallback;
  const rawDescription = originalDescription?.trim() || "";
  return {
    title: title || rawTitle,
    originalTitle: title && title !== rawTitle ? rawTitle : "",
    note,
    description: note || rawDescription,
    originalDescription: note && note !== rawDescription ? rawDescription : "",
  };
}
