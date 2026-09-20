"use client";

import { ListRestart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type EnrichmentScope, useOpenEnrichment } from "@/contexts/enrichment";

export function EnrichmentButton({
  linkId,
  source,
  className = "",
}: EnrichmentScope & { className?: string }) {
  const open = useOpenEnrichment();
  return (
    <Button
      variant={linkId ? "ghost" : "outline"}
      size={linkId ? "icon" : "sm"}
      aria-label={linkId ? "查看补全记录" : undefined}
      title={linkId ? "查看补全记录" : undefined}
      className={className}
      onClick={() => open({ ...(linkId ? { linkId } : {}), ...(source ? { source } : {}) })}
    >
      <ListRestart strokeWidth={1.5} aria-hidden />
      {!linkId && "补全记录"}
    </Button>
  );
}
