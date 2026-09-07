import { describe, expect, it } from "vitest";
import { getAppHeaderTrail } from "@/components/breadcrumbs";

describe("getAppHeaderTrail", () => {
  it("keeps group landings as the current page without a parent crumb", () => {
    expect(getAppHeaderTrail("/dashboard")).toEqual({
      breadcrumbs: [],
      title: "链接管理",
    });
    expect(getAppHeaderTrail("/dashboard/overview")).toEqual({
      breadcrumbs: [],
      title: "概览",
    });
  });

  it("nests sibling pages under a clickable group landing", () => {
    expect(getAppHeaderTrail("/dashboard/ideas")).toEqual({
      breadcrumbs: [{ href: "/dashboard/overview", label: "概览" }],
      title: "想法",
    });
  });

  it("uses a non-clickable group label when the group has no page", () => {
    expect(getAppHeaderTrail("/dashboard/uploads")).toEqual({
      breadcrumbs: [{ label: "工具" }],
      title: "文件上传",
    });
    expect(getAppHeaderTrail("/dashboard/settings/ai")).toEqual({
      breadcrumbs: [{ label: "设置" }],
      title: "AI",
    });
  });

  it("nests the idea editor under 概览 and 想法", () => {
    expect(getAppHeaderTrail("/dashboard/ideas/3")).toEqual({
      breadcrumbs: [
        { href: "/dashboard/overview", label: "概览" },
        { href: "/dashboard/ideas", label: "想法" },
      ],
      title: "编辑想法",
    });
  });

  it("nests Inbox under 链接管理", () => {
    expect(getAppHeaderTrail("/dashboard", "uncategorized")).toEqual({
      breadcrumbs: [{ href: "/dashboard", label: "链接管理" }],
      title: "Inbox",
    });
  });
});
