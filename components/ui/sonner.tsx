"use client";

import { Toaster as BasaltToaster } from "@nocoo/basalt/components/toast";
import { useTheme } from "@nocoo/basalt/providers/theme";
import { useEffect, useState } from "react";

function resolveMode(theme: string): "light" | "dark" {
  if (theme === "dark" || theme === "light") return theme;
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function Toaster() {
  const { theme } = useTheme();
  const [mode, setMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    const sync = () => setMode(resolveMode(theme));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [theme]);

  return <BasaltToaster theme={mode} />;
}
