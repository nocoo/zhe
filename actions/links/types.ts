/** Shared types for the link-actions module. */

export interface CreateLinkInput {
  originalUrl: string;
  customSlug?: string | undefined;
  folderId?: string | undefined;
  expiresAt?: Date | undefined;
  note?: string | undefined;
  screenshotUrl?: string | undefined;
  tagIds?: string[] | undefined;
}

export interface ActionResult<T = void> {
  success: boolean;
  data?: T | undefined;
  error?: string | undefined;
}
