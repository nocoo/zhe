"use client";

import { toast } from "@nocoo/basalt/components/toast";
import { useRef, useState } from "react";
import { setLinkHidden } from "@/actions/links";
import type { Link } from "@/models/types";
import type { BulkDeleteState } from "./useBulkDelete";

export function useBulkLinkVisibility(
  selection: BulkDeleteState,
  links: Link[],
  onUpdated: (link: Link) => void,
) {
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const update = async (hidden: boolean) => {
    if (running.current || selection.batch) return;
    const items = links.filter((link) => selection.selected.has(link.id));
    if (!items.length) return;
    running.current = true;
    setPending(true);
    let failures = 0;
    for (const link of items) {
      try {
        if (link.isHidden !== hidden) {
          const result = await setLinkHidden(link.id, hidden);
          if (!result.success || !result.data) throw new Error("Visibility update failed");
          onUpdated(result.data);
        }
        selection.deselect(link.id);
      } catch {
        failures++;
      }
    }
    running.current = false;
    setPending(false);
    if (failures) toast.error(`${failures} 项更新失败，请重试`);
    else toast.success(hidden ? `已隐藏 ${items.length} 项` : `已解除隐藏 ${items.length} 项`);
  };
  return { pending, update };
}
