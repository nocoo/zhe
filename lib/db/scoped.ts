/**
 * Scoped database access layer with enforced row-level security.
 *
 * All user-owned data operations MUST go through ScopedDB.
 * The userId is bound at construction time and injected into every query,
 * making it impossible to forget the ownership check.
 *
 * Public operations (e.g. slug lookup for redirects) remain as standalone
 * functions in ./index.ts — they intentionally have no user scope.
 *
 * Implementation is split into per-domain modules under ./scoped/*.ts.
 * Each module exports free functions that take userId as their first arg;
 * the ScopedDB class methods below are thin delegators to keep this file
 * small and to make each domain independently testable / refactorable.
 */

import type {
  Link,
  Analytics,
  Folder,
  FolderWithLinkCount,
  NewLink,
  NewFolder,
  Upload,
  NewUpload,
  Webhook,
  Tag,
  LinkTag,
  UserSettings,
  ApiKey,
  IdeaTag,
} from './schema';

import * as linksOps from './scoped/links';
import * as analyticsOps from './scoped/analytics';
import * as foldersOps from './scoped/folders';
import * as uploadsOps from './scoped/uploads';
import * as overviewOps from './scoped/overview';
import * as webhookOps from './scoped/webhook';
import * as tagsOps from './scoped/tags';
import * as settingsOps from './scoped/settings';
import * as apiKeysOps from './scoped/api-keys';
import * as ideasOps from './scoped/ideas';

// Re-export shared types so existing import paths keep working.
export type {
  LinkSortField,
  SortOrder,
  GetLinksOptions,
  GetIdeasOptions,
  IdeaListItem,
  IdeaDetail,
} from './scoped/types';

import type {
  GetLinksOptions,
  GetIdeasOptions,
  IdeaListItem,
  IdeaDetail,
} from './scoped/types';

export class ScopedDB {
  constructor(private readonly userId: string) {
    if (!userId) {
      throw new Error('ScopedDB requires a non-empty userId');
    }
  }

  // ---- Links ------------------------------------------------

  getLinks(options: GetLinksOptions = {}): Promise<Link[]> {
    return linksOps.getLinks(this.userId, options);
  }

  getLinksPage(
    options: GetLinksOptions & { limit: number; offset: number },
  ): Promise<{ items: Link[]; total: number }> {
    return linksOps.getLinksPage(this.userId, options);
  }

  getLinkById(id: number): Promise<Link | null> {
    return linksOps.getLinkById(this.userId, id);
  }

  getLinksByIds(ids: number[]): Promise<Link[]> {
    return linksOps.getLinksByIds(this.userId, ids);
  }

  createLink(data: Omit<NewLink, 'id' | 'createdAt' | 'userId'>): Promise<Link> {
    return linksOps.createLink(this.userId, data);
  }

  deleteLink(id: number): Promise<boolean> {
    return linksOps.deleteLink(this.userId, id);
  }

  updateLink(id: number, data: linksOps.UpdateLinkData): Promise<Link | null> {
    return linksOps.updateLink(this.userId, id, data);
  }

  updateLinkMetadata(id: number, data: linksOps.UpdateLinkMetadataData): Promise<Link | null> {
    return linksOps.updateLinkMetadata(this.userId, id, data);
  }

  updateLinkScreenshot(id: number, screenshotUrl: string): Promise<Link | null> {
    return linksOps.updateLinkScreenshot(this.userId, id, screenshotUrl);
  }

  updateLinkNote(id: number, note: string | null): Promise<Link | null> {
    return linksOps.updateLinkNote(this.userId, id, note);
  }

  // ---- Analytics --------------------------------------------

  getAnalyticsByLinkId(linkId: number): Promise<Analytics[]> {
    return analyticsOps.getAnalyticsByLinkId(this.userId, linkId);
  }

  getAnalyticsStats(linkId: number): Promise<analyticsOps.AnalyticsStats> {
    return analyticsOps.getAnalyticsStats(this.userId, linkId);
  }

  // ---- Folders ----------------------------------------------

  getFolders(): Promise<Folder[]> {
    return foldersOps.getFolders(this.userId);
  }

  getFoldersWithLinkCount(): Promise<FolderWithLinkCount[]> {
    return foldersOps.getFoldersWithLinkCount(this.userId);
  }

  getFolderById(id: string): Promise<Folder | null> {
    return foldersOps.getFolderById(this.userId, id);
  }

  createFolder(data: Omit<NewFolder, 'id' | 'createdAt' | 'userId'>): Promise<Folder> {
    return foldersOps.createFolder(this.userId, data);
  }

  updateFolder(
    id: string,
    data: Partial<Pick<Folder, 'name' | 'icon'>>,
  ): Promise<Folder | null> {
    return foldersOps.updateFolder(this.userId, id, data);
  }

  deleteFolder(id: string): Promise<boolean> {
    return foldersOps.deleteFolder(this.userId, id);
  }

  // ---- Uploads ----------------------------------------------

  getUploads(): Promise<Upload[]> {
    return uploadsOps.getUploads(this.userId);
  }

  createUpload(data: Omit<NewUpload, 'id' | 'createdAt' | 'userId'>): Promise<Upload> {
    return uploadsOps.createUpload(this.userId, data);
  }

  getUploadById(id: number): Promise<Upload | null> {
    return uploadsOps.getUploadById(this.userId, id);
  }

  deleteUpload(id: number): Promise<boolean> {
    return uploadsOps.deleteUpload(this.userId, id);
  }

  getUploadKey(id: number): Promise<string | null> {
    return uploadsOps.getUploadKey(this.userId, id);
  }

  // ---- Overview ---------------------------------------------

  getOverviewStats(): Promise<overviewOps.OverviewStats> {
    return overviewOps.getOverviewStats(this.userId);
  }

  // ---- Webhook ----------------------------------------------

  getWebhook(): Promise<Webhook | null> {
    return webhookOps.getWebhook(this.userId);
  }

  upsertWebhook(token: string): Promise<Webhook> {
    return webhookOps.upsertWebhook(this.userId, token);
  }

  updateWebhookRateLimit(rateLimit: number): Promise<Webhook | null> {
    return webhookOps.updateWebhookRateLimit(this.userId, rateLimit);
  }

  deleteWebhook(): Promise<boolean> {
    return webhookOps.deleteWebhook(this.userId);
  }

  // ---- Tags / Link-Tags -------------------------------------

  getTags(): Promise<Tag[]> { return tagsOps.getTags(this.userId); }
  getTagById(id: string): Promise<Tag | null> { return tagsOps.getTagById(this.userId, id); }
  createTag(data: { name: string; color: string }): Promise<Tag> {
    return tagsOps.createTag(this.userId, data);
  }
  updateTag(id: string, data: Partial<Pick<Tag, 'name' | 'color'>>): Promise<Tag | null> {
    return tagsOps.updateTag(this.userId, id, data);
  }
  deleteTag(id: string): Promise<boolean> { return tagsOps.deleteTag(this.userId, id); }

  getLinkTags(): Promise<LinkTag[]> { return tagsOps.getLinkTags(this.userId); }
  getTagsForLink(linkId: number): Promise<Tag[]> {
    return tagsOps.getTagsForLink(this.userId, linkId);
  }
  getTagsForLinks(linkIds: number[]): Promise<Map<number, Tag[]>> {
    return tagsOps.getTagsForLinks(this.userId, linkIds);
  }
  addTagToLink(linkId: number, tagId: string): Promise<boolean> {
    return tagsOps.addTagToLink(this.userId, linkId, tagId);
  }
  removeTagFromLink(linkId: number, tagId: string): Promise<boolean> {
    return tagsOps.removeTagFromLink(this.userId, linkId, tagId);
  }

  // ---- User Settings ----------------------------------------

  getUserSettings(): Promise<UserSettings | null> {
    return settingsOps.getUserSettings(this.userId);
  }
  upsertPreviewStyle(previewStyle: string): Promise<UserSettings> {
    return settingsOps.upsertPreviewStyle(this.userId, previewStyle);
  }
  getBackySettings(): Promise<{ webhookUrl: string; apiKey: string } | null> {
    return settingsOps.getBackySettings(this.userId);
  }
  upsertBackySettings(data: { webhookUrl: string; apiKey: string }): Promise<UserSettings> {
    return settingsOps.upsertBackySettings(this.userId, data);
  }
  getXraySettings(): Promise<{ apiUrl: string; apiToken: string } | null> {
    return settingsOps.getXraySettings(this.userId);
  }
  upsertXraySettings(data: { apiUrl: string; apiToken: string }): Promise<UserSettings> {
    return settingsOps.upsertXraySettings(this.userId, data);
  }
  getBackyPullWebhook(): Promise<{ key: string } | null> {
    return settingsOps.getBackyPullWebhook(this.userId);
  }
  upsertBackyPullWebhook(data: { key: string }): Promise<UserSettings> {
    return settingsOps.upsertBackyPullWebhook(this.userId, data);
  }
  deleteBackyPullWebhook(): Promise<UserSettings | null> {
    return settingsOps.deleteBackyPullWebhook(this.userId);
  }

  // ---- API Keys ---------------------------------------------

  getApiKeys(): Promise<ApiKey[]> { return apiKeysOps.getApiKeys(this.userId); }
  createApiKey(data: {
    id: string;
    prefix: string;
    keyHash: string;
    name: string;
    scopes: string;
  }): Promise<ApiKey> {
    return apiKeysOps.createApiKey(this.userId, data);
  }
  revokeApiKey(id: string): Promise<ApiKey | null> {
    return apiKeysOps.revokeApiKey(this.userId, id);
  }
  updateApiKeyLastUsed(id: string): Promise<void> {
    return apiKeysOps.updateApiKeyLastUsed(id);
  }

  // ---- Ideas ------------------------------------------------

  getIdeas(options: GetIdeasOptions = {}): Promise<IdeaListItem[]> {
    return ideasOps.getIdeas(this.userId, options);
  }
  getIdeasPage(
    options: GetIdeasOptions & { limit: number; offset: number },
  ): Promise<{ items: IdeaListItem[]; total: number }> {
    return ideasOps.getIdeasPage(this.userId, options);
  }
  getIdeaById(id: number): Promise<IdeaDetail | null> {
    return ideasOps.getIdeaById(this.userId, id);
  }
  createIdea(data: { content: string; title?: string; tagIds?: string[] }): Promise<IdeaDetail> {
    return ideasOps.createIdea(this.userId, data);
  }
  updateIdea(
    id: number,
    data: { title?: string | null; content?: string; tagIds?: string[] },
  ): Promise<IdeaDetail | null> {
    return ideasOps.updateIdea(this.userId, id, data);
  }
  deleteIdea(id: number): Promise<boolean> {
    return ideasOps.deleteIdea(this.userId, id);
  }
  getIdeaTags(): Promise<IdeaTag[]> {
    return ideasOps.getIdeaTags(this.userId);
  }
}
