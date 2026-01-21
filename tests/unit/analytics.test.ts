import { describe, it, expect } from 'vitest';
import {
  parseDevice,
  parseBrowser,
  parseOS,
  extractClickMetadata,
  buildRecordClickUrl,
} from '@/lib/analytics';

describe('parseDevice', () => {
  it('should detect mobile devices', () => {
    expect(parseDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)')).toBe('mobile');
    expect(parseDevice('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36')).toBe('mobile');
    expect(parseDevice('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)')).toBe('mobile');
  });

  it('should detect tablets', () => {
    expect(parseDevice('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe('tablet');
    expect(parseDevice('Mozilla/5.0 (Linux; Android 12; SM-T870) AppleWebKit/537.36')).toBe('tablet');
  });

  it('should detect desktop devices', () => {
    expect(parseDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('desktop');
    expect(parseDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')).toBe('desktop');
    expect(parseDevice('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')).toBe('desktop');
  });

  it('should return unknown for unrecognized UAs', () => {
    expect(parseDevice('')).toBe('unknown');
    expect(parseDevice('curl/7.64.1')).toBe('unknown');
  });
});

describe('parseBrowser', () => {
  it('should detect Chrome', () => {
    expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')).toBe('Chrome');
  });

  it('should detect Safari', () => {
    expect(parseBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')).toBe('Safari');
  });

  it('should detect Firefox', () => {
    expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0')).toBe('Firefox');
  });

  it('should detect Edge', () => {
    expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0')).toBe('Edge');
  });

  it('should detect Opera', () => {
    expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0')).toBe('Opera');
  });

  it('should return Unknown for unrecognized browsers', () => {
    expect(parseBrowser('')).toBe('Unknown');
    expect(parseBrowser('curl/7.64.1')).toBe('Unknown');
  });
});

describe('parseOS', () => {
  it('should detect Windows versions', () => {
    expect(parseOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows 10');
    expect(parseOS('Mozilla/5.0 (Windows NT 6.1; Win64; x64)')).toBe('Windows 7');
    expect(parseOS('Mozilla/5.0 (Windows NT 6.3; Win64; x64)')).toBe('Windows 8.1');
  });

  it('should detect macOS', () => {
    expect(parseOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macOS');
  });

  it('should detect iOS', () => {
    expect(parseOS('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)')).toBe('iOS');
    expect(parseOS('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe('iOS');
  });

  it('should detect Android', () => {
    expect(parseOS('Mozilla/5.0 (Linux; Android 13; Pixel 7)')).toBe('Android');
  });

  it('should detect Linux', () => {
    expect(parseOS('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')).toBe('Linux');
  });

  it('should detect Chrome OS', () => {
    expect(parseOS('Mozilla/5.0 (X11; CrOS x86_64 15359.58.0)')).toBe('Chrome OS');
  });

  it('should return Unknown for unrecognized OS', () => {
    expect(parseOS('')).toBe('Unknown');
    expect(parseOS('curl/7.64.1')).toBe('Unknown');
  });
});

describe('extractClickMetadata', () => {
  it('should extract all metadata from headers', () => {
    const headers = new Headers({
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'x-vercel-ip-country': 'US',
      'x-vercel-ip-city': 'San Francisco',
      'referer': 'https://google.com',
    });

    const metadata = extractClickMetadata(headers);

    expect(metadata.device).toBe('desktop');
    expect(metadata.browser).toBe('Chrome');
    expect(metadata.os).toBe('macOS');
    expect(metadata.country).toBe('US');
    expect(metadata.city).toBe('San Francisco');
    expect(metadata.referer).toBe('https://google.com');
  });

  it('should handle missing headers gracefully', () => {
    const headers = new Headers();
    const metadata = extractClickMetadata(headers);

    expect(metadata.device).toBe('unknown');
    expect(metadata.browser).toBe('Unknown');
    expect(metadata.os).toBe('Unknown');
    expect(metadata.country).toBeNull();
    expect(metadata.city).toBeNull();
    expect(metadata.referer).toBeNull();
  });
});

describe('buildRecordClickUrl', () => {
  it('should build URL with all parameters', () => {
    const metadata = {
      device: 'desktop' as const,
      browser: 'Chrome',
      os: 'macOS',
      country: 'US',
      city: 'San Francisco',
      referer: 'https://google.com',
    };

    const url = buildRecordClickUrl('https://zhe.to', 123, metadata);
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/api/record-click');
    expect(parsed.searchParams.get('linkId')).toBe('123');
    expect(parsed.searchParams.get('device')).toBe('desktop');
    expect(parsed.searchParams.get('browser')).toBe('Chrome');
    expect(parsed.searchParams.get('os')).toBe('macOS');
    expect(parsed.searchParams.get('country')).toBe('US');
    expect(parsed.searchParams.get('city')).toBe('San Francisco');
    expect(parsed.searchParams.get('referer')).toBe('https://google.com');
  });

  it('should handle null values', () => {
    const metadata = {
      device: 'unknown' as const,
      browser: 'Unknown',
      os: 'Unknown',
      country: null,
      city: null,
      referer: null,
    };

    const url = buildRecordClickUrl('https://zhe.to', 456, metadata);
    const parsed = new URL(url);

    expect(parsed.searchParams.get('linkId')).toBe('456');
    expect(parsed.searchParams.has('country')).toBe(false);
    expect(parsed.searchParams.has('city')).toBe(false);
    expect(parsed.searchParams.has('referer')).toBe(false);
  });
});
