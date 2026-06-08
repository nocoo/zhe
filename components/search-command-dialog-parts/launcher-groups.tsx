"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  Moon,
  Sun,
  Monitor,
  type LucideIcon,
} from "lucide-react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import {
  PRE_LINK_NAV_GROUPS,
  FOLDER_NAV_ITEMS,
  OTHER_NAV_GROUPS,
} from "@/components/sidebar-parts/nav-config";

/**
 * Flatten the sidebar nav config into a single list of jump-to-page
 * destinations. Folder filters are included so the launcher can take
 * users straight to "全部链接" / "Inbox" too.
 */
export interface PageDestination {
  title: string;
  icon: React.ElementType;
  href: string;
  /** Lowercased searchable text — title + an English alias when set. */
  search: string;
}

const ENGLISH_ALIAS: Record<string, string> = {
  概览: "overview",
  想法: "ideas",
  全部链接: "all links",
  文件上传: "file upload uploads",
  存储管理: "storage",
  数据管理: "data management import export",
};

function aliasFor(title: string): string {
  const alias = ENGLISH_ALIAS[title];
  return alias ? `${title} ${alias}` : title;
}

export function buildPageDestinations(): PageDestination[] {
  const out: PageDestination[] = [];
  for (const group of PRE_LINK_NAV_GROUPS) {
    for (const item of group.items) {
      out.push({
        title: item.title,
        icon: item.icon,
        href: item.href,
        search: aliasFor(item.title).toLowerCase(),
      });
    }
  }
  for (const item of FOLDER_NAV_ITEMS) {
    out.push({
      title: item.title,
      icon: item.icon,
      href: item.href,
      search: aliasFor(item.title).toLowerCase(),
    });
  }
  for (const group of OTHER_NAV_GROUPS) {
    for (const item of group.items) {
      out.push({
        title: item.title,
        icon: item.icon,
        href: item.href,
        search: aliasFor(item.title).toLowerCase(),
      });
    }
  }
  return out;
}

/** Returns how many page destinations match the given query. Mirrors
 *  the logic inside PageJumpGroup so the host can decide whether to
 *  render a "no results" fallback. */
export function countPageMatches(query: string): number {
  const trimmed = query.trim().toLowerCase();
  const all = buildPageDestinations();
  if (!trimmed) return 0; // when empty, the "home" view shows a slice — don't claim a match
  return all.filter((p) => p.search.includes(trimmed)).length;
}

/** Returns how many actions match the given query. */
export function countActionMatches(actions: LauncherAction[], query: string): number {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return 0;
  return actions.filter((a) => a.search.includes(trimmed)).length;
}

interface PageJumpGroupProps {
  query: string;
  /** Maximum results to render when there's no query (the "home" view). */
  visibleWhenEmpty?: number;
  onNavigate: (href: string) => void;
}

/** Page jumps — shown in both the empty state ("home" view) and the
 *  active-query state (filtered by substring against title/alias). */
export function PageJumpGroup({
  query,
  visibleWhenEmpty = 5,
  onNavigate,
}: PageJumpGroupProps) {
  const all = useMemo(() => buildPageDestinations(), []);
  const trimmed = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!trimmed) return all.slice(0, visibleWhenEmpty);
    return all.filter((p) => p.search.includes(trimmed));
  }, [all, trimmed, visibleWhenEmpty]);

  if (matches.length === 0) return null;

  return (
    <CommandGroup heading={`页面 (${matches.length})`}>
      {matches.map((page) => {
        const Icon = page.icon;
        return (
          <CommandItem
            key={page.href}
            value={`page-${page.href}`}
            onSelect={() => onNavigate(page.href)}
            className="flex items-center gap-3"
          >
            <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <span className="flex-1">{page.title}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

// ── Actions ────────────────────────────────────────────────────────────────

export interface LauncherAction {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Lowercased searchable text — title + English alias. */
  search: string;
  run: () => void;
}

interface ActionGroupProps {
  query: string;
  actions: LauncherAction[];
  /** When true (no query), only show the first N actions. */
  visibleWhenEmpty?: number;
}

export function ActionGroup({
  query,
  actions,
  visibleWhenEmpty = 5,
}: ActionGroupProps) {
  const trimmed = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!trimmed) return actions.slice(0, visibleWhenEmpty);
    return actions.filter((a) => a.search.includes(trimmed));
  }, [actions, trimmed, visibleWhenEmpty]);

  if (matches.length === 0) return null;

  return (
    <CommandGroup heading={`动作 (${matches.length})`}>
      {matches.map((action) => {
        const Icon = action.icon;
        return (
          <CommandItem
            key={action.id}
            value={`action-${action.id}`}
            onSelect={action.run}
            className="flex items-center gap-3"
          >
            <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <span className="flex-1">{action.title}</span>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

/** Re-exported icons used by the default action list. */
export const ThemeIcons = { Moon, Sun, Monitor };
