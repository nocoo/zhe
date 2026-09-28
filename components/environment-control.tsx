"use client";
import { ToggleGroup, ToggleGroupItem } from "@nocoo/basalt/components/toggle-group";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useEnvironmentViewModel } from "@/viewmodels/useEnvironmentViewModel";

export function EnvironmentControl({ className }: { className?: string } = {}) {
  const { local, pendingMode, error, select } = useEnvironmentViewModel();
  const [animateIndicator, setAnimateIndicator] = useState(false);
  if (!local) return null;
  return (
    <div className={className ?? "flex items-center gap-1"}>
      <ToggleGroup
        type="single"
        value={pendingMode ?? local.mode}
        onValueChange={(mode) => {
          setAnimateIndicator(true);
          void select(mode);
        }}
        className={
          animateIndicator ? undefined : "[&_[data-slot=selection-indicator]]:transition-none"
        }
        disabled={!!pendingMode || local.intent === "automation"}
        aria-label="Environment"
        aria-busy={!!pendingMode}
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
      <span
        role="status"
        className="flex size-4 shrink-0 items-center justify-center text-basalt-muted-foreground"
      >
        {pendingMode && (
          <>
            <Loader2
              className="size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="sr-only">Switching environment</span>
          </>
        )}
      </span>
      {error && (
        <span role="alert" className="text-xs text-basalt-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
