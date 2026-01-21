/**
 * Analytics utilities for parsing user agent and extracting click metadata.
 */

export interface ClickMetadata {
  device: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  browser: string;
  os: string;
  country: string | null;
  city: string | null;
  referer: string | null;
}

/**
 * Parse device type from User-Agent string.
 */
export function parseDevice(ua: string): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (!ua) return 'unknown';
  
  const lowerUA = ua.toLowerCase();
  
  // Check for tablets first (some tablets include "mobile" in UA)
  if (
    lowerUA.includes('ipad') ||
    lowerUA.includes('tablet') ||
    (lowerUA.includes('android') && !lowerUA.includes('mobile'))
  ) {
    return 'tablet';
  }
  
  // Check for mobile devices
  if (
    lowerUA.includes('mobile') ||
    lowerUA.includes('iphone') ||
    lowerUA.includes('ipod') ||
    lowerUA.includes('android') ||
    lowerUA.includes('blackberry') ||
    lowerUA.includes('windows phone')
  ) {
    return 'mobile';
  }
  
  // Check for desktop indicators
  if (
    lowerUA.includes('windows') ||
    lowerUA.includes('macintosh') ||
    lowerUA.includes('linux') ||
    lowerUA.includes('x11')
  ) {
    return 'desktop';
  }
  
  return 'unknown';
}

/**
 * Parse browser name from User-Agent string.
 */
export function parseBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  
  // Order matters - check more specific patterns first
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  if (ua.includes('Chrome/') && !ua.includes('Chromium/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('MSIE') || ua.includes('Trident/')) return 'IE';
  if (ua.includes('Chromium/')) return 'Chromium';
  
  return 'Unknown';
}

/**
 * Parse OS name from User-Agent string.
 */
export function parseOS(ua: string): string {
  if (!ua) return 'Unknown';
  
  // iOS detection
  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) {
    return 'iOS';
  }
  
  // Android detection
  if (ua.includes('Android')) {
    return 'Android';
  }
  
  // Windows detection
  if (ua.includes('Windows NT 10')) return 'Windows 10';
  if (ua.includes('Windows NT 6.3')) return 'Windows 8.1';
  if (ua.includes('Windows NT 6.2')) return 'Windows 8';
  if (ua.includes('Windows NT 6.1')) return 'Windows 7';
  if (ua.includes('Windows')) return 'Windows';
  
  // macOS detection
  if (ua.includes('Macintosh') || ua.includes('Mac OS X')) {
    return 'macOS';
  }
  
  // Linux detection
  if (ua.includes('Linux') && !ua.includes('Android')) {
    return 'Linux';
  }
  
  // Chrome OS
  if (ua.includes('CrOS')) {
    return 'Chrome OS';
  }
  
  return 'Unknown';
}

/**
 * Extract click metadata from request headers.
 * Uses Vercel's geo headers for location data.
 */
export function extractClickMetadata(headers: Headers): ClickMetadata {
  const userAgent = headers.get('user-agent') || '';
  
  return {
    device: parseDevice(userAgent),
    browser: parseBrowser(userAgent),
    os: parseOS(userAgent),
    // Vercel provides these headers automatically
    country: headers.get('x-vercel-ip-country'),
    city: headers.get('x-vercel-ip-city'),
    referer: headers.get('referer'),
  };
}

/**
 * Build the record-click API URL with query parameters.
 */
export function buildRecordClickUrl(
  baseUrl: string,
  linkId: number,
  metadata: ClickMetadata
): string {
  const url = new URL('/api/record-click', baseUrl);
  url.searchParams.set('linkId', linkId.toString());
  
  if (metadata.device) url.searchParams.set('device', metadata.device);
  if (metadata.browser) url.searchParams.set('browser', metadata.browser);
  if (metadata.os) url.searchParams.set('os', metadata.os);
  if (metadata.country) url.searchParams.set('country', metadata.country);
  if (metadata.city) url.searchParams.set('city', metadata.city);
  if (metadata.referer) url.searchParams.set('referer', metadata.referer);
  
  return url.toString();
}
