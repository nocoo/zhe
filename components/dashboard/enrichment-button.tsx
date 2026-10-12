"use client";

import { ListRestart } from "lucide-react";
import { type EnrichmentScope, useOpenEnrichment } from "@/contexts/enrichment";
import { IconAction } from "./icon-action";

export function EnrichmentButton({
  source,
  className = "",
}: Pick<EnrichmentScope, "source"> & { className?: string }) {
  const open = useOpenEnrichment();
  return (
    <IconAction
      variant="outline"
      label="补全记录"
      className={className}
      onClick={() => open(source ? { source } : {})}
    >
      <ListRestart strokeWidth={1.5} aria-hidden />
    </IconAction>
  );
}
