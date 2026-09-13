import { ConnectorError } from "./core.js";

export function isPublicAddress(address: string) {
  if (address.includes(":")) {
    // Accept global IPv6 unicast only; exclude documentation and transition ranges.
    if (!/^[23][a-f0-9]{3}:/i.test(address) || /^200[12]:/i.test(address)) return false;
    try {
      return new URL(`https://[${address}]/`).hostname.startsWith("[");
    } catch {
      return false;
    }
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return false;
  const octets = address.split(".").map(Number);
  if (octets.some((n) => n > 255)) return false;
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && ([18, 19].includes(b) || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export async function assertPublicMediaDns(
  host: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  if (!["video.twimg.com", "pbs.twimg.com"].includes(host))
    throw new ConnectorError("unsafe_media_address");
  const bounded = AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]);
  let count = 0;
  // The proxy may supply fake local DNS. Check the fixed CDN's public DNS over authenticated HTTPS.
  // This is a preflight, not general-purpose DNS pinning; arbitrary/user-controlled hosts stay forbidden.
  for (const type of ["A", "AAAA"]) {
    let records: unknown;
    try {
      const response = await fetcher(
        `https://cloudflare-dns.com/dns-query?name=${host}&type=${type}`,
        {
          headers: { Accept: "application/dns-json" },
          redirect: "manual",
          signal: bounded,
        },
      );
      if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
        await response.body?.cancel();
        throw new Error();
      }
      records = JSON.parse(new TextDecoder().decode(await readBytes(response, 16_384)));
    } catch {
      throw new ConnectorError("media_dns_unavailable");
    }
    if (!records || typeof records !== "object" || !("Status" in records) || records.Status !== 0)
      throw new ConnectorError("media_dns_unavailable");
    const answers = "Answer" in records && Array.isArray(records.Answer) ? records.Answer : [];
    for (const answer of answers) {
      if (![1, 28].includes(answer.type)) continue;
      if (typeof answer.data !== "string" || !isPublicAddress(answer.data))
        throw new ConnectorError("unsafe_media_address");
      count++;
    }
  }
  if (!count) throw new ConnectorError("media_dns_unavailable");
}

async function readBytes(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) throw new ConnectorError("media_dns_unavailable");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new ConnectorError("media_dns_unavailable");
      parts.push(value);
    }
    return Buffer.concat(parts);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
