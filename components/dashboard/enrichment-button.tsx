"use client";

import { ListRestart } from "lucide-react";
import { type EnrichmentScope, useOpenEnrichment } from "@/contexts/enrichment";
import { IconAction, type IconActionDensity } from "./icon-action";

export function EnrichmentButton({
  source,
  className = "",
  density = "toolbar",
}: Pick<EnrichmentScope, "source"> & {
  className?: string;
  density?: IconActionDensity;
}) {
  const open = useOpenEnrichment();
  return (
    <IconAction
      variant="outline"
      density={density}
      label="补全记录"
      className={className}
      onClick={() => open(source ? { source } : {})}
    >
      <ListRestart aria-hidden />
    </IconAction>
  );
}
