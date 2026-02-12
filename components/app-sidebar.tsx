"use client";

import { Link2, FolderOpen, PanelLeft, LogOut, Search, Zap, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  title: string;
  icon: React.ElementType;
  href: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "链接管理",
    items: [
      { title: "全部链接", icon: Link2, href: "/dashboard" },
      { title: "未分类", icon: FolderOpen, href: "/dashboard?folder=uncategorized" },
    ],
  },
  {
    label: "图床",
    items: [
      { title: "图床", icon: ImageIcon, href: "/dashboard/uploads" },
    ],
  },
];

// Flat list for collapsed mode
const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  signOutAction: () => Promise<void>;
}

export function AppSidebar({
  collapsed,
  onToggle,
  user,
  signOutAction,
}: AppSidebarProps) {
  const pathname = usePathname();

  if (collapsed) {
    return (
      <aside className="flex h-screen w-[68px] shrink-0 flex-col items-center bg-background transition-all duration-300 ease-in-out overflow-hidden">
        <div className="flex h-14 items-center justify-center">
            <Zap className="h-5 w-5 text-primary" strokeWidth={1.5} />
        </div>

        <button
          onClick={onToggle}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
        >
          <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
          {NAV_ITEMS.map((item) => (
            <Tooltip key={item.href} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                    pathname === item.href
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {item.title}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        <div className="py-3 flex justify-center w-full">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Avatar className="h-9 w-9 cursor-pointer">
                {user?.image && <AvatarImage src={user.image} alt={user.name || "User"} />}
                <AvatarFallback className="text-xs">
                  {user?.name?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {user?.name || "User"}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col bg-background transition-all duration-300 ease-in-out overflow-hidden">
      {/* Header */}
      <div className="px-3 h-14 flex items-center">
        <div className="flex w-full items-center justify-between px-3">
          <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <span className="text-lg md:text-xl font-semibold text-foreground">
              ZHE.TO
            </span>
          </div>
          <button
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Search placeholder */}
      <div className="px-3 pb-1">
        <div className="flex w-full items-center gap-3 rounded-lg bg-secondary px-3 py-1.5">
          <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <span className="flex-1 text-left text-sm text-muted-foreground">
            搜索链接...
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto pt-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="px-3 mb-1">
            <div className="px-3 py-2.5">
              <span className="text-sm font-normal text-muted-foreground">
                {group.label}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
                    pathname === item.href
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 text-left">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            {user?.image && <AvatarImage src={user.image} alt={user.name || "User"} />}
            <AvatarFallback className="text-xs">
              {user?.name?.[0] || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
