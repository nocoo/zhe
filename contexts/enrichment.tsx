"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useState } from "react";
import type { EnrichmentSource } from "@/models/connector-activity";

export interface EnrichmentScope {
  linkId?: number;
  source?: EnrichmentSource;
}
const OpenEnrichmentContext = createContext<(scope?: EnrichmentScope) => void>(() => {});
const EnrichmentDialog = dynamic(() =>
  import("@/components/dashboard/enrichment-dialog").then((module) => module.EnrichmentDialog),
);

export function EnrichmentProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<EnrichmentScope | null>(null);
  return (
    <OpenEnrichmentContext.Provider value={(value = {}) => setScope(value)}>
      {children}
      {scope && <EnrichmentDialog scope={scope} onClose={() => setScope(null)} />}
    </OpenEnrichmentContext.Provider>
  );
}

export const useOpenEnrichment = () => useContext(OpenEnrichmentContext);
