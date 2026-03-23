/**
 * E2E Data Import/Export + Preview Style Tests
 *
 * Tests the full data round-trip through server actions with the in-memory D1 mock.
 * Validates from the perspective of an authenticated user:
 *   - Export links → import links → data consistency
 *   - Import validation (invalid payload, missing fields, duplicate slugs)
 *   - Import with mixed new/existing slugs (partial success)
 *   - Preview style get/set lifecycle
 *   - Multi-user isolation (export only sees own links)
 *   - Unauthenticated access denied
 *
 * BDD style — each scenario simulates a real user workflow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearMockStorage } from '../setup';
import type { Link } from '@/lib/db/schema';
import type { ExportedLink } from '@/models/settings';

// ---------------------------------------------------------------------------
// Mocks — auth (D1 uses the global mock from setup.ts)
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_A = 'user-settings-e2e-a';
const USER_B = 'user-settings-e2e-b';

function authenticatedAs(userId: string) {
  mockAuth.mockResolvedValue({
    user: { id: userId, name: 'E2E User', email: 'e2e@test.com' },
  });
}

function unauthenticated() {
  mockAuth.mockResolvedValue(null);
}

/** Create a link for the current authenticated user via server action */
async function seedLink(
  url: string,
  opts?: { customSlug?: string; folderId?: string },
): Promise<Link> {
  const { createLink } = await import('@/actions/links');
  const result = await createLink({
    originalUrl: url,
    customSlug: opts?.customSlug,
    folderId: opts?.folderId,
  });
  if (!result.success || !result.data) {
    throw new Error(`Failed to seed link: ${result.error}`);
  }
  return result.data;
}

function makeExportedLink(overrides: Partial<ExportedLink> = {}): ExportedLink {
  return {
    originalUrl: 'https://example.com',
    slug: 'test-slug',
    isCustom: false,
    clicks: 0,
    createdAt: '2026-01-15T00:00:00.000Z',
    folderId: null,
    expiresAt: null,
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
    screenshotUrl: null,
    note: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Data Import/Export + Preview Style E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockStorage();
  });

  // ============================================================
  // Scenario 1: Unauthenticated access denied
  // ============================================================
  describe('unauthenticated user', () => {
    it('cannot export links', async () => {
      unauthenticated();
      const { exportLinks } = await import('@/actions/settings');

      const result = await exportLinks();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot import links', async () => {
      unauthenticated();
      const { importLinks } = await import('@/actions/settings');

      const result = await importLinks([makeExportedLink()]);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot get preview style', async () => {
      unauthenticated();
      const { getPreviewStyle } = await import('@/actions/settings');

      const result = await getPreviewStyle();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot update preview style', async () => {
      unauthenticated();
      const { updatePreviewStyle } = await import('@/actions/settings');

      const result = await updatePreviewStyle('screenshot');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  // ============================================================
  // Scenario 2: Export → Import round-trip
  // As an authenticated user, I create links, export them,
  // clear data, import the export, and verify data consistency.
  // ============================================================
  describe('export → import round-trip', () => {
    it('round-trips links through export and import', async () => {
      authenticatedAs(USER_A);
      const { exportLinks, importLinks } = await import('@/actions/settings');

      // Step 1: Seed some links
      const link1 = await seedLink('https://github.com', { customSlug: 'gh' });
      await seedLink('https://vercel.com', { customSlug: 'vc' });

      // Step 2: Export
      const exportResult = await exportLinks();
      expect(exportResult.success).toBe(true);
      expect(exportResult.data).toHaveLength(2);

      const exported = exportResult.data!;

      // Verify export shape
      const ghExport = exported.find(e => e.slug === 'gh');
      expect(ghExport).toBeDefined();
      expect(ghExport!.originalUrl).toBe('https://github.com');
      expect(ghExport!.isCustom).toBe(true);
      expect(ghExport!.clicks).toBe(link1.clicks);

      const vcExport = exported.find(e => e.slug === 'vc');
      expect(vcExport).toBeDefined();
      expect(vcExport!.originalUrl).toBe('https://vercel.com');

      // Step 3: Clear storage and reimport
      clearMockStorage();

      const importResult = await importLinks(exported);
      expect(importResult.success).toBe(true);
      expect(importResult.data!.created).toBe(2);
      expect(importResult.data!.skipped).toBe(0);

      // Step 4: Export again and compare
      const reExport = await exportLinks();
      expect(reExport.success).toBe(true);
      expect(reExport.data).toHaveLength(2);

      // Verify data survived the round-trip
      const reGh = reExport.data!.find(e => e.slug === 'gh');
      expect(reGh!.originalUrl).toBe('https://github.com');
      expect(reGh!.isCustom).toBe(true);

      const reVc = reExport.data!.find(e => e.slug === 'vc');
      expect(reVc!.originalUrl).toBe('https://vercel.com');
    });

    it('preserves isCustom and clicks through round-trip', async () => {
      authenticatedAs(USER_A);
      const { exportLinks, importLinks } = await import('@/actions/settings');

      // Seed a custom slug link
      await seedLink('https://example.com', { customSlug: 'custom-one' });
      // Seed an auto-generated slug link
      await seedLink('https://auto.example.com');

      const exportResult = await exportLinks();
      expect(exportResult.success).toBe(true);

      const exported = exportResult.data!;
      const customLink = exported.find(e => e.slug === 'custom-one');
      const autoLink = exported.find(e => e.slug !== 'custom-one');
      expect(customLink!.isCustom).toBe(true);
      expect(autoLink!.isCustom).toBe(false);

      // Clear and reimport
      clearMockStorage();

      const importResult = await importLinks(exported);
      expect(importResult.success).toBe(true);
      expect(importResult.data!.created).toBe(2);

      // Verify preservation
      const reExport = await exportLinks();
      const reCustom = reExport.data!.find(e => e.slug === 'custom-one');
      const reAuto = reExport.data!.find(e => e.slug !== 'custom-one');
      expect(reCustom!.isCustom).toBe(true);
      expect(reAuto!.isCustom).toBe(false);
    });
  });

  // ============================================================
  // Scenario 3: Export with no links
  // ============================================================
  describe('export edge cases', () => {
    it('returns empty array when user has no links', async () => {
      authenticatedAs(USER_A);
      const { exportLinks } = await import('@/actions/settings');

      const result = await exportLinks();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  // ============================================================
  // Scenario 4: Import validation
  // ============================================================
  describe('import validation', () => {
    it('rejects non-array payload', async () => {
      authenticatedAs(USER_A);
      const { importLinks } = await import('@/actions/settings');

      const result = await importLinks('not-array' as unknown as ExportedLink[]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('数组');
    });

    it('rejects empty array', async () => {
      authenticatedAs(USER_A);
      const { importLinks } = await import('@/actions/settings');

      const result = await importLinks([]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('空');
    });

    it('rejects entry missing originalUrl', async () => {
      authenticatedAs(USER_A);
      const { importLinks } = await import('@/actions/settings');

      const result = await importLinks([
        { slug: 'test', isCustom: false, clicks: 0, createdAt: '2026-01-01T00:00:00Z' } as unknown as ExportedLink,
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('originalUrl');
    });

    it('rejects entry missing slug', async () => {
      authenticatedAs(USER_A);
      const { importLinks } = await import('@/actions/settings');

      const result = await importLinks([
        { originalUrl: 'https://example.com', isCustom: false, clicks: 0, createdAt: '2026-01-01T00:00:00Z' } as unknown as ExportedLink,
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('slug');
    });

    it('rejects entry with invalid URL', async () => {
      authenticatedAs(USER_A);
      const { importLinks } = await import('@/actions/settings');

      const result = await importLinks([
        makeExportedLink({ originalUrl: 'not-a-url', slug: 'bad' }),
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('URL');
    });
  });

  // ============================================================
  // Scenario 5: Import with duplicate slugs (partial success)
  // ============================================================
  describe('import with existing slugs', () => {
    it('skips links whose slugs already exist', async () => {
      authenticatedAs(USER_A);
      const { importLinks, exportLinks } = await import('@/actions/settings');

      // Pre-seed a link with slug "existing"
      await seedLink('https://original.com', { customSlug: 'existing' });

      // Import payload with the same slug and a new one
      const result = await importLinks([
        makeExportedLink({ slug: 'existing', originalUrl: 'https://different.com' }),
        makeExportedLink({ slug: 'brand-new', originalUrl: 'https://brand-new.com' }),
      ]);

      expect(result.success).toBe(true);
      expect(result.data!.created).toBe(1);
      expect(result.data!.skipped).toBe(1);

      // Verify the original link was not overwritten
      const allLinks = await exportLinks();
      const existingLink = allLinks.data!.find(e => e.slug === 'existing');
      expect(existingLink!.originalUrl).toBe('https://original.com');

      // Verify the new link was created
      const newLink = allLinks.data!.find(e => e.slug === 'brand-new');
      expect(newLink).toBeDefined();
      expect(newLink!.originalUrl).toBe('https://brand-new.com');
    });

    it('imports all when no duplicates exist', async () => {
      authenticatedAs(USER_A);
      const { importLinks } = await import('@/actions/settings');

      const result = await importLinks([
        makeExportedLink({ slug: 'a', originalUrl: 'https://a.com' }),
        makeExportedLink({ slug: 'b', originalUrl: 'https://b.com' }),
        makeExportedLink({ slug: 'c', originalUrl: 'https://c.com' }),
      ]);

      expect(result.success).toBe(true);
      expect(result.data!.created).toBe(3);
      expect(result.data!.skipped).toBe(0);
    });
  });

  // ============================================================
  // Scenario 6: Multi-user isolation
  // User A's export should NOT include User B's links.
  // ============================================================
  describe('multi-user isolation', () => {
    it('exports only the current user\'s links', async () => {
      const { exportLinks } = await import('@/actions/settings');

      // User A creates links
      authenticatedAs(USER_A);
      await seedLink('https://a-link.com', { customSlug: 'a-slug' });

      // User B creates links
      authenticatedAs(USER_B);
      await seedLink('https://b-link.com', { customSlug: 'b-slug' });

      // User A exports — should only see their own
      authenticatedAs(USER_A);
      const aExport = await exportLinks();
      expect(aExport.success).toBe(true);
      expect(aExport.data).toHaveLength(1);
      expect(aExport.data![0]!.slug).toBe('a-slug');
      expect(aExport.data![0]!.originalUrl).toBe('https://a-link.com');

      // User B exports — should only see their own
      authenticatedAs(USER_B);
      const bExport = await exportLinks();
      expect(bExport.success).toBe(true);
      expect(bExport.data).toHaveLength(1);
      expect(bExport.data![0]!.slug).toBe('b-slug');
    });

    it('import does not affect other user\'s links', async () => {
      const { importLinks, exportLinks } = await import('@/actions/settings');

      // User A creates a link
      authenticatedAs(USER_A);
      await seedLink('https://a-only.com', { customSlug: 'a-only' });

      // User B imports a link
      authenticatedAs(USER_B);
      const importResult = await importLinks([
        makeExportedLink({ slug: 'b-imported', originalUrl: 'https://b-imported.com' }),
      ]);
      expect(importResult.success).toBe(true);

      // User A's links are untouched
      authenticatedAs(USER_A);
      const aExport = await exportLinks();
      expect(aExport.data).toHaveLength(1);
      expect(aExport.data![0]!.slug).toBe('a-only');

      // User B sees only their imported link
      authenticatedAs(USER_B);
      const bExport = await exportLinks();
      expect(bExport.data).toHaveLength(1);
      expect(bExport.data![0]!.slug).toBe('b-imported');
    });
  });

  // ============================================================
  // Scenario 7: Preview style lifecycle
  // ============================================================
  describe('preview style', () => {
    it('returns default "favicon" when no preference set', async () => {
      authenticatedAs(USER_A);
      const { getPreviewStyle } = await import('@/actions/settings');

      const result = await getPreviewStyle();

      expect(result.success).toBe(true);
      expect(result.data).toBe('favicon');
    });

    it('updates to "screenshot" and persists', async () => {
      authenticatedAs(USER_A);
      const { getPreviewStyle, updatePreviewStyle } = await import('@/actions/settings');

      // Update
      const updateResult = await updatePreviewStyle('screenshot');
      expect(updateResult.success).toBe(true);
      expect(updateResult.data).toBe('screenshot');

      // Read back
      const getResult = await getPreviewStyle();
      expect(getResult.success).toBe(true);
      expect(getResult.data).toBe('screenshot');
    });

    it('switches back from "screenshot" to "favicon"', async () => {
      authenticatedAs(USER_A);
      const { getPreviewStyle, updatePreviewStyle } = await import('@/actions/settings');

      // Set to screenshot
      await updatePreviewStyle('screenshot');

      // Switch back
      const updateResult = await updatePreviewStyle('favicon');
      expect(updateResult.success).toBe(true);
      expect(updateResult.data).toBe('favicon');

      // Verify
      const getResult = await getPreviewStyle();
      expect(getResult.data).toBe('favicon');
    });

    it('normalizes invalid value to default "favicon"', async () => {
      authenticatedAs(USER_A);
      const { getPreviewStyle, updatePreviewStyle } = await import('@/actions/settings');

      const updateResult = await updatePreviewStyle('invalid-garbage');
      expect(updateResult.success).toBe(true);
      expect(updateResult.data).toBe('favicon');

      const getResult = await getPreviewStyle();
      expect(getResult.data).toBe('favicon');
    });

    it('isolates preview style per user', async () => {
      const { getPreviewStyle, updatePreviewStyle } = await import('@/actions/settings');

      // User A sets screenshot
      authenticatedAs(USER_A);
      await updatePreviewStyle('screenshot');

      // User B still has default
      authenticatedAs(USER_B);
      const bResult = await getPreviewStyle();
      expect(bResult.data).toBe('favicon');

      // User A still has screenshot
      authenticatedAs(USER_A);
      const aResult = await getPreviewStyle();
      expect(aResult.data).toBe('screenshot');
    });
  });

  // ============================================================
  // Scenario 8: Import with optional field defaults
  // Fields like isCustom, clicks should get sensible defaults
  // when omitted in the payload.
  // ============================================================
  describe('import field defaults', () => {
    it('defaults isCustom to false and clicks to 0 when omitted', async () => {
      authenticatedAs(USER_A);
      const { importLinks, exportLinks } = await import('@/actions/settings');

      // Import with minimal payload (only required fields)
      const result = await importLinks([
        { originalUrl: 'https://minimal.com', slug: 'minimal' } as unknown as ExportedLink,
      ]);

      expect(result.success).toBe(true);
      expect(result.data!.created).toBe(1);

      // Verify defaults
      const exported = await exportLinks();
      const link = exported.data!.find(e => e.slug === 'minimal');
      expect(link).toBeDefined();
      expect(link!.isCustom).toBe(false);
      expect(link!.clicks).toBe(0);
    });

    it('preserves custom isCustom and clicks values', async () => {
      authenticatedAs(USER_A);
      const { importLinks, exportLinks } = await import('@/actions/settings');

      const result = await importLinks([
        makeExportedLink({ slug: 'custom-import', isCustom: true, clicks: 42 }),
      ]);

      expect(result.success).toBe(true);
      expect(result.data!.created).toBe(1);

      const exported = await exportLinks();
      const link = exported.data!.find(e => e.slug === 'custom-import');
      expect(link!.isCustom).toBe(true);
      expect(link!.clicks).toBe(42);
    });
  });

  // ============================================================
  // Scenario 9: Bulk import stress test
  // ============================================================
  describe('bulk import', () => {
    it('handles importing 20 links at once', async () => {
      authenticatedAs(USER_A);
      const { importLinks, exportLinks } = await import('@/actions/settings');

      const bulk = Array.from({ length: 20 }, (_, i) =>
        makeExportedLink({
          slug: `bulk-${i}`,
          originalUrl: `https://bulk-${i}.example.com`,
        }),
      );

      const result = await importLinks(bulk);

      expect(result.success).toBe(true);
      expect(result.data!.created).toBe(20);
      expect(result.data!.skipped).toBe(0);

      // Verify all 20 exist
      const exported = await exportLinks();
      expect(exported.data).toHaveLength(20);
    });
  });
});
