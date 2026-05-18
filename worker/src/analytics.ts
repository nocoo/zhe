// ─── Click analytics + user-agent parsing ────────────────────────────────────

import type { Env } from './types';

export function parseDevice(ua: string): string {
  if (!ua) return 'unknown';
  const lower = ua.toLowerCase();
  if (lower.includes('ipad') || lower.includes('tablet') ||
      (lower.includes('android') && !lower.includes('mobile'))) return 'tablet';
  if (lower.includes('mobile') || lower.includes('iphone') || lower.includes('ipod') ||
      lower.includes('android') || lower.includes('blackberry') || lower.includes('windows phone')) return 'mobile';
  if (lower.includes('windows') || lower.includes('macintosh') ||
      lower.includes('linux') || lower.includes('x11')) return 'desktop';
  return 'unknown';
}

export function parseBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  if (ua.includes('Chrome/') && !ua.includes('Chromium/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('MSIE') || ua.includes('Trident/')) return 'IE';
  if (ua.includes('Chromium/')) return 'Chromium';
  return 'Unknown';
}

export function parseOS(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Windows NT 10')) return 'Windows 10';
  if (ua.includes('Windows NT 6.3')) return 'Windows 8.1';
  if (ua.includes('Windows NT 6.2')) return 'Windows 8';
  if (ua.includes('Windows NT 6.1')) return 'Windows 7';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Macintosh') || ua.includes('Mac OS X')) return 'macOS';
  if (ua.includes('Linux') && !ua.includes('Android')) return 'Linux';
  if (ua.includes('CrOS')) return 'Chrome OS';
  return 'Unknown';
}

/**
 * Send a non-blocking click analytics event to the origin.
 * Uses ctx.waitUntil() so it doesn't delay the redirect response.
 */
export function recordClickAsync(
  ctx: ExecutionContext,
  env: Env,
  linkId: number,
  request: Request,
): void {
  const ua = request.headers.get('user-agent') || '';
  const cfCountry = request.headers.get('CF-IPCountry');
  const cfCity = (request as unknown as { cf?: { city?: string } }).cf?.city || null;

  const body = {
    linkId,
    device: parseDevice(ua),
    browser: parseBrowser(ua),
    os: parseOS(ua),
    country: cfCountry || null,
    city: cfCity,
    referer: request.headers.get('referer') || null,
    source: 'worker',
  };

  const originBase = env.ORIGIN_URL.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.WORKER_SECRET}`,
  };

  ctx.waitUntil(
    fetch(`${originBase}/api/record-click`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }).catch((err) => {
      console.error('Failed to record click:', err);
    }),
  );
}
