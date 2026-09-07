/** Apply stored/system theme to the document root. Must match ThemeProvider storageKey `"theme"`. */
export function applyStoredTheme(
  root: HTMLElement = document.documentElement,
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
  media: Pick<MediaQueryList, "matches"> | undefined = globalThis.matchMedia?.(
    "(prefers-color-scheme: dark)",
  ),
): void {
  let stored: string | null = null;
  try {
    stored = storage?.getItem("theme") ?? null;
  } catch {
    stored = null;
  }
  const prefersDark = media?.matches ?? false;
  const isDark = stored === "dark" || (stored !== "light" && prefersDark);
  root.classList.toggle("dark", isDark);
  root.classList.toggle("light", !isDark);
  root.dataset.mode = isDark ? "dark" : "light";
}

/** Pre-hydration theme script. Must match ThemeProvider storageKey `"theme"`. */
export const THEME_INIT_SCRIPT = `(function(){
  var stored = null;
  try { stored = window.localStorage.getItem("theme"); } catch (e) {}
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  var isDark = stored === "dark" || (stored !== "light" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.classList.toggle("light", !isDark);
  document.documentElement.dataset.mode = isDark ? "dark" : "light";
})();`;
