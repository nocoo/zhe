export type SpecialSource = "github" | "x";

/** The whole source site, including profiles, articles and subdomains. */
export function getSpecialSource(raw: string): SpecialSource | null {
  try {
    const hostname = new URL(raw).hostname.replace(/\.+$/, "");
    if (["x.com", "twitter.com"].some((host) => hostname === host || hostname.endsWith(`.${host}`)))
      return "x";
    if (hostname === "github.com" || hostname.endsWith(".github.com")) return "github";
  } catch {
    // Malformed URLs are not special sources.
  }
  return null;
}
