"use server";

import { getAuthContext } from "@/lib/auth-context";
import {
  type LinkOrganizationInput,
  saveLinkOrganization,
} from "@/lib/db/scoped/link-organization";

export async function applyLinkOrganization(input: LinkOrganizationInput) {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false as const, error: "Unauthorized" };
  try {
    return { success: true as const, data: await saveLinkOrganization(ctx.userId, input) };
  } catch {
    return {
      success: false as const,
      error:
        "未保存：链接、来源资料或分类可能已更新，请重新生成；如仍失败请重试。当前编辑内容已保留。",
    };
  }
}
