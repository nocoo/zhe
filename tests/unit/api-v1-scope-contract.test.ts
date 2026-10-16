// @vitest-environment node

import { describe, expect, it } from "vitest";
import { API_SCOPES, type ApiScope } from "@/models/api-key";

/**
 * Static contract: every scope referenced by v1 routes must be declared in API_SCOPES.
 * Update this table when adding routes — it is the audit checklist for API tokens.
 */
const V1_ROUTE_SCOPES: ApiScope[] = [
  "links:read",
  "links:write",
  "folders:read",
  "folders:write",
  "tags:read",
  "tags:write",
  "uploads:read",
  "uploads:write",
  "ideas:read",
  "ideas:write",
  "todos:read",
  "todos:write",
  "connector:write",
];

describe("API v1 scope contract", () => {
  it("declares every route scope in API_SCOPES", () => {
    for (const scope of V1_ROUTE_SCOPES) {
      expect(API_SCOPES).toContain(scope);
    }
  });

  it("includes todos read/write scopes", () => {
    expect(API_SCOPES).toContain("todos:read");
    expect(API_SCOPES).toContain("todos:write");
  });
});
