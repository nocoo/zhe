"use server";

import { requireAuth } from "@/lib/auth-context";
import {
  getEnrichmentEvents,
  getEnrichmentTasks,
  retryEnrichmentTasks,
} from "@/lib/connector/activity";
import type { EnrichmentEvent, EnrichmentTask } from "@/models/connector-activity";

export async function loadEnrichmentTasksAction(): Promise<{
  success: boolean;
  tasks?: EnrichmentTask[];
}> {
  const userId = await requireAuth();
  if (!userId) return { success: false };
  try {
    return { success: true, tasks: await getEnrichmentTasks(userId) };
  } catch {
    return { success: false };
  }
}

export async function retryEnrichmentTasksAction(
  ids: number[],
): Promise<{ success: boolean; queued?: number[] }> {
  const userId = await requireAuth();
  if (
    !userId ||
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 80 ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    return { success: false };
  try {
    return { success: true, queued: await retryEnrichmentTasks(userId, ids) };
  } catch {
    return { success: false };
  }
}

export async function loadEnrichmentEventsAction(
  linkId: number,
  before = Number.MAX_SAFE_INTEGER,
): Promise<{ success: boolean; events?: EnrichmentEvent[]; more?: boolean }> {
  const userId = await requireAuth();
  if (
    !userId ||
    !Number.isSafeInteger(linkId) ||
    linkId <= 0 ||
    !Number.isSafeInteger(before) ||
    before <= 0
  )
    return { success: false };
  try {
    return { success: true, ...(await getEnrichmentEvents(userId, linkId, before)) };
  } catch {
    return { success: false };
  }
}
