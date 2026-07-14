"use server";

import type { ActionResult } from "@/actions/links/types";
import { getScopedDB } from "@/lib/auth-context";
import type { Link, LinkTag, Tag } from "@/models/types";

export interface DashboardData {
  links: Link[];
  tags: Tag[];
  linkTags: LinkTag[];
}

/**
 * Fetch all dashboard data in a single server action call.
 * Replaces 3 separate getLinks()/getTags()/getLinkTags() calls,
 * reducing auth() from 3 D1 session lookups to 1.
 */
export async function getDashboardData(): Promise<ActionResult<DashboardData>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: "Unauthorized" };
    }

    const [links, tags, linkTags] = await Promise.all([
      db.getLinks(),
      db.getTags(),
      db.getLinkTags(),
    ]);

    return { success: true, data: { links, tags, linkTags } };
  } catch (error) {
    console.error("Failed to get dashboard data:", error);
    return { success: false, error: "Failed to get dashboard data" };
  }
}
