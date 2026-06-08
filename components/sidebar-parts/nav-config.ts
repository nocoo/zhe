"use client";

import {
  BarChart3,
  Lightbulb,
  Link2,
  Inbox,
  FileUp,
  CloudUpload,
  Radar,
  HardDrive,
  Database,
  Webhook,
  Key,
} from "lucide-react";

/** Nav items for folder filtering — rendered as <Link>. */
export interface FolderNavItem {
  title: string;
  icon: React.ElementType;
  href: string;
  /** Value to match against ?folder param. null = no param (all links). */
  folderParam: string | null;
}

/** Static nav items rendered as <Link>. */
export interface StaticNavItem {
  title: string;
  icon: React.ElementType;
  href: string;
  /** Optional small label shown after the title (e.g. "Legacy"). */
  badge?: string;
}

export interface NavGroup {
  label: string;
  items: StaticNavItem[];
}

export const FOLDER_NAV_ITEMS: FolderNavItem[] = [
  { title: "全部链接", icon: Link2, href: "/dashboard", folderParam: null },
  {
    title: "Inbox",
    icon: Inbox,
    href: "/dashboard?folder=uncategorized",
    folderParam: "uncategorized",
  },
];

/** Nav groups rendered ABOVE the 链接管理 section. */
export const PRE_LINK_NAV_GROUPS: NavGroup[] = [
  {
    label: "概览",
    items: [
      { title: "概览", icon: BarChart3, href: "/dashboard/overview" },
      { title: "想法", icon: Lightbulb, href: "/dashboard/ideas" },
    ],
  },
];

/** Nav groups rendered BELOW the 链接管理 section. */
export const OTHER_NAV_GROUPS: NavGroup[] = [
  {
    label: "工具",
    items: [
      { title: "文件上传", icon: FileUp, href: "/dashboard/uploads" },
      { title: "Backy", icon: CloudUpload, href: "/dashboard/backy" },
      { title: "Xray", icon: Radar, href: "/dashboard/xray" },
    ],
  },
  {
    label: "集成",
    items: [
      { title: "API Keys", icon: Key, href: "/dashboard/api-keys" },
      { title: "Webhook", icon: Webhook, href: "/dashboard/webhook", badge: "Legacy" },
    ],
  },
  {
    label: "设置",
    items: [
      { title: "存储管理", icon: HardDrive, href: "/dashboard/storage" },
      { title: "数据管理", icon: Database, href: "/dashboard/data-management" },
    ],
  },
];
