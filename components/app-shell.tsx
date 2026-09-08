"use client";

import { Button, ContentIsland, Sheet, SheetContent, SheetTitle, ThemeToggle } from "@nocoo/basalt";
import { AppHeader } from "@nocoo/basalt/components/app-header";
import {
  AppMain,
  AppSkipLink,
  AppShell as BasaltAppShell,
} from "@nocoo/basalt/components/app-shell";
import { Menu } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getAppHeaderTrail } from "@/components/breadcrumbs";
import { GithubIcon } from "@/components/github-icon";
import { Sidebar } from "@/components/sidebar";
import { SidebarProvider, useSidebar } from "@/components/sidebar-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardServiceProvider } from "@/contexts/dashboard-service";
import type { Folder } from "@/models/types";

export interface AppShellProps {
  children: React.ReactNode;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  signOutAction: () => Promise<void>;
  initialFolders?: Folder[];
}

export function AppShell({ children, user, signOutAction, initialFolders = [] }: AppShellProps) {
  return (
    <DashboardServiceProvider initialFolders={initialFolders}>
      <TooltipProvider>
        <SidebarProvider>
          <AppShellInner user={user} signOutAction={signOutAction}>
            {children}
          </AppShellInner>
        </SidebarProvider>
      </TooltipProvider>
    </DashboardServiceProvider>
  );
}

function AppShellInner({
  children,
  user,
  signOutAction,
}: {
  children: React.ReactNode;
  user?: AppShellProps["user"];
  signOutAction: () => Promise<void>;
}) {
  const { isMobile, mobileOpen, setMobileOpen, toggle, closeMobileSidebar } = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname}?${searchParams.toString()}`;
  const { breadcrumbs, title } = getAppHeaderTrail(pathname, searchParams.get("folder"));

  useEffect(() => {
    if (locationKey) closeMobileSidebar();
  }, [locationKey, closeMobileSidebar]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const sidebar = <Sidebar {...(user ? { user } : {})} signOutAction={signOutAction} />;

  return (
    <BasaltAppShell>
      <AppSkipLink>Skip to main content</AppSkipLink>
      {!isMobile ? sidebar : null}
      {isMobile ? (
        <Sheet open={mobileOpen} onOpenChange={(open) => !open && setMobileOpen(false)}>
          <SheetContent
            side="left"
            className="w-[260px] max-w-[260px] border-0 bg-basalt-background p-0"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
      ) : null}
      <AppMain>
        <AppHeader
          leading={
            isMobile ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggle}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </Button>
            ) : null
          }
          breadcrumbs={breadcrumbs}
          title={title}
          actions={
            <>
              <Button variant="ghost" size="icon" asChild>
                <a
                  href="https://github.com/nocoo/zhe"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="GitHub"
                  aria-label="GitHub"
                >
                  <GithubIcon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </a>
              </Button>
              <ThemeToggle aria-label="切换主题" />
            </>
          }
        />
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3">
          <ContentIsland className="rounded-island">{children}</ContentIsland>
        </div>
      </AppMain>
    </BasaltAppShell>
  );
}
