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
