export type AppHeaderCrumb = {
  href?: string;
  label: string;
};

const PAGE_TRAILS: Record<string, { breadcrumbs: AppHeaderCrumb[]; title: string }> = {
  "/dashboard/overview": { breadcrumbs: [], title: "概览" },
  "/dashboard/ideas": {
    breadcrumbs: [{ href: "/dashboard/overview", label: "概览" }],
    title: "想法",
  },
  "/dashboard/todos": {
    breadcrumbs: [{ href: "/dashboard/overview", label: "概览" }],
    title: "待办",
  },
  "/dashboard": { breadcrumbs: [], title: "链接管理" },
  "/dashboard/uploads": { breadcrumbs: [{ label: "工具" }], title: "文件上传" },
  "/dashboard/backy": { breadcrumbs: [{ label: "工具" }], title: "Backy" },
  "/dashboard/xray": { breadcrumbs: [{ label: "工具" }], title: "Xray" },
  "/dashboard/api-keys": { breadcrumbs: [{ label: "集成" }], title: "API Keys" },
  "/dashboard/webhook": { breadcrumbs: [{ label: "集成" }], title: "Webhook" },
  "/dashboard/settings/ai": { breadcrumbs: [{ label: "设置" }], title: "AI" },
  "/dashboard/tags": { breadcrumbs: [{ label: "设置" }], title: "标签" },
  "/dashboard/storage": { breadcrumbs: [{ label: "设置" }], title: "存储管理" },
  "/dashboard/data-management": { breadcrumbs: [{ label: "设置" }], title: "数据管理" },
};

const IDEA_EDIT_PATTERN = /^\/dashboard\/ideas\/\d+$/;

export function getAppHeaderTrail(
  pathname: string,
  folder?: string | null,
): {
  breadcrumbs: AppHeaderCrumb[];
  title: string;
} {
  if (IDEA_EDIT_PATTERN.test(pathname)) {
    return {
      breadcrumbs: [
        { href: "/dashboard/overview", label: "概览" },
        { href: "/dashboard/ideas", label: "想法" },
      ],
      title: "编辑想法",
    };
  }
  if (pathname === "/dashboard" && folder === "uncategorized") {
    return {
      breadcrumbs: [{ href: "/dashboard", label: "链接管理" }],
      title: "Inbox",
    };
  }
  return PAGE_TRAILS[pathname] ?? { breadcrumbs: [], title: "链接管理" };
}
