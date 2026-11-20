import { getLinkCollectionTitle } from "@/models/links";
import { OTHER_NAV_GROUPS, PRE_LINK_NAV_GROUPS } from "./sidebar-parts/nav-config";

export type AppHeaderBreadcrumb = {
  href?: string;
  label: string;
};

const OVERVIEW = { label: "概览", href: "/dashboard/overview" };
const NAV_GROUPS = [...PRE_LINK_NAV_GROUPS, ...OTHER_NAV_GROUPS];

export function getAppHeaderTrail(
  pathname: string,
  folder?: string | null,
  folderName?: string,
): AppHeaderBreadcrumb[] {
  if (pathname === OVERVIEW.href) return [{ label: OVERVIEW.label }];
  if (pathname === "/dashboard") {
    const title = getLinkCollectionTitle(folder, folderName);
    const parents = [OVERVIEW, { label: "链接管理" }];
    if (folder === "uncategorized" || (folder && folderName)) {
      return [
        ...parents,
        { href: "/dashboard", label: getLinkCollectionTitle() },
        { label: title },
      ];
    }
    return [...parents, { label: title }];
  }
  if (pathname === "/dashboard/search") return [OVERVIEW, { label: "搜索" }];

  const editingIdea = /^\/dashboard\/ideas\/\d+$/.test(pathname);
  const destination = editingIdea ? "/dashboard/ideas" : pathname;
  for (const group of NAV_GROUPS) {
    const item = group.items.find(({ href }) => href === destination);
    if (!item) continue;
    const parents =
      group.label === OVERVIEW.label ? [OVERVIEW] : [OVERVIEW, { label: group.label }];
    return editingIdea
      ? [...parents, { href: item.href, label: item.title }, { label: "编辑想法" }]
      : [...parents, { label: item.title }];
  }
  return [OVERVIEW, { label: "未找到页面" }];
}
