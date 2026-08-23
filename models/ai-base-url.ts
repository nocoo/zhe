import { promises as dns } from "node:dns";
import { BlockList, isIP, isIPv4 } from "node:net";

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.0.0.0", 24, "ipv4");
blocked.addSubnet("192.0.2.0", 24, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("198.18.0.0", 15, "ipv4");
blocked.addSubnet("198.51.100.0", 24, "ipv4");
blocked.addSubnet("203.0.113.0", 24, "ipv4");
blocked.addSubnet("224.0.0.0", 4, "ipv4");
blocked.addSubnet("240.0.0.0", 4, "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const IPV4_MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

export class UnsafeAiBaseUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeAiBaseUrlError";
  }
}

function mappedIpv4(hostname: string): string | null {
  const dotted = hostname.match(IPV4_MAPPED);
  if (dotted?.[1] && isIPv4(dotted[1])) return dotted[1];
  const hex = hostname.match(IPV4_MAPPED_HEX);
  if (!hex?.[1] || !hex[2]) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function isBlockedAiAddress(address: string): boolean {
  const ipv4 = isIPv4(address) ? address : mappedIpv4(address);
  if (ipv4) return blocked.check(ipv4, "ipv4");
  if (isIP(address) === 6) return blocked.check(address, "ipv6");
  return true;
}

export async function assertSafeAiBaseUrl(raw: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UnsafeAiBaseUrlError("Invalid URL");
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeAiBaseUrlError("URL must not include credentials");
  }
  if (parsed.protocol !== "https:") {
    throw new UnsafeAiBaseUrlError("URL must use https");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new UnsafeAiBaseUrlError("Hostname is not publicly routable");
  }

  if (isIP(hostname)) {
    if (isBlockedAiAddress(hostname)) {
      throw new UnsafeAiBaseUrlError("Address is not publicly routable");
    }
    return;
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new UnsafeAiBaseUrlError("Hostname did not resolve");
  }
  for (const record of records) {
    if (isBlockedAiAddress(record.address)) {
      throw new UnsafeAiBaseUrlError("Resolved address is not publicly routable");
    }
  }
}
