"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDashboardLayoutViewModel } from "@/viewmodels/useDashboardLayoutViewModel";
import { DashboardServiceProvider } from "@/contexts/dashboard-service";
import { Menu, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { usePathname } from "next/navigation";
import type { Folder } from "@/models/types";

/** Route-to-title mapping for the dashboard header */
const PAGE_TITLES: Record<string, string> = {
  "/dashboard/overview": "概览",
  "/dashboard/uploads": "系统集成",
  "/dashboard/backy": "Backy",
  "/dashboard/xray": "Xray",
  "/dashboard/storage": "存储管理",
  "/dashboard/data-management": "数据管理",
  "/dashboard/webhook": "Webhook",
};

function usePageTitle(): string {
  const pathname = usePathname();
  return PAGE_TITLES[pathname] ?? "链接管理";
}

export interface DashboardShellProps {
  children: React.ReactNode;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  signOutAction: () => Promise<void>;
  initialFolders?: Folder[];
}

export function DashboardShell({
  children,
  user,
  signOutAction,
  initialFolders = [],
}: DashboardShellProps) {
  const { collapsed, isMobile, mobileOpen, toggleSidebar, closeMobileSidebar } =
    useDashboardLayoutViewModel();
  const pageTitle = usePageTitle();

  return (
    <DashboardServiceProvider initialFolders={initialFolders}>
      <TooltipProvider>
        <div className="flex min-h-screen w-full bg-background">
          {/* Desktop sidebar */}
          {!isMobile && (
            <AppSidebar
              collapsed={collapsed}
              onToggle={toggleSidebar}
              {...(user ? { user } : {})}
              signOutAction={signOutAction}
            />
          )}

          {/* Mobile sidebar — Sheet drawer with slide animation */}
          {isMobile && (
            <Sheet open={mobileOpen} onOpenChange={(open) => !open && closeMobileSidebar()}>
              <SheetContent side="left" className="w-[260px] p-0 border-0 [&>button:last-child]:hidden">
                <VisuallyHidden.Root>
                  <SheetTitle>Navigation</SheetTitle>
                </VisuallyHidden.Root>
                <AppSidebar
                  collapsed={false}
                  onToggle={closeMobileSidebar}
                  {...(user ? { user } : {})}
                  signOutAction={signOutAction}
                />
              </SheetContent>
            </Sheet>
          )}

          <main className="flex-1 flex flex-col min-h-screen min-w-0">
            {/* Header */}
            <header className="flex h-14 items-center justify-between px-4 md:px-6 shrink-0">
              <div className="flex items-center gap-3">
                {isMobile && (
                  <button
                    onClick={toggleSidebar}
                    aria-label="Open menu"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Menu className="h-5 w-5" strokeWidth={1.5} />
                  </button>
                )}
                <h1 className="text-lg md:text-xl font-semibold font-display text-foreground">
                  {pageTitle}
                </h1>
              </div>
              <div className="flex items-center gap-1">
                <a
                  href="https://github.com/nocoo/zhe"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="GitHub"
                >
                  <Github className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </a>
                <ThemeToggle />
              </div>
            </header>

            {/* Content panel — Basalt L1 rounded panel */}
            <div className={cn("flex-1 px-2 pb-2 md:px-3 md:pb-3")}>
              <div className="h-full rounded-island md:rounded-island bg-card p-3 md:p-5 overflow-y-auto">
                {children}
              </div>
            </div>
          </main>
        </div>
      </TooltipProvider>
    </DashboardServiceProvider>
  );
}
