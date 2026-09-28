"use client";
import { useEffect, useRef, useState } from "react";
import {
  type EnvironmentMode,
  isEnvironmentMode,
  type LaunchIntent,
  PREFERENCE_KEY,
} from "@/scripts/lib/environment-mode";

type LocalDescriptor = { id: string; mode: EnvironmentMode; intent: LaunchIntent };
declare global {
  interface Window {
    __ZHE_LOCAL__?: LocalDescriptor;
  }
}
export function useEnvironmentViewModel() {
  const [local, setLocal] = useState<LocalDescriptor>();
  const dirty = useRef(false);
  useEffect(() => {
    const changed = () => {
      dirty.current = true;
    };
    document.addEventListener("input", changed);
    return () => document.removeEventListener("input", changed);
  }, []);
  const [pendingMode, setPendingMode] = useState<EnvironmentMode>();
  const [error, setError] = useState("");
  useEffect(() => {
    setLocal(window.__ZHE_LOCAL__);
  }, []);
  async function select(mode: string) {
    if (
      !local ||
      !isEnvironmentMode(mode) ||
      mode === local.mode ||
      local.intent === "automation" ||
      pendingMode
    )
      return;
    const event = new Event("beforeunload", { cancelable: true });
    if (
      (!window.dispatchEvent(event) || dirty.current) &&
      !window.confirm("Discard unsaved changes and switch environment?")
    )
      return;
    setPendingMode(mode);
    setError("");
    try {
      const response = await fetch("/_local/select", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-zhe-instance": local.id },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      try {
        localStorage.setItem(PREFERENCE_KEY, result.mode);
      } catch {}
      window.location.replace("/");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Environment switch failed");
      setPendingMode(undefined);
    }
  }
  return { local, pendingMode, error, select };
}
