import { ConnectorError, verifySignature } from "./core.ts";
import { isPublicAddress } from "./dns.ts";
import { getSpecialSource } from "./sources.ts";

// Desktop layout at 2× DPR, downsampled to cover an 800 CSS px Retina preview.
export const SCREENSHOT_VIEWPORT = { width: 1280, height: 960, deviceScaleFactor: 2 };
export const SCREENSHOT_WIDTH = 1600;
export const SCREENSHOT_HEIGHT = 1200;
export const MAX_SCREENSHOT_BYTES = 512 * 1024;

export function screenshotTarget(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/\.+$/, "");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      getSpecialSource(raw) ||
      (!host.includes(".") && !host.startsWith("[")) ||
      /(?:^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host) ||
      ((host.startsWith("[") || /^[\d.]+$/.test(host)) &&
        !isPublicAddress(host.replace(/^\[|\]$/g, "")))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Verify the actual static WebP canvas, chunk boundaries and byte budget on both ends. */
export function validateScreenshot(bytes: Uint8Array): void {
  const invalid = () => {
    throw new ConnectorError("invalid_screenshot", 400);
  };
  if (bytes.length < 30 || bytes.length > MAX_SCREENSHOT_BYTES) invalid();
  verifySignature(bytes, "image/webp");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== bytes.length - 8) invalid();
  const text = new TextDecoder("ascii");
  let image = false;
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) invalid();
    const kind = text.decode(bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.length) invalid();
    let width: number | undefined;
    let height: number | undefined;
    if (kind === "VP8X") {
      if (size !== 10 || (view.getUint8(start) & 2) !== 0) invalid();
      width = (view.getUint32(start + 4, true) & 0xffffff) + 1;
      height = (view.getUint32(start + 6, true) >>> 8) + 1;
    } else if (kind === "VP8 ") {
      if (
        image ||
        size < 10 ||
        (view.getUint8(start) & 1) !== 0 ||
        view.getUint8(start + 3) !== 0x9d ||
        view.getUint8(start + 4) !== 1 ||
        view.getUint8(start + 5) !== 0x2a
      )
        invalid();
      width = view.getUint16(start + 6, true) & 0x3fff;
      height = view.getUint16(start + 8, true) & 0x3fff;
      image = true;
    } else if (["ANIM", "ANMF", "VP8L"].includes(kind)) invalid();
    if (width !== undefined && (width !== SCREENSHOT_WIDTH || height !== SCREENSHOT_HEIGHT))
      invalid();
    offset = start + size + (size % 2);
  }
  if (!image || offset !== bytes.length) invalid();
}
