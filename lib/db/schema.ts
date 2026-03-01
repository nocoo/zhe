import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// ============================================
// Auth.js Tables (required for D1 adapter)
// ============================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp' }),
  image: text('image'),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  sessionToken: text('sessionToken').unique().notNull(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
});

export const verificationTokens = sqliteTable('verificationTokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  compositePk: primaryKey({ columns: [table.identifier, table.token] }),
}));

// ============================================
// Application Tables
// ============================================

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('folder'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const links = sqliteTable('links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  originalUrl: text('original_url').notNull(),
  slug: text('slug').notNull().unique(),
  isCustom: integer('is_custom', { mode: 'boolean' }).default(false),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  clicks: integer('clicks').default(0),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  metaFavicon: text('meta_favicon'),
  screenshotUrl: text('screenshot_url'),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const analytics = sqliteTable('analytics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  linkId: integer('link_id').notNull().references(() => links.id, { onDelete: 'cascade' }),
  country: text('country'),
  city: text('city'),
  device: text('device'),
  browser: text('browser'),
  os: text('os'),
  referer: text('referer'),
  source: text('source'), // 'worker' | 'origin' | null (legacy data)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const webhooks = sqliteTable('webhooks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  token: text('token').notNull().unique(),
  rateLimit: integer('rate_limit').notNull().default(5),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const uploads = sqliteTable('uploads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull().unique(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  publicUrl: text('public_url').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const linkTags = sqliteTable('link_tags', {
  linkId: integer('link_id').notNull().references(() => links.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  compositePk: primaryKey({ columns: [table.linkId, table.tagId] }),
}));

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  previewStyle: text('preview_style').notNull().default('favicon'),
  backyWebhookUrl: text('backy_webhook_url'),
  backyApiKey: text('backy_api_key'),
  xrayApiUrl: text('xray_api_url'),
  xrayApiToken: text('xray_api_token'),
  backyPullKey: text('backy_pull_key'),
  backyPullSecret: text('backy_pull_secret'),
});

export const tweetCache = sqliteTable('tweet_cache', {
  tweetId: text('tweet_id').primaryKey(),
  authorUsername: text('author_username').notNull(),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar').notNull(),
  tweetText: text('tweet_text').notNull(),
  tweetUrl: text('tweet_url').notNull(),
  lang: text('lang'),
  tweetCreatedAt: text('tweet_created_at').notNull(),
  rawData: text('raw_data').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// ============================================
// Type exports
// ============================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;

export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;

export type Analytics = typeof analytics.$inferSelect;
export type NewAnalytics = typeof analytics.$inferInsert;

export type Upload = typeof uploads.$inferSelect;
export type NewUpload = typeof uploads.$inferInsert;

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type LinkTag = typeof linkTags.$inferSelect;
export type NewLinkTag = typeof linkTags.$inferInsert;

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;

export type TweetCache = typeof tweetCache.$inferSelect;
export type NewTweetCache = typeof tweetCache.$inferInsert;
