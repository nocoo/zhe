import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock url-metadata before importing the module under test
const mockUrlMetadata = vi.fn();
vi.mock('url-metadata', () => ({
  default: (...args: unknown[]) => mockUrlMetadata(...args),
}));

import { fetchMetadata, type LinkMetadata } from '@/lib/metadata';

describe('lib/metadata — fetchMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Happy path --------------------------------------------------------

  it('extracts title, description, and favicon from metadata', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: 'Example Site',
      description: 'An example website',
      favicons: [{ href: 'https://example.com/favicon.ico' }],
    });

    const result = await fetchMetadata('https://example.com');

    expect(result).toEqual<LinkMetadata>({
      title: 'Example Site',
      description: 'An example website',
      favicon: 'https://example.com/favicon.ico',
    });
  });

  it('prefers og:title over title when title is empty', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: '',
      'og:title': 'OG Title',
      description: 'Desc',
      favicons: [],
    });

    const result = await fetchMetadata('https://example.com');

    expect(result.title).toBe('OG Title');
  });

  it('prefers og:description over description when description is empty', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: 'Title',
      description: '',
      'og:description': 'OG Description',
      favicons: [],
    });

    const result = await fetchMetadata('https://example.com');

    expect(result.description).toBe('OG Description');
  });

  it('falls back to origin/favicon.ico when no favicons in metadata', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: 'Title',
      description: 'Desc',
      favicons: [],
    });

    const result = await fetchMetadata('https://example.com/some/page');

    expect(result.favicon).toBe('https://example.com/favicon.ico');
  });

  it('resolves relative favicon href to absolute URL', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: 'Title',
      description: 'Desc',
      favicons: [{ href: '/static/icon.png' }],
    });

    const result = await fetchMetadata('https://example.com/some/page');

    expect(result.favicon).toBe('https://example.com/static/icon.png');
  });

  it('handles favicon with protocol-relative URL', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: 'Title',
      description: 'Desc',
      favicons: [{ href: '//cdn.example.com/icon.png' }],
    });

    const result = await fetchMetadata('https://example.com');

    expect(result.favicon).toBe('https://cdn.example.com/icon.png');
  });

  // ---- Edge cases --------------------------------------------------------

  it('returns null fields when metadata has no title/description', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: '',
      description: '',
      favicons: [],
    });

    const result = await fetchMetadata('https://example.com');

    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    // favicon still falls back to /favicon.ico
    expect(result.favicon).toBe('https://example.com/favicon.ico');
  });

  it('trims whitespace from title and description', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: '  Spaced Title  ',
      description: '\n Tabbed Desc \t',
      favicons: [],
    });

    const result = await fetchMetadata('https://example.com');

    expect(result.title).toBe('Spaced Title');
    expect(result.description).toBe('Tabbed Desc');
  });

  it('handles missing favicons array gracefully', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: 'Title',
      description: 'Desc',
    });

    const result = await fetchMetadata('https://example.com');

    expect(result.favicon).toBe('https://example.com/favicon.ico');
  });

  // ---- Failure / degradation ---------------------------------------------

  it('returns all-null metadata when url-metadata throws', async () => {
    mockUrlMetadata.mockRejectedValue(new Error('Network timeout'));

    const result = await fetchMetadata('https://unreachable.example.com');

    expect(result).toEqual<LinkMetadata>({
      title: null,
      description: null,
      favicon: null,
    });
  });

  it('returns all-null metadata when url-metadata throws a non-Error', async () => {
    mockUrlMetadata.mockRejectedValue('string error');

    const result = await fetchMetadata('https://unreachable.example.com');

    expect(result).toEqual<LinkMetadata>({
      title: null,
      description: null,
      favicon: null,
    });
  });

  it('passes timeout option to url-metadata', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: 'Title',
      description: 'Desc',
      favicons: [],
    });

    await fetchMetadata('https://example.com');

    expect(mockUrlMetadata).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it('skips favicons with empty href', async () => {
    mockUrlMetadata.mockResolvedValue({
      title: 'Title',
      description: 'Desc',
      favicons: [{ href: '' }, { href: 'https://example.com/real-icon.png' }],
    });

    const result = await fetchMetadata('https://example.com');

    expect(result.favicon).toBe('https://example.com/real-icon.png');
  });

  it('truncates extremely long title', async () => {
    const longTitle = 'A'.repeat(1000);
    mockUrlMetadata.mockResolvedValue({
      title: longTitle,
      description: 'Desc',
      favicons: [],
    });

    const result = await fetchMetadata('https://example.com');

    expect(result.title!.length).toBeLessThanOrEqual(512);
  });

  it('truncates extremely long description', async () => {
    const longDesc = 'B'.repeat(2000);
    mockUrlMetadata.mockResolvedValue({
      title: 'Title',
      description: longDesc,
      favicons: [],
    });

    const result = await fetchMetadata('https://example.com');

    expect(result.description!.length).toBeLessThanOrEqual(1024);
  });
});
