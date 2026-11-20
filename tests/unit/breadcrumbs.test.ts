import { describe, expect, it } from "vitest";
import { getAppHeaderTrail } from "@/components/breadcrumbs";

describe("getAppHeaderTrail", () => {
  const overview = { href: "/dashboard/overview", label: "概览" };
  const linkManagement = { label: "链接管理" };
  const allLinks = { href: "/dashboard", label: "全部链接" };

  it("uses the links group without an overview prefix", () => {
    expect(getAppHeaderTrail("/dashboard/overview")).toEqual([{ label: "概览" }]);
    expect(getAppHeaderTrail("/dashboard")).toEqual([linkManagement, { label: "全部链接" }]);
  });

  it.each([
    ["/dashboard/x", "特殊来源", "X 收藏"],
    ["/dashboard/uploads", "工具", "文件上传"],
    ["/dashboard/webhook", "集成", "Webhook"],
    ["/dashboard/settings/ai", "设置", "AI"],
  ])("uses the sidebar group as a non-clickable ancestor for %s", (path, group, title) => {
    expect(getAppHeaderTrail(path)).toEqual([{ label: group }, { label: title }]);
  });

  it("keeps overview only for pages in its sidebar group", () => {
    expect(getAppHeaderTrail("/dashboard/ideas")).toEqual([overview, { label: "想法" }]);
    expect(getAppHeaderTrail("/dashboard/todos")).toEqual([overview, { label: "待办" }]);
    expect(getAppHeaderTrail("/dashboard/search")).toEqual([{ label: "搜索" }]);
    expect(getAppHeaderTrail("/dashboard/missing")).toEqual([{ label: "未找到页面" }]);
  });

  it("links the idea editor to the ideas list, but not to itself", () => {
    expect(getAppHeaderTrail("/dashboard/ideas/3")).toEqual([
      overview,
      { href: "/dashboard/ideas", label: "想法" },
      { label: "编辑想法" },
    ]);
  });

  it("adds folder names after the unfiltered links page", () => {
    expect(getAppHeaderTrail("/dashboard", "atlas", "Coastal atlas")).toEqual([
      linkManagement,
      allLinks,
      { label: "Coastal atlas" },
    ]);
    expect(getAppHeaderTrail("/dashboard", "uncategorized")).toEqual([
      linkManagement,
      allLinks,
      { label: "未分类" },
    ]);
    expect(getAppHeaderTrail("/dashboard", "unknown")).toEqual(getAppHeaderTrail("/dashboard"));
  });
});
