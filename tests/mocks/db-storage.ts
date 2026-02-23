/**
 * Mock D1 storage for testing.
 * This is used by vitest to mock the D1 client.
 */

import type { Link, Analytics, Upload, Folder, Webhook, Tag } from '@/lib/db/schema';

// LinkTag raw row shape (matches D1 column names)
export interface MockLinkTag {
  link_id: number;
  tag_id: string;
}

// UserSettings raw row shape (matches D1 column names)
export interface MockUserSettings {
  user_id: string;
  preview_style: string;
  backy_webhook_url?: string | null;
  backy_api_key?: string | null;
}

// In-memory storage
const mockLinks = new Map<string, Link>();
const mockAnalytics: Analytics[] = [];
const mockUploads = new Map<number, Upload>();
const mockFolders = new Map<string, Folder>();
const mockWebhooks = new Map<string, Webhook>(); // keyed by userId
const mockTags = new Map<string, Tag>();
const mockLinkTags: MockLinkTag[] = [];
const mockUserSettings = new Map<string, MockUserSettings>(); // keyed by userId
let nextLinkId = 1;
let nextAnalyticsId = 1;
let nextUploadId = 1;
let nextWebhookId = 1;

export function clearMockStorage(): void {
  mockLinks.clear();
  mockAnalytics.length = 0;
  mockUploads.clear();
  mockFolders.clear();
  mockWebhooks.clear();
  mockTags.clear();
  mockLinkTags.length = 0;
  mockUserSettings.clear();
  nextLinkId = 1;
  nextAnalyticsId = 1;
  nextUploadId = 1;
  nextWebhookId = 1;
}

export function getMockLinks(): Map<string, Link> {
  return mockLinks;
}

export function getMockAnalytics(): Analytics[] {
  return mockAnalytics;
}

export function getMockUploads(): Map<number, Upload> {
  return mockUploads;
}

export function getMockFolders(): Map<string, Folder> {
  return mockFolders;
}

export function getMockWebhooks(): Map<string, Webhook> {
  return mockWebhooks;
}

export function getMockTags(): Map<string, Tag> {
  return mockTags;
}

export function getMockLinkTags(): MockLinkTag[] {
  return mockLinkTags;
}

export function getMockUserSettings(): Map<string, MockUserSettings> {
  return mockUserSettings;
}

export function getNextLinkId(): number {
  return nextLinkId++;
}

export function getNextAnalyticsId(): number {
  return nextAnalyticsId++;
}

export function getNextUploadId(): number {
  return nextUploadId++;
}

export function getNextWebhookId(): number {
  return nextWebhookId++;
}
