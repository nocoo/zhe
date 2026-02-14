/**
 * Mock D1 storage for testing.
 * This is used by vitest to mock the D1 client.
 */

import type { Link, Analytics, Upload, Folder } from '@/lib/db/schema';

// In-memory storage
const mockLinks = new Map<string, Link>();
const mockAnalytics: Analytics[] = [];
const mockUploads = new Map<number, Upload>();
const mockFolders = new Map<string, Folder>();
let nextLinkId = 1;
let nextAnalyticsId = 1;
let nextUploadId = 1;

export function clearMockStorage(): void {
  mockLinks.clear();
  mockAnalytics.length = 0;
  mockUploads.clear();
  mockFolders.clear();
  nextLinkId = 1;
  nextAnalyticsId = 1;
  nextUploadId = 1;
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

export function getNextLinkId(): number {
  return nextLinkId++;
}

export function getNextAnalyticsId(): number {
  return nextAnalyticsId++;
}

export function getNextUploadId(): number {
  return nextUploadId++;
}
