"use client";
import { ToggleGroup, ToggleGroupItem } from "@nocoo/basalt/components/toggle-group";
import { useEffect, useRef, useState } from "react";
import {
  type EnvironmentMode,
  type LaunchIntent,
  PREFERENCE_KEY,
} from "@/scripts/lib/environment-mode";

type LocalDescriptor = { id: string; mode: EnvironmentMode; intent: LaunchIntent };
declare global {
  interface Window {
    __ZHE_LOCAL__?: LocalDescriptor;
  }
}
export function EnvironmentControl({ className }: { className?: string } = {}) {
  const [local, setLocal] = useState<LocalDescriptor>();
  const dirty = useRef(false);
  useEffect(() => {
    const changed = () => {
      dirty.current = true;
    };
    document.addEventListener("input", changed);
    return () => document.removeEventListener("input", changed);
  }, []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setLocal(window.__ZHE_LOCAL__);
  }, []);
  if (!local) return null;
  async function select(mode: string) {
    if (!local || !mode || mode === local.mode || local.intent === "automation") return;
    const event = new Event("beforeunload", { cancelable: true });
    if (
      (!window.dispatchEvent(event) || dirty.current) &&
      !window.confirm("Discard unsaved changes and switch environment?")
    )
      return;
    setPending(true);
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
      setPending(false);
    }
  }
  return (
    <div className={className ?? "flex items-center gap-1"}>
      <ToggleGroup
        type="single"
        value={local.mode}
        onValueChange={select}
        disabled={pending || local.intent === "automation"}
        aria-label="Environment"
      >
        <ToggleGroupItem className="text-xs" value="demo">
          Demo
        </ToggleGroupItem>
        <ToggleGroupItem className="text-xs" value="e2e">
          E2E
        </ToggleGroupItem>
        <ToggleGroupItem className="text-xs" value="prod">
          Prod
        </ToggleGroupItem>
      </ToggleGroup>
      {error && (
        <span role="alert" className="text-xs text-basalt-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
