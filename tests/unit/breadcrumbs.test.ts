import { describe, expect, it } from "vitest";
import { getAppHeaderTrail } from "@/components/breadcrumbs";

describe("getAppHeaderTrail", () => {
  it("uses the current page as a title, not a breadcrumb, on top-level routes", () => {
    expect(getAppHeaderTrail("/dashboard")).toEqual({
      breadcrumbs: [],
      title: "链接管理",
    });
    expect(getAppHeaderTrail("/dashboard/uploads")).toEqual({
      breadcrumbs: [],
      title: "文件上传",
    });
  });

  it("only links ancestors that have a real destination", () => {
    expect(getAppHeaderTrail("/dashboard/ideas/3")).toEqual({
      breadcrumbs: [{ href: "/dashboard/ideas", label: "想法" }],
      title: "编辑想法",
    });
  });
});
