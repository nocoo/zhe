// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolvePublicOrigin,
  resolvePublicOriginFromHeaders,
} from "@/lib/url";

const ENV_KEYS = ["TRUSTED_ORIGINS", "PUBLIC_ORIGIN"] as const;
type EnvKey = (typeof ENV_KEYS)[number];

describe("resolvePublicOrigin", () => {
  const saved: Partial<Record<EnvKey, string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      Reflect.deleteProperty(process.env, key);
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = saved[key];
    }
  });

  describe("without TRUSTED_ORIGINS (legacy behavior)", () => {
    it("returns origin from x-forwarded headers when both present", () => {
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("falls back to host header when x-forwarded-host is missing", () => {
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          host: "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("falls back to request.url origin when no forwarding headers", () => {
      const req = new Request("http://localhost:7006/api/link/create/abc");
      expect(resolvePublicOrigin(req)).toBe("http://localhost:7006");
    });

    it("falls back to request.url origin when only proto is set (no host headers)", () => {
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("http://0.0.0.0:7006");
    });

    it("handles Railway-style forwarded headers", () => {
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "zhe.to",
          host: "0.0.0.0:7006",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("prefers x-forwarded-host over host header", () => {
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "zhe.to",
          host: "internal.railway.app",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("prefers x-real-host over x-forwarded-host", () => {
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-real-host": "zhe.to",
          "x-forwarded-host": "origin.zhe.to",
          host: "0.0.0.0:7006",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("uses x-real-host even when x-forwarded-host is absent", () => {
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-real-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });
  });

  describe("with TRUSTED_ORIGINS allowlist", () => {
    it("accepts hosts present in the allowlist", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to, localhost:7006";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("matches allowlist entries case-insensitively", () => {
      process.env.TRUSTED_ORIGINS = "ZHE.TO";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("rejects a spoofed x-forwarded-host not in the allowlist and falls back to PUBLIC_ORIGIN", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      process.env.PUBLIC_ORIGIN = "https://zhe.to";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "attacker.example.com",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("rejects a spoofed x-real-host not in the allowlist", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      process.env.PUBLIC_ORIGIN = "https://zhe.to";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-real-host": "attacker.example.com",
          "x-forwarded-host": "zhe.to",
        },
      });
      // x-real-host is preferred and rejected -> fallback to PUBLIC_ORIGIN
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("treats host:port as distinct from host without port", () => {
      process.env.TRUSTED_ORIGINS = "localhost"; // missing :7006
      process.env.PUBLIC_ORIGIN = "https://safe.example.com";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "http",
          "x-forwarded-host": "localhost:7006",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://safe.example.com");
    });

    it("falls back to request.url origin when PUBLIC_ORIGIN is unset and host is untrusted", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      const req = new Request("http://localhost:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "attacker.example.com",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("http://localhost:7006");
    });

    it("strips trailing slashes from PUBLIC_ORIGIN fallback", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      process.env.PUBLIC_ORIGIN = "https://zhe.to/";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "attacker.example.com",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("ignores empty entries in the comma-separated list", () => {
      process.env.TRUSTED_ORIGINS = ",,zhe.to,,";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });
  });

  describe("x-forwarded-proto normalization", () => {
    it("rejects `javascript` scheme and falls back to PUBLIC_ORIGIN", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      process.env.PUBLIC_ORIGIN = "https://zhe.to";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "javascript",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("rejects `data` scheme even when host is allowlisted", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      process.env.PUBLIC_ORIGIN = "https://zhe.to";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "data",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("rejects an empty proto value", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      process.env.PUBLIC_ORIGIN = "https://zhe.to";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("accepts uppercase HTTPS and normalizes to lowercase", () => {
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "HTTPS",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("accepts the first segment of a comma-chained proto", () => {
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "https, http",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("rejects when first segment of comma-chain is invalid", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      process.env.PUBLIC_ORIGIN = "https://zhe.to";
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "javascript, https",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("tolerates whitespace around the proto value", () => {
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          "x-forwarded-proto": "  https  ",
          "x-forwarded-host": "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("https://zhe.to");
    });

    it("rejects an invalid proto in the headers helper even on a bare-host request", () => {
      // Headers-only helper must NOT silently coerce `javascript` to its
      // legacy `http` default — that would re-introduce the vulnerability.
      process.env.PUBLIC_ORIGIN = "https://zhe.to";
      const headers = new Headers({
        "x-forwarded-proto": "javascript",
        host: "zhe.to",
      });
      expect(resolvePublicOriginFromHeaders(headers)).toBe("https://zhe.to");
    });
  });

  describe("resolvePublicOriginFromHeaders", () => {
    it("works with a bare Headers-like object (no Request URL)", () => {
      const headers = new Headers({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "zhe.to",
      });
      expect(resolvePublicOriginFromHeaders(headers)).toBe("https://zhe.to");
    });

    it("returns PUBLIC_ORIGIN fallback when host is rejected", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      process.env.PUBLIC_ORIGIN = "https://zhe.to";
      const headers = new Headers({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "attacker.example.com",
      });
      expect(resolvePublicOriginFromHeaders(headers)).toBe("https://zhe.to");
    });

    it("returns empty string when neither headers nor PUBLIC_ORIGIN provide a value", () => {
      const headers = new Headers();
      expect(resolvePublicOriginFromHeaders(headers)).toBe("");
    });

    it("defaults to http when x-forwarded-proto is absent (legacy Server Action behavior)", () => {
      // Preserves the pre-refactor `proto || "http"` semantics so Server
      // Actions on bare-host requests still produce a usable origin instead
      // of dropping to the localhost guard.
      const headers = new Headers({
        host: "zhe.to",
      });
      expect(resolvePublicOriginFromHeaders(headers)).toBe("http://zhe.to");
    });

    it("uses the http default with a trusted host when TRUSTED_ORIGINS is set", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      const headers = new Headers({
        host: "zhe.to",
      });
      expect(resolvePublicOriginFromHeaders(headers)).toBe("http://zhe.to");
    });

    it("does NOT apply the http default when host is untrusted", () => {
      process.env.TRUSTED_ORIGINS = "zhe.to";
      process.env.PUBLIC_ORIGIN = "https://zhe.to";
      const headers = new Headers({
        host: "attacker.example.com",
      });
      expect(resolvePublicOriginFromHeaders(headers)).toBe("https://zhe.to");
    });

    it("does NOT default to http for a present-but-invalid proto", () => {
      // Absent header → default applies. Present-but-invalid header →
      // safe fallback path, no coercion.
      process.env.PUBLIC_ORIGIN = "https://zhe.to";
      const headers = new Headers({
        "x-forwarded-proto": "ftp",
        host: "zhe.to",
      });
      expect(resolvePublicOriginFromHeaders(headers)).toBe("https://zhe.to");
    });

    it("Request-based helper does NOT apply the http default (uses request.url instead)", () => {
      // Only the headers-only variant carries the legacy default; the
      // Request-based helper has a richer fallback (request.url origin).
      const req = new Request("http://0.0.0.0:7006/api/link/create/abc", {
        headers: {
          host: "zhe.to",
        },
      });
      expect(resolvePublicOrigin(req)).toBe("http://0.0.0.0:7006");
    });
  });
});
