"use client";

import { ListRestart } from "lucide-react";
import { type EnrichmentScope, useOpenEnrichment } from "@/contexts/enrichment";
import { IconAction } from "./icon-action";

export function EnrichmentButton({
  linkId,
  source,
  className = "",
}: EnrichmentScope & { className?: string }) {
  const open = useOpenEnrichment();
  return (
    <IconAction
      variant={linkId ? "ghost" : "outline"}
      label={linkId ? "查看补全记录" : "补全记录"}
      aria-label={linkId ? "查看补全记录" : undefined}
      title={linkId ? "查看补全记录" : undefined}
      className={className}
      onClick={() => open({ ...(linkId ? { linkId } : {}), ...(source ? { source } : {}) })}
    >
      <ListRestart strokeWidth={1.5} aria-hidden />
    </IconAction>
  );
}
