import { describe, expect, it } from "vitest";
import { isStaticNavActive } from "@/components/sidebar-parts/nav-config";

describe("isStaticNavActive", () => {
  it("matches the exact href", () => {
    expect(isStaticNavActive("/dashboard/ideas", "/dashboard/ideas")).toBe(true);
  });

  it("matches nested editor routes", () => {
    expect(isStaticNavActive("/dashboard/ideas/3", "/dashboard/ideas")).toBe(true);
  });

  it("does not treat sibling routes as current", () => {
    expect(isStaticNavActive("/dashboard/ideas", "/dashboard/todos")).toBe(false);
    expect(isStaticNavActive("/dashboard/ideas-archive", "/dashboard/ideas")).toBe(false);
  });
});
