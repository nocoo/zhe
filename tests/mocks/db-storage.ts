/**
 * Mock D1 storage for testing.
 * This is used by vitest to mock the D1 client.
 */

import type { Link, Analytics } from '@/lib/db/schema';

// In-memory storage
const mockLinks = new Map<string, Link>();
const mockAnalytics: Analytics[] = [];
let nextLinkId = 1;
let nextAnalyticsId = 1;

export function clearMockStorage(): void {
  mockLinks.clear();
  mockAnalytics.length = 0;
  nextLinkId = 1;
  nextAnalyticsId = 1;
}

export function getMockLinks(): Map<string, Link> {
  return mockLinks;
}

export function getMockAnalytics(): Analytics[] {
  return mockAnalytics;
}

export function getNextLinkId(): number {
  return nextLinkId++;
}

export function getNextAnalyticsId(): number {
  return nextAnalyticsId++;
}
