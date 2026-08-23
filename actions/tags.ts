"use server";

import type { ActionResult } from "@/actions/links/types";
import { getScopedDB } from "@/lib/auth-context";
import type { LinkTag, Tag } from "@/lib/db/schema";
import {
  isDuplicateTagName,
  isValidTagColor,
  tagColorFromName,
  validateTagName,
} from "@/models/tags";

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

/**
 * Get all tags for the current user.
 */
export async function getTags(): Promise<ActionResult<Tag[]>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: "Unauthorized" };
    }

    const tags = await db.getTags();
    return { success: true, data: tags };
  } catch (error) {
    console.error("Failed to get tags:", error);
    return { success: false, error: "Failed to get tags" };
  }
}

/**
 * Create a new tag with optional color (random if omitted).
 */
export async function createTag(input: CreateTagInput): Promise<ActionResult<Tag>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: "Unauthorized" };
    }

    const validName = validateTagName(input.name);
    if (!validName) {
      return { success: false, error: "Invalid tag name" };
    }

    const color = input.color ?? tagColorFromName(validName);
    if (!isValidTagColor(color)) {
      return { success: false, error: "Invalid tag color" };
    }

    const existing = await db.getTags();
    if (isDuplicateTagName(validName, existing)) {
      return { success: false, error: "Tag name already exists" };
    }

    const tag = await db.createTag({ name: validName, color });
    return { success: true, data: tag };
  } catch (error) {
    console.error("Failed to create tag:", error);
    return { success: false, error: "Failed to create tag" };
  }
}

/**
 * Update a tag by id.
 */
export async function updateTag(id: string, input: UpdateTagInput): Promise<ActionResult<Tag>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: "Unauthorized" };
    }

    const updateData: { name?: string; color?: string } = {};

    if (input.name !== undefined) {
      const validName = validateTagName(input.name);
      if (!validName) {
        return { success: false, error: "Invalid tag name" };
      }
      updateData.name = validName;
    }

    if (input.color !== undefined) {
      if (!isValidTagColor(input.color)) {
        return { success: false, error: "Invalid tag color" };
      }
      updateData.color = input.color;
    }

    if (updateData.name) {
      const existing = await db.getTags();
      if (isDuplicateTagName(updateData.name, existing, id)) {
        return { success: false, error: "Tag name already exists" };
      }
    }

    const tag = await db.updateTag(id, updateData);
    if (!tag) {
      return { success: false, error: "Tag not found or access denied" };
    }

    return { success: true, data: tag };
  } catch (error) {
    console.error("Failed to update tag:", error);
    return { success: false, error: "Failed to update tag" };
  }
}

/**
 * Delete a tag by id.
 */
export async function deleteTag(id: string): Promise<ActionResult> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: "Unauthorized" };
    }

    const deleted = await db.deleteTag(id);
    if (!deleted) {
      return { success: false, error: "Tag not found or access denied" };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to delete tag:", error);
    return { success: false, error: "Failed to delete tag" };
  }
}

/**
 * Get all link-tag associations for the current user.
 */
export async function getLinkTags(): Promise<ActionResult<LinkTag[]>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: "Unauthorized" };
    }

    const linkTags = await db.getLinkTags();
    return { success: true, data: linkTags };
  } catch (error) {
    console.error("Failed to get link tags:", error);
    return { success: false, error: "Failed to get link tags" };
  }
}

/**
 * Add a tag to a link.
 */
export async function ensureTagOnLink(
  linkId: number,
  name: string,
): Promise<ActionResult<{ tag: Tag; created: boolean; attached: boolean }>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: "Unauthorized" };
    }

    const validName = validateTagName(name);
    if (!validName) {
      return { success: false, error: "Invalid tag name" };
    }

    const link = await db.getLinkById(linkId);
    if (!link) {
      return { success: false, error: "Link not found" };
    }

    const existing = await db.getTags();
    let tag = existing.find((item) => item.name.trim().toLowerCase() === validName.toLowerCase());
    let created = false;
    if (!tag) {
      const createdResult = await createTag({ name: validName });
      if (!createdResult.success || !createdResult.data) {
        const again = await db.getTags();
        tag = again.find((item) => item.name.trim().toLowerCase() === validName.toLowerCase());
        if (!tag) {
          return { success: false, error: createdResult.error ?? "Failed to create tag" };
        }
      } else {
        tag = createdResult.data;
        created = true;
      }
    }

    const linkTags = await db.getLinkTags();
    const alreadyAttached = linkTags.some(
      (item) => item.linkId === linkId && item.tagId === tag.id,
    );
    const attached = await db.addTagToLink(linkId, tag.id);
    if (!attached) {
      return { success: false, error: "Failed to add tag to link" };
    }
    return { success: true, data: { tag, created, attached: !alreadyAttached } };
  } catch (error) {
    console.error("Failed to ensure tag on link:", error);
    return { success: false, error: "Failed to add tag to link" };
  }
}

export async function addTagToLink(linkId: number, tagId: string): Promise<ActionResult> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: "Unauthorized" };
    }

    const added = await db.addTagToLink(linkId, tagId);
    if (!added) {
      return { success: false, error: "Failed to add tag to link" };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to add tag to link:", error);
    return { success: false, error: "Failed to add tag to link" };
  }
}

/**
 * Remove a tag from a link.
 */
export async function removeTagFromLink(linkId: number, tagId: string): Promise<ActionResult> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: "Unauthorized" };
    }

    const removed = await db.removeTagFromLink(linkId, tagId);
    if (!removed) {
      return { success: false, error: "Link-tag association not found" };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to remove tag from link:", error);
    return { success: false, error: "Failed to remove tag from link" };
  }
}
