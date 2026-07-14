"use server";

import { getAuthContext } from "@/lib/auth-context";
import type { Upload } from "@/lib/db/schema";

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get all uploads for the current user.
 *
 * Isolated from `actions/upload.ts` on purpose: the write path
 * (`getPresignedUploadUrl` / `recordUpload` / `deleteUpload`) pulls
 * `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` via
 * `lib/r2/client`. Colocating the read path with the write path put
 * the whole AWS SDK into the SSR compile graph of
 * `/dashboard/uploads/page.tsx`, which pushed Turbopack cold-compile
 * past Playwright's 60s waitForURL budget under the 4-worker L3 CI
 * (STU-1588). This module has no R2 dependency, so the route SSR
 * only compiles the D1 read path.
 */
export async function getUploads(): Promise<ActionResult<Upload[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: "Unauthorized" };
    }

    const uploads = await ctx.db.getUploads();
    return { success: true, data: uploads };
  } catch (error) {
    console.error("Failed to get uploads:", error);
    return { success: false, error: "Failed to get uploads" };
  }
}
