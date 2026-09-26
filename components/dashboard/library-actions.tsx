"use client";

import { toast } from "@nocoo/basalt/components/toast";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useDashboardService } from "@/contexts/dashboard-service";
import type { EnrichmentSource } from "@/models/connector-activity";
import { EnrichmentButton } from "./enrichment-button";
import { IconAction } from "./icon-action";

/** Source collections share the same unrestricted creation flow as all links. */
export function LibraryActions({
  onRefresh,
  source,
}: {
  onRefresh: () => void;
  source: EnrichmentSource;
}) {
  const { refreshLinks } = useDashboardService();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshLinks();
      if (result.success) {
        onRefresh();
        toast.success("已刷新");
      } else toast.error(result.error || "刷新失败");
    } catch {
      toast.error("刷新失败，请稍后重试");
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div className="flex shrink-0 items-center gap-2">
      <EnrichmentButton source={source} />
      <IconAction
        variant="outline"
        size="sm"
        className="w-8 shrink-0 px-0"
        label="刷新链接"
        disabled={refreshing}
        onClick={refresh}
      >
        <RefreshCw
          className={refreshing ? "animate-spin motion-reduce:animate-none" : ""}
          strokeWidth={1.5}
          aria-hidden
        />
      </IconAction>
    </div>
  );
}
