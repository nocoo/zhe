/** Route-to-label mapping for the AppHeader current-page title. */
const ROUTE_LABELS: Record<string, string> = {
  "/dashboard/overview": "概览",
  "/dashboard/ideas": "想法",
  "/dashboard/todos": "待办",
  "/dashboard/uploads": "文件上传",
  "/dashboard/backy": "Backy",
  "/dashboard/xray": "Xray",
  "/dashboard/settings/ai": "AI",
  "/dashboard/tags": "标签",
  "/dashboard/storage": "存储管理",
  "/dashboard/data-management": "数据管理",
  "/dashboard/webhook": "Webhook",
  "/dashboard/api-keys": "API Keys",
};

/** Match /dashboard/ideas/:id (numeric id) */
const IDEA_EDIT_PATTERN = /^\/dashboard\/ideas\/\d+$/;

export function getAppHeaderTrail(pathname: string): {
  breadcrumbs: { href: string; label: string }[];
  title: string;
} {
  if (IDEA_EDIT_PATTERN.test(pathname)) {
    return { breadcrumbs: [{ href: "/dashboard/ideas", label: "想法" }], title: "编辑想法" };
  }
  if (pathname === "/dashboard") {
    return { breadcrumbs: [], title: "链接管理" };
  }
  return {
    breadcrumbs: [],
    title: ROUTE_LABELS[pathname] ?? "链接管理",
  };
}
